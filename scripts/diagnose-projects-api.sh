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

pass() { echo -e "${GREEN}✓ PASS${NC} $1"; }
fail() { echo -e "${RED}✗ FAIL${NC} $1"; echo "  Response: $2"; }
warn() { echo -e "${YELLOW}⚠ WARN${NC} $1"; }
header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }

# ------------------------------------------------------------------
header "1. Health Check"
HEALTH=$(curl -sf "${API}/health" 2>&1) && pass "GET /health → $HEALTH" || fail "GET /health" "$HEALTH"

# ------------------------------------------------------------------
header "2. Register test user"
REG_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"name\":\"Diag User\"}")
REG_BODY=$(echo "$REG_RESP" | head -n -1)
REG_CODE=$(echo "$REG_RESP" | tail -1)
if [ "$REG_CODE" = "201" ]; then
  pass "POST /api/auth/register → 201"
elif [ "$REG_CODE" = "409" ]; then
  warn "POST /api/auth/register → 409 (user already exists, continuing)"
else
  fail "POST /api/auth/register → $REG_CODE" "$REG_BODY"
fi

# ------------------------------------------------------------------
header "3. Login"
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
LOGIN_BODY=$(echo "$LOGIN_RESP" | head -n -1)
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -1)
if [ "$LOGIN_CODE" = "200" ]; then
  pass "POST /api/auth/login → 200"
  TOKEN=$(echo "$LOGIN_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])" 2>/dev/null || echo "")
  ROLE=$(echo "$LOGIN_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])" 2>/dev/null || echo "unknown")
  echo "  Token: ${TOKEN:0:20}..."
  echo "  User role: $ROLE"
else
  fail "POST /api/auth/login → $LOGIN_CODE" "$LOGIN_BODY"
  echo "Cannot proceed without a token. Exiting."
  exit 1
fi

# ------------------------------------------------------------------
header "4. GET /api/auth/me"
ME_RESP=$(curl -s -w "\n%{http_code}" "${API}/api/auth/me" \
  -H "Authorization: Bearer ${TOKEN}")
ME_BODY=$(echo "$ME_RESP" | head -n -1)
ME_CODE=$(echo "$ME_RESP" | tail -1)
if [ "$ME_CODE" = "200" ]; then
  pass "GET /api/auth/me → 200"
  echo "  Body: $ME_BODY"
else
  fail "GET /api/auth/me → $ME_CODE" "$ME_BODY"
fi

# ------------------------------------------------------------------
header "5. GET /api/projects (list)"
LIST_RESP=$(curl -s -w "\n%{http_code}" "${API}/api/projects" \
  -H "Authorization: Bearer ${TOKEN}")
LIST_BODY=$(echo "$LIST_RESP" | head -n -1)
LIST_CODE=$(echo "$LIST_RESP" | tail -1)
if [ "$LIST_CODE" = "200" ]; then
  pass "GET /api/projects → 200"
  COUNT=$(echo "$LIST_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "?")
  echo "  Project count: $COUNT"
else
  fail "GET /api/projects → $LIST_CODE" "$LIST_BODY"
fi

# ------------------------------------------------------------------
header "6. POST /api/projects (create — name only)"
CREATE1_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/api/projects" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Diag Name-Only ${RUN_ID}\"}")
CREATE1_BODY=$(echo "$CREATE1_RESP" | head -n -1)
CREATE1_CODE=$(echo "$CREATE1_RESP" | tail -1)
if [ "$CREATE1_CODE" = "201" ]; then
  pass "POST /api/projects (name only) → 201"
  PROJECT_ID=$(echo "$CREATE1_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
  echo "  Project ID: $PROJECT_ID"
else
  fail "POST /api/projects (name only) → $CREATE1_CODE" "$CREATE1_BODY"
fi

# ------------------------------------------------------------------
header "7. POST /api/projects (create — all fields)"
CREATE2_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/api/projects" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Diag Full ${RUN_ID}\",\"url\":\"https://example.com\",\"description\":\"Test with all fields\"}")
CREATE2_BODY=$(echo "$CREATE2_RESP" | head -n -1)
CREATE2_CODE=$(echo "$CREATE2_RESP" | tail -1)
if [ "$CREATE2_CODE" = "201" ]; then
  pass "POST /api/projects (all fields) → 201"
else
  fail "POST /api/projects (all fields) → $CREATE2_CODE" "$CREATE2_BODY"
fi

# ------------------------------------------------------------------
header "8. POST /api/projects (create — partial URL, no protocol)"
CREATE3_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/api/projects" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Diag Partial URL ${RUN_ID}\",\"url\":\"example.com\"}")
CREATE3_BODY=$(echo "$CREATE3_RESP" | head -n -1)
CREATE3_CODE=$(echo "$CREATE3_RESP" | tail -1)
if [ "$CREATE3_CODE" = "201" ]; then
  pass "POST /api/projects (partial URL) → 201"
else
  fail "POST /api/projects (partial URL) → $CREATE3_CODE" "$CREATE3_BODY"
fi

# ------------------------------------------------------------------
header "9. GET /api/projects/:id (detail)"
if [ -n "${PROJECT_ID:-}" ]; then
  DETAIL_RESP=$(curl -s -w "\n%{http_code}" "${API}/api/projects/${PROJECT_ID}" \
    -H "Authorization: Bearer ${TOKEN}")
  DETAIL_BODY=$(echo "$DETAIL_RESP" | head -n -1)
  DETAIL_CODE=$(echo "$DETAIL_RESP" | tail -1)
  if [ "$DETAIL_CODE" = "200" ]; then
    pass "GET /api/projects/${PROJECT_ID} → 200"
    echo "  Body: $DETAIL_BODY"
  else
    fail "GET /api/projects/${PROJECT_ID} → $DETAIL_CODE" "$DETAIL_BODY"
  fi
else
  warn "Skipped — no project ID from step 6"
fi

# ------------------------------------------------------------------
header "10. Check DB columns via creating project without url"
CREATE4_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/api/projects" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Diag No-URL ${RUN_ID}\"}")
CREATE4_BODY=$(echo "$CREATE4_RESP" | head -n -1)
CREATE4_CODE=$(echo "$CREATE4_RESP" | tail -1)
if [ "$CREATE4_CODE" = "201" ]; then
  pass "POST /api/projects (no url field at all) → 201"
else
  fail "POST /api/projects (no url field at all) → $CREATE4_CODE" "$CREATE4_BODY"
fi

# ------------------------------------------------------------------
header "Summary"
echo "If steps 6-8 fail with 'column url does not exist', the safety-net"
echo "migration did not run. Check ECS task logs for 'Schema safety-net'."
echo ""
echo "If steps 6-8 fail with 403, the role fix did not deploy."
echo ""
echo "Done."
