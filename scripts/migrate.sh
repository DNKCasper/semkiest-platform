#!/usr/bin/env bash
# =============================================================================
# migrate.sh — Run Prisma database migrations via an ECS Fargate task
#
# Executes the Prisma migration command (`prisma migrate deploy`) by launching
# a one-off ECS Fargate task that shares the same environment as the application.
# The script waits for the task to complete and exits non-zero if it fails.
#
# Required environment variables:
#   ENVIRONMENT                      — staging | production
#   ECS_CLUSTER                      — ECS cluster name
#   ECS_MIGRATION_TASK_DEFINITION    — Task definition family/ARN for migrations
#   ECS_MIGRATION_SUBNET             — Subnet ID for the Fargate task
#   ECS_MIGRATION_SECURITY_GROUP     — Security group ID for the Fargate task
#   AWS_REGION                       — AWS region
#
# Optional environment variables:
#   IMAGE_TAG                        — Image tag to override in the task def
#   ECR_REGISTRY                     — ECR registry URI (required if IMAGE_TAG set)
#   MIGRATION_TIMEOUT                — Seconds to wait for the task (default: 300)
#   MIGRATION_COMMAND                — Override migration command (default: prisma migrate deploy)
# =============================================================================

set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
error(){ echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2; }

require_env() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    error "Required environment variable '$var' is not set."
    exit 1
  fi
}

# ── Validate required inputs ─────────────────────────────────────────────────

require_env ENVIRONMENT
require_env ECS_CLUSTER
require_env ECS_MIGRATION_TASK_DEFINITION
require_env ECS_MIGRATION_SUBNET
require_env ECS_MIGRATION_SECURITY_GROUP
require_env AWS_REGION

MIGRATION_TIMEOUT="${MIGRATION_TIMEOUT:-300}"
MIGRATION_COMMAND="${MIGRATION_COMMAND:-prisma migrate deploy}"

log "=== Starting database migrations ==="
log "  Environment : ${ENVIRONMENT}"
log "  Cluster     : ${ECS_CLUSTER}"
log "  Task def    : ${ECS_MIGRATION_TASK_DEFINITION}"
log "  Command     : ${MIGRATION_COMMAND}"

# ── Optionally update the task definition image ───────────────────────────────

TASK_DEF_ARN="${ECS_MIGRATION_TASK_DEFINITION}"

if [[ -n "${IMAGE_TAG:-}" ]] && [[ -n "${ECR_REGISTRY:-}" ]]; then
  log "Updating migration task definition image to tag: ${IMAGE_TAG}"

  TASK_DEF_JSON=$(aws ecs describe-task-definition \
    --task-definition "${ECS_MIGRATION_TASK_DEFINITION}" \
    --region "${AWS_REGION}" \
    --query 'taskDefinition')

  NEW_TASK_DEF_JSON=$(echo "${TASK_DEF_JSON}" | python3 -c "
import json, sys

data = json.load(sys.stdin)
ecr_registry = '${ECR_REGISTRY}'
image_tag = '${IMAGE_TAG}'
environment = '${ENVIRONMENT}'

# Update the first container's image — migration tasks share the api image
for container in data.get('containerDefinitions', []):
    if 'api' in container['name'] or 'migration' in container['name']:
        # Reconstruct the image URI with the new tag
        parts = container['image'].rsplit(':', 1)
        container['image'] = f'{parts[0]}:{image_tag}'
        break

for field in ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes',
              'placementConstraints', 'compatibilities', 'registeredAt',
              'registeredBy', 'deregisteredAt']:
    data.pop(field, None)

print(json.dumps(data))
")

  TASK_DEF_ARN=$(echo "${NEW_TASK_DEF_JSON}" | aws ecs register-task-definition \
    --cli-input-json file:///dev/stdin \
    --region "${AWS_REGION}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

  log "Migration task definition updated: ${TASK_DEF_ARN}"
fi

# ── Launch the migration task ─────────────────────────────────────────────────

log "Launching ECS Fargate migration task..."

# Build the container overrides to run the migration command
OVERRIDES=$(python3 -c "
import json, sys

# Parse the task definition to get the first container name
" 2>/dev/null || true)

# Retrieve the container name from the task definition
CONTAINER_NAME=$(aws ecs describe-task-definition \
  --task-definition "${TASK_DEF_ARN}" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition.containerDefinitions[0].name' \
  --output text)

log "Using container: ${CONTAINER_NAME}"

TASK_ARN=$(aws ecs run-task \
  --cluster "${ECS_CLUSTER}" \
  --task-definition "${TASK_DEF_ARN}" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[${ECS_MIGRATION_SUBNET}],
    securityGroups=[${ECS_MIGRATION_SECURITY_GROUP}],
    assignPublicIp=DISABLED
  }" \
  --overrides "{
    \"containerOverrides\": [{
      \"name\": \"${CONTAINER_NAME}\",
      \"command\": [\"sh\", \"-c\", \"${MIGRATION_COMMAND}\"]
    }]
  }" \
  --region "${AWS_REGION}" \
  --query 'tasks[0].taskArn' \
  --output text)

if [[ -z "${TASK_ARN}" ]] || [[ "${TASK_ARN}" == "None" ]]; then
  error "Failed to launch migration ECS task."
  exit 1
fi

log "Migration task launched: ${TASK_ARN}"

# ── Wait for the task to complete ─────────────────────────────────────────────

log "Waiting for migration task to complete (timeout: ${MIGRATION_TIMEOUT}s)..."

if ! timeout "${MIGRATION_TIMEOUT}" aws ecs wait tasks-stopped \
    --cluster "${ECS_CLUSTER}" \
    --tasks "${TASK_ARN}" \
    --region "${AWS_REGION}"; then
  error "Migration task did not complete within ${MIGRATION_TIMEOUT} seconds."
  log "Stopping task ${TASK_ARN}..."
  aws ecs stop-task \
    --cluster "${ECS_CLUSTER}" \
    --task "${TASK_ARN}" \
    --reason "Migration timeout — stopped by deploy pipeline" \
    --region "${AWS_REGION}" > /dev/null || true
  exit 1
fi

# ── Check the exit code ───────────────────────────────────────────────────────

EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "${ECS_CLUSTER}" \
  --tasks "${TASK_ARN}" \
  --region "${AWS_REGION}" \
  --query "tasks[0].containers[?name=='${CONTAINER_NAME}'].exitCode | [0]" \
  --output text)

STOP_REASON=$(aws ecs describe-tasks \
  --cluster "${ECS_CLUSTER}" \
  --tasks "${TASK_ARN}" \
  --region "${AWS_REGION}" \
  --query 'tasks[0].stoppedReason' \
  --output text 2>/dev/null || echo "unknown")

log "Migration task stopped. Exit code: ${EXIT_CODE}, Reason: ${STOP_REASON}"

if [[ "${EXIT_CODE}" != "0" ]]; then
  error "Migration task exited with non-zero code: ${EXIT_CODE}"
  error "Stop reason: ${STOP_REASON}"

  # Attempt to fetch CloudWatch logs for debugging
  LOG_GROUP="/ecs/${ENVIRONMENT}/${CONTAINER_NAME}"
  log "Fetching recent logs from ${LOG_GROUP}..."
  aws logs get-log-events \
    --log-group-name "${LOG_GROUP}" \
    --log-stream-name "ecs/${CONTAINER_NAME}/$(basename "${TASK_ARN}")" \
    --limit 50 \
    --region "${AWS_REGION}" \
    --query 'events[*].message' \
    --output text 2>/dev/null || log "(CloudWatch logs not available)"

  exit 1
fi

log "=== Database migrations completed successfully ==="
