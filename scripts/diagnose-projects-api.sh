#!/usr/bin/env bash
# ============================================================================
# diagnose-projects-api.sh
# Run this from any machine that can reach the staging ALB.
#   chmod +x scripts/diagnose-projects-api.sh
#   ./scripts/diagnose-projects-api.sh
# ============================================================================
set -euo pipefail

API="${API_URL:-http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com}"
RUN_ID="diag-$(date +%s)"
EMAIL="diag-${RUN_ID}@test.com"
PASSWORD='DiagPassword123!'
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

pass() { printf "${GREEN}✓ PASS${NC} %s\n" "$1"; }
fail() { printf "${RED}✗ FAIL${NC} %s\n" "$1"; printf "  Response: %s\n" "$2"; }
warn() { printf "${YELLOW}⚠ WARN${NC} %s\n" "$1"; }
header() { printf "\n${YELLOW}=== %s ===${NC}\n" "$1"; }

# Helper: makes a curl request, stores HTTP body in RESP_BODY and status in RESP_CODE.
# Usage: api_call METHOD URL [DATA]
api_call() {
  local method="$1" url="$2" data="${3:-}"
  local tmpfile
  tmpfile=$(mktemp)
  local curl_args=(-s -w "%{http_code}" -X "$method" "$url"
    -H "Content-Type: application/json")
  if [ -n "${TOKEN:-}" ]; then
    curl_args+=(-H "Authorization: Bearer ${TOKEN}")
  fi
  if [ -n "$data" ]; then
    curl_args+=(-d "$data")
  fi
  local raw
  raw=$(curl "${curl_args[@]}")
  # Last 3 characters are the HTTP status code
  RESP_CODE="${raw: -3}"
  RESP_BODY="${raw:0:${#raw}-3}"
  rm -f "$tmpfile"
}

# Helper: extract a JSON field using python3
json_get() {
  echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)$2)" 2>/dev/null || echo ""
}

# ------------------------------------------------------------------
header "1. Health Check"
HEALTH=$(curl -sf "${API}/health" 2>&1) && pass "GET /health → $HEALTH" || fail "GET /health" "${HEALTH:-connection failed}"

# ------------------------------------------------------------------
header "2. Register test user"
api_call POST "${API}/api/auth/register" \
  "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"name\":\"Diag User\"}"
if [ "$RESP_CODE" = "201" ]; then
  pass "POST /api/auth/register → 201"
elif [ "$RESP_CODE" = "409" ]; then
  warn "POST /api/auth/register → 409 (user already exists, continuing)"
else
  fail "POST /api/auth/register → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "3. Login"
TOKEN=""  # clear so api_call doesn't send auth header
api_call POST "${API}/api/auth/login" \
  "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
if [ "$RESP_CODE" = "200" ]; then
  pass "POST /api/auth/login → 200"
  TOKEN=$(json_get "$RESP_BODY" "['tokens']['accessToken']")
  ROLE=$(json_get "$RESP_BODY" "['user']['role']")
  echo "  Token: ${TOKEN:0:20}..."
  echo "  User role: $ROLE"
else
  fail "POST /api/auth/login → $RESP_CODE" "$RESP_BODY"
  echo "Cannot proceed without a token. Exiting."
  exit 1
fi

# ------------------------------------------------------------------
header "4. GET /api/auth/me"
api_call GET "${API}/api/auth/me"
if [ "$RESP_CODE" = "200" ]; then
  pass "GET /api/auth/me → 200"
  echo "  Body: $RESP_BODY"
else
  fail "GET /api/auth/me → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "5. GET /api/projects (list)"
api_call GET "${API}/api/projects"
if [ "$RESP_CODE" = "200" ]; then
  pass "GET /api/projects → 200"
  COUNT=$(json_get "$RESP_BODY" ".get('data',[]).__len__()")
  echo "  Project count: $COUNT"
else
  fail "GET /api/projects → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "6. POST /api/projects (create — name only)"
api_call POST "${API}/api/projects" \
  "{\"name\":\"Diag Name-Only ${RUN_ID}\"}"
if [ "$RESP_CODE" = "201" ]; then
  pass "POST /api/projects (name only) → 201"
  PROJECT_ID=$(json_get "$RESP_BODY" "['data']['id']")
  echo "  Project ID: $PROJECT_ID"
else
  fail "POST /api/projects (name only) → $RESP_CODE" "$RESP_BODY"
  PROJECT_ID=""
fi

# ------------------------------------------------------------------
header "7. POST /api/projects (create — all fields)"
api_call POST "${API}/api/projects" \
  "{\"name\":\"Diag Full ${RUN_ID}\",\"url\":\"https://example.com\",\"description\":\"Test with all fields\"}"
if [ "$RESP_CODE" = "201" ]; then
  pass "POST /api/projects (all fields) → 201"
else
  fail "POST /api/projects (all fields) → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "8. POST /api/projects (create — partial URL, no protocol)"
api_call POST "${API}/api/projects" \
  "{\"name\":\"Diag Partial URL ${RUN_ID}\",\"url\":\"example.com\"}"
if [ "$RESP_CODE" = "201" ]; then
  pass "POST /api/projects (partial URL) → 201"
else
  fail "POST /api/projects (partial URL) → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "9. GET /api/projects/:id (detail)"
if [ -n "${PROJECT_ID:-}" ]; then
  api_call GET "${API}/api/projects/${PROJECT_ID}"
  if [ "$RESP_CODE" = "200" ]; then
    pass "GET /api/projects/${PROJECT_ID} → 200"
    echo "  Body: $RESP_BODY"
  else
    fail "GET /api/projects/${PROJECT_ID} → $RESP_CODE" "$RESP_BODY"
  fi
else
  warn "Skipped — no project ID from step 6"
fi

# ------------------------------------------------------------------
header "Summary"
echo "If steps 6-8 fail with 'column url does not exist', the ensureDbSchema()"
echo "safety-net in server.ts did not add the column. Check ECS task logs for"
echo "'ensureDbSchema' messages."
echo ""
echo "If steps 6-8 fail with 403, the role fix did not deploy."
echo ""
echo "Done."
