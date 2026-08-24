#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GATEWAY="${GATEWAY_URL:-http://localhost:3000}"
FIXTURE_URL="${FIXTURE_URL:-http://api-gateway:3000/fixture/demo.html}"

echo "==> 1) Health check"
curl -fsS "$GATEWAY/api/v1/health" | tee /tmp/crawler-health.json
echo

echo "==> 2) Mock login"
TOKEN="$(curl -fsS -X POST "$GATEWAY/api/v1/user/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@local.dev","password":"demo"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')"
echo "token acquired"

echo "==> 3) Schedule crawl: $FIXTURE_URL"
TASK_ID="$(curl -fsS -X POST "$GATEWAY/api/v1/crawl" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"$FIXTURE_URL\",\"depth\":1}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["taskId"])')"
echo "taskId=$TASK_ID"

echo "==> 4) Poll task status"
for i in $(seq 1 60); do
  STATUS_JSON="$(curl -fsS "$GATEWAY/api/v1/crawl/$TASK_ID" -H "Authorization: Bearer $TOKEN")"
  STATUS="$(printf '%s' "$STATUS_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("data",{}).get("status",""))')"
  echo "  [$i] status=$STATUS"
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    break
  fi
  sleep 1
done

if [[ "$STATUS" != "completed" ]]; then
  echo "Crawl did not complete successfully"
  echo "$STATUS_JSON"
  exit 1
fi

echo "==> 5) Search for 'aurora lighthouse'"
curl -fsS "$GATEWAY/api/v1/search?q=aurora%20lighthouse" | tee /tmp/crawler-search.json
echo

echo "==> 6) Load page (expect mongodb or cache)"
curl -fsS "$GATEWAY/api/v1/data?url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$FIXTURE_URL'''))")" | tee /tmp/crawler-page1.json
echo

echo "==> 7) Load page again (expect cache)"
curl -fsS "$GATEWAY/api/v1/data?url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$FIXTURE_URL'''))")" | tee /tmp/crawler-page2.json
echo

python3 - <<'PY'
import json
p1=json.load(open('/tmp/crawler-page1.json'))
p2=json.load(open('/tmp/crawler-page2.json'))
s1=(p1.get('data') or p1).get('source')
s2=(p2.get('data') or p2).get('source')
print(f"page load #1 source: {s1}")
print(f"page load #2 source: {s2}")
search=json.load(open('/tmp/crawler-search.json'))
hits=(search.get('data') or {}).get('hits') or []
print(f"search hits: {len(hits)}")
if not hits:
    raise SystemExit('Search returned no hits')
if s2 != 'cache':
    print('Warning: second read was not cache (still ok if Redis was empty)')
print('Demo flow OK')
PY
