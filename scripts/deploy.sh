#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy a Docker image to an ECS Fargate service
#
# Implements a blue/green-style rolling deployment:
#   1. Fetch the current (active) task definition
#   2. Update the container image in a new task definition revision
#   3. Inject environment variables from AWS Secrets Manager
#   4. Register the new task definition
#   5. Record the previous task definition ARN for rollback
#   6. Update the ECS service to the new task definition
#   7. Wait for the service to stabilize
#   8. Run health checks against the load balancer
#   9. Automatically roll back to the previous task definition on failure
#
# Required environment variables:
#   ENVIRONMENT             — staging | production
#   ECS_CLUSTER             — ECS cluster name
#   ECS_SERVICE             — ECS service name
#   TASK_DEF_FAMILY         — Task definition family name
#   CONTAINER_NAME          — Name of the container within the task definition
#   IMAGE_URI               — Full ECR image URI (registry/repo:tag)
#   AWS_REGION              — AWS region
#   SECRETS_MANAGER_PREFIX  — Prefix for Secrets Manager paths (e.g. semkiest/staging)
#
# Optional environment variables:
#   HEALTH_CHECK_PATH       — HTTP path to probe (e.g. /health). Skip if empty.
#   HEALTH_CHECK_PORT       — Port to probe for health checks
#   LOAD_BALANCER_URL       — Base URL of the load balancer
#   DEPLOY_TIMEOUT          — Seconds to wait for ECS stabilization (default: 300)
#   HEALTH_CHECK_RETRIES    — Number of health check attempts (default: 10)
#   HEALTH_CHECK_INTERVAL   — Seconds between health check attempts (default: 15)
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
require_env ECS_SERVICE
require_env TASK_DEF_FAMILY
require_env CONTAINER_NAME
require_env IMAGE_URI
require_env AWS_REGION
require_env SECRETS_MANAGER_PREFIX

DEPLOY_TIMEOUT="${DEPLOY_TIMEOUT:-300}"
HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-10}"
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-15}"

log "=== Starting deployment ==="
log "  Environment : ${ENVIRONMENT}"
log "  Cluster     : ${ECS_CLUSTER}"
log "  Service     : ${ECS_SERVICE}"
log "  Image       : ${IMAGE_URI}"

# ── Step 1: Fetch current task definition ────────────────────────────────────

log "Fetching current task definition for family: ${TASK_DEF_FAMILY}"

CURRENT_TASK_DEF_ARN=$(aws ecs describe-services \
  --cluster "${ECS_CLUSTER}" \
  --services "${ECS_SERVICE}" \
  --region "${AWS_REGION}" \
  --query 'services[0].taskDefinition' \
  --output text)

log "Current task definition: ${CURRENT_TASK_DEF_ARN}"

TASK_DEF_JSON=$(aws ecs describe-task-definition \
  --task-definition "${CURRENT_TASK_DEF_ARN}" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition')

# ── Step 2: Update the container image ───────────────────────────────────────

log "Updating image for container '${CONTAINER_NAME}' to: ${IMAGE_URI}"

NEW_TASK_DEF_JSON=$(echo "${TASK_DEF_JSON}" | python3 -c "
import json, sys

data = json.load(sys.stdin)
container_name = '${CONTAINER_NAME}'
image_uri = '${IMAGE_URI}'

for container in data.get('containerDefinitions', []):
    if container['name'] == container_name:
        container['image'] = image_uri
        break
else:
    print(f'Container {container_name} not found in task definition', file=sys.stderr)
    sys.exit(1)

# Remove fields that cannot be included when registering a new revision
for field in ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes',
              'placementConstraints', 'compatibilities', 'registeredAt',
              'registeredBy', 'deregisteredAt']:
    data.pop(field, None)

print(json.dumps(data))
")

# ── Step 3: Inject secrets from AWS Secrets Manager ──────────────────────────

log "Injecting secrets from Secrets Manager prefix: ${SECRETS_MANAGER_PREFIX}"

# Resolve the Secrets Manager ARN for the environment secret bundle.
# Secrets are expected at: <prefix>/env  (a JSON key/value map)
SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id "${SECRETS_MANAGER_PREFIX}/env" \
  --region "${AWS_REGION}" \
  --query 'ARN' \
  --output text 2>/dev/null || true)

if [[ -n "${SECRET_ARN}" ]]; then
  NEW_TASK_DEF_JSON=$(echo "${NEW_TASK_DEF_JSON}" | python3 -c "
import json, sys

data = json.load(sys.stdin)
container_name = '${CONTAINER_NAME}'
secret_arn = '${SECRET_ARN}'

for container in data.get('containerDefinitions', []):
    if container['name'] == container_name:
        # ECS supports valueFrom referencing the entire secret ARN.
        # Individual keys are accessed via ARN:::key notation.
        existing_secrets = {s['name']: s for s in container.get('secrets', [])}
        existing_secrets['APP_SECRETS_ARN'] = {
            'name': 'APP_SECRETS_ARN',
            'valueFrom': secret_arn,
        }
        container['secrets'] = list(existing_secrets.values())
        break

print(json.dumps(data))
")
  log "Secrets reference injected into task definition."
else
  log "No Secrets Manager secret found at '${SECRETS_MANAGER_PREFIX}/env' — skipping injection."
fi

# ── Step 4: Register the new task definition revision ────────────────────────

log "Registering new task definition revision..."

NEW_TASK_DEF_ARN=$(echo "${NEW_TASK_DEF_JSON}" | aws ecs register-task-definition \
  --cli-input-json file:///dev/stdin \
  --region "${AWS_REGION}" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

log "New task definition registered: ${NEW_TASK_DEF_ARN}"

# ── Step 5: Update the ECS service ───────────────────────────────────────────

log "Updating ECS service '${ECS_SERVICE}' to use new task definition..."

aws ecs update-service \
  --cluster "${ECS_CLUSTER}" \
  --service "${ECS_SERVICE}" \
  --task-definition "${NEW_TASK_DEF_ARN}" \
  --force-new-deployment \
  --region "${AWS_REGION}" \
  --output text > /dev/null

log "Service update initiated. Waiting for stabilization (timeout: ${DEPLOY_TIMEOUT}s)..."

# ── Step 6: Wait for service to stabilize ────────────────────────────────────

rollback() {
  error "=== Deployment failed. Initiating rollback to ${CURRENT_TASK_DEF_ARN} ==="
  aws ecs update-service \
    --cluster "${ECS_CLUSTER}" \
    --service "${ECS_SERVICE}" \
    --task-definition "${CURRENT_TASK_DEF_ARN}" \
    --force-new-deployment \
    --region "${AWS_REGION}" \
    --output text > /dev/null || true

  log "Rollback initiated. Waiting for service to stabilize on previous revision..."
  aws ecs wait services-stable \
    --cluster "${ECS_CLUSTER}" \
    --services "${ECS_SERVICE}" \
    --region "${AWS_REGION}" || true

  error "Rolled back to: ${CURRENT_TASK_DEF_ARN}"
  exit 1
}

# Use a timeout subshell so we can catch aws ecs wait failures
if ! timeout "${DEPLOY_TIMEOUT}" aws ecs wait services-stable \
    --cluster "${ECS_CLUSTER}" \
    --services "${ECS_SERVICE}" \
    --region "${AWS_REGION}"; then
  error "ECS service did not stabilize within ${DEPLOY_TIMEOUT} seconds."
  rollback
fi

log "ECS service is stable."

# ── Step 7: Health checks ─────────────────────────────────────────────────────

if [[ -z "${HEALTH_CHECK_PATH:-}" ]] || [[ -z "${LOAD_BALANCER_URL:-}" ]]; then
  log "No health check configured (HEALTH_CHECK_PATH or LOAD_BALANCER_URL not set) — skipping."
else
  HEALTH_URL="${LOAD_BALANCER_URL}${HEALTH_CHECK_PATH}"
  log "Running health checks against: ${HEALTH_URL}"

  attempt=0
  while [[ ${attempt} -lt ${HEALTH_CHECK_RETRIES} ]]; do
    attempt=$(( attempt + 1 ))
    log "Health check attempt ${attempt}/${HEALTH_CHECK_RETRIES}..."

    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
      --max-time 10 \
      "${HEALTH_URL}" 2>/dev/null || echo "000")

    if [[ "${HTTP_CODE}" == "200" ]]; then
      log "Health check passed (HTTP ${HTTP_CODE})."
      break
    fi

    log "Health check returned HTTP ${HTTP_CODE}. Retrying in ${HEALTH_CHECK_INTERVAL}s..."

    if [[ ${attempt} -ge ${HEALTH_CHECK_RETRIES} ]]; then
      error "Health checks failed after ${HEALTH_CHECK_RETRIES} attempts (last HTTP code: ${HTTP_CODE})."
      rollback
    fi

    sleep "${HEALTH_CHECK_INTERVAL}"
  done
fi

# ── Done ──────────────────────────────────────────────────────────────────────

log "=== Deployment successful ==="
log "  New task definition : ${NEW_TASK_DEF_ARN}"
log "  Previous (rollback) : ${CURRENT_TASK_DEF_ARN}"

# Export the new and previous task definition ARNs so callers can record them
echo "NEW_TASK_DEF_ARN=${NEW_TASK_DEF_ARN}" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "PREVIOUS_TASK_DEF_ARN=${CURRENT_TASK_DEF_ARN}" >> "${GITHUB_OUTPUT:-/dev/null}"
