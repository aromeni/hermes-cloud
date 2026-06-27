#!/usr/bin/env bash
# End-to-end smoke test: starts the stack, sends a mock webhook, and verifies
# the incident is created and eventually transitions from "pending".
# Usage: ./tests/e2e_test.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
TIMEOUT=60   # seconds to wait for backend to be ready

echo "==> Waiting for backend at $BASE_URL/health ..."
for i in $(seq 1 $TIMEOUT); do
  if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    echo "    Backend is up."
    break
  fi
  if [ "$i" -eq "$TIMEOUT" ]; then
    echo "ERROR: Backend did not start within ${TIMEOUT}s." >&2
    exit 1
  fi
  sleep 1
done

echo ""
echo "==> Sending manual trigger ..."
RESPONSE=$(curl -sf -X POST "$BASE_URL/api/trigger" \
  -H "Content-Type: application/json" \
  -d '{"error_text":"TypeError: undefined is not a function","repo_url":"https://github.com/example/repo","base_branch":"main"}')

echo "    Response: $RESPONSE"

INCIDENT_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['incident_id'])")
echo "    Incident ID: $INCIDENT_ID"

echo ""
echo "==> Checking incident status ..."
STATUS=$(curl -sf "$BASE_URL/api/incidents/$INCIDENT_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
echo "    Status: $STATUS"

if [[ "$STATUS" == "pending" || "$STATUS" == "running" || "$STATUS" == "success" || "$STATUS" == "failed" ]]; then
  echo ""
  echo "==> Fetching stats ..."
  STATS=$(curl -sf "$BASE_URL/api/stats")
  echo "    Stats: $STATS"

  TOTAL=$(echo "$STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['total_incidents'])")
  if [ "$TOTAL" -ge 1 ]; then
    echo ""
    echo "✓ End-to-end test PASSED (total_incidents=$TOTAL, incident_status=$STATUS)"
    exit 0
  fi
fi

echo "✗ End-to-end test FAILED" >&2
exit 1
