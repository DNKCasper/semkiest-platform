#!/usr/bin/env bash
# ============================================================================
# diagnose-profiles-runs-api.sh
# End-to-end test for profile CRUD + test run trigger/list/detail APIs.
# Run from any machine that can reach the staging ALB.
#   chmod +x scripts/diagnose-profiles-runs-api.sh
#   ./scripts/diagnose-profiles-runs-api.sh
# ============================================================================
set -euo pipefail

API="${API_URL:-http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com}"
RUN_ID="diag-$(date +%s)"
EMAIL="diag-${RUN_ID}@test.com"
PASSWORD='DiagPassword123!'
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() { printf "${GREEN}✓ PASS${NC} %s\n" "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { printf "${RED}✗ FAIL${NC} %s\n" "$1"; printf "  Response: %s\n" "$2"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
warn() { printf "${YELLOW}⚠ WARN${NC} %s\n" "$1"; WARN_COUNT=$((WARN_COUNT + 1)); }
header() { printf "\n${YELLOW}=== %s ===${NC}\n" "$1"; }

# Helper: makes a curl request, stores HTTP body in RESP_BODY and status in RESP_CODE.
api_call() {
  local method="$1" url="$2" data="${3:-}"
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
  RESP_CODE="${raw: -3}"
  RESP_BODY="${raw:0:${#raw}-3}"
}

# Helper: extract a JSON field using python3
json_get() {
  echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)$2)" 2>/dev/null || echo ""
}

echo "============================================================"
echo " Profiles + Runs API Diagnostic"
echo " API: ${API}"
echo " Run ID: ${RUN_ID}"
echo "============================================================"

# ------------------------------------------------------------------
header "1. Health Check"
HEALTH=$(curl -sf "${API}/health" 2>&1) && pass "GET /health → $HEALTH" || fail "GET /health" "${HEALTH:-connection failed}"

# ------------------------------------------------------------------
header "2. Register + Login"
api_call POST "${API}/api/auth/register" \
  "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"name\":\"Diag User\"}"
if [ "$RESP_CODE" = "201" ]; then
  pass "POST /api/auth/register → 201"
elif [ "$RESP_CODE" = "409" ]; then
  warn "POST /api/auth/register → 409 (user exists, continuing)"
else
  fail "POST /api/auth/register → $RESP_CODE" "$RESP_BODY"
fi

TOKEN=""
api_call POST "${API}/api/auth/login" \
  "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
if [ "$RESP_CODE" = "200" ]; then
  pass "POST /api/auth/login → 200"
  TOKEN=$(json_get "$RESP_BODY" "['tokens']['accessToken']")
  echo "  Token: ${TOKEN:0:20}..."
else
  fail "POST /api/auth/login → $RESP_CODE" "$RESP_BODY"
  echo "Cannot proceed without a token. Exiting."
  exit 1
fi

# ------------------------------------------------------------------
header "3. Create a test project"
api_call POST "${API}/api/projects" \
  "{\"name\":\"Diag Profiles+Runs ${RUN_ID}\",\"url\":\"https://example.com\",\"description\":\"Test project for profile/run diagnostics\"}"
if [ "$RESP_CODE" = "201" ]; then
  pass "POST /api/projects → 201"
  PROJECT_ID=$(json_get "$RESP_BODY" "['data']['id']")
  echo "  Project ID: $PROJECT_ID"
else
  fail "POST /api/projects → $RESP_CODE" "$RESP_BODY"
  echo "Cannot proceed without a project. Exiting."
  exit 1
fi

# ==================================================================
# PROFILE TESTS
# ==================================================================
header "4. Create profile (POST /api/projects/:id/profiles)"
api_call POST "${API}/api/projects/${PROJECT_ID}/profiles" \
  "{\"name\":\"Smoke Test ${RUN_ID}\",\"config\":{\"browsers\":[\"chromium\"],\"headless\":true}}"
if [ "$RESP_CODE" = "201" ]; then
  pass "POST /api/projects/${PROJECT_ID}/profiles → 201"
  PROFILE_ID=$(json_get "$RESP_BODY" "['data']['id']")
  PROFILE_NAME=$(json_get "$RESP_BODY" "['data']['name']")
  echo "  Profile ID: $PROFILE_ID"
  echo "  Profile Name: $PROFILE_NAME"
else
  fail "POST /api/projects/${PROJECT_ID}/profiles → $RESP_CODE" "$RESP_BODY"
  PROFILE_ID=""
fi

# ------------------------------------------------------------------
header "5. List profiles (GET /api/projects/:id/profiles)"
api_call GET "${API}/api/projects/${PROJECT_ID}/profiles"
if [ "$RESP_CODE" = "200" ]; then
  PROFILE_COUNT=$(json_get "$RESP_BODY" "['data'].__len__()")
  if [ "$PROFILE_COUNT" -ge "1" ] 2>/dev/null; then
    pass "GET /api/projects/${PROJECT_ID}/profiles → 200 ($PROFILE_COUNT profiles)"
  else
    warn "GET /api/projects/${PROJECT_ID}/profiles → 200 but no profiles found"
  fi
else
  fail "GET /api/projects/${PROJECT_ID}/profiles → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "6. Get single profile (GET /api/projects/:id/profiles/:profileId)"
if [ -n "${PROFILE_ID:-}" ]; then
  api_call GET "${API}/api/projects/${PROJECT_ID}/profiles/${PROFILE_ID}"
  if [ "$RESP_CODE" = "200" ]; then
    pass "GET /api/projects/${PROJECT_ID}/profiles/${PROFILE_ID} → 200"
    GOT_NAME=$(json_get "$RESP_BODY" "['data']['name']")
    echo "  Name: $GOT_NAME"
  else
    fail "GET /api/projects/${PROJECT_ID}/profiles/${PROFILE_ID} → $RESP_CODE" "$RESP_BODY"
  fi
else
  warn "Skipped — no profile ID from step 4"
fi

# ------------------------------------------------------------------
header "7. Update profile (PUT /api/projects/:id/profiles/:profileId)"
if [ -n "${PROFILE_ID:-}" ]; then
  api_call PUT "${API}/api/projects/${PROJECT_ID}/profiles/${PROFILE_ID}" \
    "{\"name\":\"Updated Smoke ${RUN_ID}\",\"config\":{\"browsers\":[\"chromium\",\"firefox\"],\"headless\":false}}"
  if [ "$RESP_CODE" = "200" ]; then
    pass "PUT /api/projects/${PROJECT_ID}/profiles/${PROFILE_ID} → 200"
    UPDATED_NAME=$(json_get "$RESP_BODY" "['data']['name']")
    echo "  Updated Name: $UPDATED_NAME"
  else
    fail "PUT /api/projects/${PROJECT_ID}/profiles/${PROFILE_ID} → $RESP_CODE" "$RESP_BODY"
  fi
else
  warn "Skipped — no profile ID from step 4"
fi

# ------------------------------------------------------------------
header "8. Create second profile for run trigger"
api_call POST "${API}/api/projects/${PROJECT_ID}/profiles" \
  "{\"name\":\"Full Regression ${RUN_ID}\",\"config\":{\"browsers\":[\"chromium\",\"firefox\",\"webkit\"],\"headless\":true,\"retries\":2}}"
if [ "$RESP_CODE" = "201" ]; then
  pass "POST /api/projects/${PROJECT_ID}/profiles (2nd) → 201"
  PROFILE2_ID=$(json_get "$RESP_BODY" "['data']['id']")
  echo "  Profile 2 ID: $PROFILE2_ID"
else
  fail "POST /api/projects/${PROJECT_ID}/profiles (2nd) → $RESP_CODE" "$RESP_BODY"
  PROFILE2_ID="${PROFILE_ID:-}"
fi

# ==================================================================
# TEST RUN TESTS
# ==================================================================
RUN_PROFILE="${PROFILE2_ID:-${PROFILE_ID:-}}"

header "9. Trigger test run (POST /api/projects/:id/runs)"
if [ -n "${RUN_PROFILE:-}" ]; then
  api_call POST "${API}/api/projects/${PROJECT_ID}/runs" \
    "{\"profileId\":\"${RUN_PROFILE}\",\"triggerType\":\"manual\"}"
  if [ "$RESP_CODE" = "201" ]; then
    pass "POST /api/projects/${PROJECT_ID}/runs → 201"
    TEST_RUN_ID=$(json_get "$RESP_BODY" "['data']['id']")
    TEST_RUN_STATUS=$(json_get "$RESP_BODY" "['data']['status']")
    echo "  Test Run ID: $TEST_RUN_ID"
    echo "  Status: $TEST_RUN_STATUS"
  else
    fail "POST /api/projects/${PROJECT_ID}/runs → $RESP_CODE" "$RESP_BODY"
    TEST_RUN_ID=""
  fi
else
  warn "Skipped — no profile ID available"
  TEST_RUN_ID=""
fi

# ------------------------------------------------------------------
header "10. List test runs (GET /api/projects/:id/runs)"
api_call GET "${API}/api/projects/${PROJECT_ID}/runs"
if [ "$RESP_CODE" = "200" ]; then
  RUN_COUNT=$(json_get "$RESP_BODY" "['data'].__len__()")
  RUN_TOTAL=$(json_get "$RESP_BODY" "['pagination']['total']")
  pass "GET /api/projects/${PROJECT_ID}/runs → 200 (${RUN_COUNT} runs, total: ${RUN_TOTAL})"
else
  fail "GET /api/projects/${PROJECT_ID}/runs → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "11. List runs with filters (status=PENDING)"
api_call GET "${API}/api/projects/${PROJECT_ID}/runs?status=PENDING"
if [ "$RESP_CODE" = "200" ]; then
  FILTERED_COUNT=$(json_get "$RESP_BODY" "['data'].__len__()")
  pass "GET /api/projects/${PROJECT_ID}/runs?status=PENDING → 200 (${FILTERED_COUNT} runs)"
else
  fail "GET /api/projects/${PROJECT_ID}/runs?status=PENDING → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "12. Get test run detail (GET /api/projects/:id/runs/:runId)"
if [ -n "${TEST_RUN_ID:-}" ]; then
  api_call GET "${API}/api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID}"
  if [ "$RESP_CODE" = "200" ]; then
    pass "GET /api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID} → 200"
    DETAIL_STATUS=$(json_get "$RESP_BODY" "['data']['status']")
    echo "  Status: $DETAIL_STATUS"
  else
    fail "GET /api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID} → $RESP_CODE" "$RESP_BODY"
  fi
else
  warn "Skipped — no test run ID from step 9"
fi

# ------------------------------------------------------------------
header "13. Update run status (PATCH /api/projects/:id/runs/:runId)"
if [ -n "${TEST_RUN_ID:-}" ]; then
  api_call PATCH "${API}/api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID}" \
    "{\"status\":\"RUNNING\"}"
  if [ "$RESP_CODE" = "200" ]; then
    pass "PATCH /api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID} → 200"
    PATCHED_STATUS=$(json_get "$RESP_BODY" "['data']['status']")
    echo "  Updated Status: $PATCHED_STATUS"
  else
    fail "PATCH /api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID} → $RESP_CODE" "$RESP_BODY"
  fi
else
  warn "Skipped — no test run ID from step 9"
fi

# ------------------------------------------------------------------
header "14. Record test results (POST /api/projects/:id/runs/:runId/results)"
if [ -n "${TEST_RUN_ID:-}" ]; then
  api_call POST "${API}/api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID}/results" \
    "{\"results\":[{\"testName\":\"Homepage loads\",\"status\":\"PASSED\"},{\"testName\":\"Login flow\",\"status\":\"PASSED\"},{\"testName\":\"Dashboard render\",\"status\":\"FAILED\",\"errorMessage\":\"Timeout waiting for chart component\"}]}"
  if [ "$RESP_CODE" = "201" ]; then
    pass "POST /api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID}/results → 201"
    RESULTS_CREATED=$(json_get "$RESP_BODY" "['data']['resultsCreated']")
    echo "  Results created: $RESULTS_CREATED"
  else
    fail "POST /api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID}/results → $RESP_CODE" "$RESP_BODY"
  fi
else
  warn "Skipped — no test run ID from step 9"
fi

# ------------------------------------------------------------------
header "15. Verify run detail includes results"
if [ -n "${TEST_RUN_ID:-}" ]; then
  api_call GET "${API}/api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID}"
  if [ "$RESP_CODE" = "200" ]; then
    RESULT_COUNT=$(json_get "$RESP_BODY" "['data']['testResults'].__len__()")
    PASS_RATE=$(json_get "$RESP_BODY" "['data']['passRate']")
    TOTAL_TESTS=$(json_get "$RESP_BODY" "['data']['totalTests']")
    if [ "$RESULT_COUNT" -ge "3" ] 2>/dev/null; then
      pass "GET run detail has $RESULT_COUNT results (pass rate: ${PASS_RATE}%, total: ${TOTAL_TESTS})"
    else
      fail "Expected ≥3 results, got $RESULT_COUNT" "$RESP_BODY"
    fi
  else
    fail "GET /api/projects/${PROJECT_ID}/runs/${TEST_RUN_ID} → $RESP_CODE" "$RESP_BODY"
  fi
else
  warn "Skipped — no test run ID from step 9"
fi

# ------------------------------------------------------------------
header "16. Get trend data (GET /api/projects/:id/runs/trend)"
api_call GET "${API}/api/projects/${PROJECT_ID}/runs/trend"
if [ "$RESP_CODE" = "200" ]; then
  pass "GET /api/projects/${PROJECT_ID}/runs/trend → 200"
  TREND_COUNT=$(json_get "$RESP_BODY" "['data'].__len__()")
  echo "  Trend data points: $TREND_COUNT"
else
  fail "GET /api/projects/${PROJECT_ID}/runs/trend → $RESP_CODE" "$RESP_BODY"
fi

# ------------------------------------------------------------------
header "17. Delete profile (DELETE /api/projects/:id/profiles/:profileId)"
if [ -n "${PROFILE_ID:-}" ]; then
  api_call DELETE "${API}/api/projects/${PROJECT_ID}/profiles/${PROFILE_ID}"
  if [ "$RESP_CODE" = "204" ] || [ "$RESP_CODE" = "200" ]; then
    pass "DELETE /api/projects/${PROJECT_ID}/profiles/${PROFILE_ID} → $RESP_CODE"
  else
    fail "DELETE /api/projects/${PROJECT_ID}/profiles/${PROFILE_ID} → $RESP_CODE" "$RESP_BODY"
  fi
else
  warn "Skipped — no profile ID from step 4"
fi

# ------------------------------------------------------------------
header "18. Verify profile deleted"
if [ -n "${PROFILE_ID:-}" ]; then
  api_call GET "${API}/api/projects/${PROJECT_ID}/profiles/${PROFILE_ID}"
  if [ "$RESP_CODE" = "404" ]; then
    pass "GET deleted profile → 404 (confirmed deleted)"
  elif [ "$RESP_CODE" = "200" ]; then
    fail "Profile still exists after delete" "$RESP_BODY"
  else
    warn "Unexpected status $RESP_CODE after delete"
  fi
else
  warn "Skipped — no profile ID from step 4"
fi

# ==================================================================
header "Summary"
echo ""
printf "${GREEN}Passed: $PASS_COUNT${NC}  "
printf "${RED}Failed: $FAIL_COUNT${NC}  "
printf "${YELLOW}Warnings: $WARN_COUNT${NC}\n"
echo ""
if [ "$FAIL_COUNT" -eq 0 ]; then
  printf "${GREEN}ALL TESTS PASSED!${NC}\n"
else
  printf "${RED}$FAIL_COUNT TEST(S) FAILED.${NC}\n"
  echo ""
  echo "Troubleshooting:"
  echo "  - If profile/run endpoints return 404: check routes/index.ts has profileRoutes + runRoutes registered"
  echo "  - If 503: DB import failed — check ECS logs for Prisma import errors"
  echo "  - If 400: check Zod schemas match the request body shape"
  echo "  - If 401: token expired or auth middleware failing"
fi
echo ""
echo "Done."
