#!/usr/bin/env bash
# Human-readable demo validation. Exit 0 only if all checks pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GATEWAY="${GATEWAY_URL:-http://localhost:3000}"
# Default fixture depends on deploy mode; override with FIXTURE_URL=...
FIXTURE_URL="${FIXTURE_URL:-}"
PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

check() {
  local name="$1"
  local cond="$2"
  local detail="${3:-}"
  if [[ "$cond" == "1" ]]; then
    green "[PASS] $name${detail:+ — $detail}"
    PASS=$((PASS + 1))
  else
    red "[FAIL] $name${detail:+ — $detail}"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Web Crawler Demo Validation ==="
echo "Gateway: $GATEWAY"
echo

# 1) Runtime available (Compose app container OR PM2 host processes)
COMPOSE_APP=0
PM2_APP=0
if docker compose ps --status running --format '{{.Name}}' 2>/dev/null | grep -q api-gateway; then
  COMPOSE_APP=1
fi
if command -v npx >/dev/null 2>&1 && npx pm2 jlist 2>/dev/null | python3 -c 'import sys,json; raw=sys.stdin.read(); s=raw.find("["); e=raw.rfind("]");
import sys as S
apps=json.loads(raw[s:e+1]) if s>=0 and e>s else [];
S.exit(0 if any(a.get("name")=="api-gateway" and a.get("pm2_env",{}).get("status")=="online" for a in apps) else 1)' 2>/dev/null; then
  PM2_APP=1
fi
if [[ "$COMPOSE_APP" -eq 1 || "$PM2_APP" -eq 1 ]]; then
  MODE_DETAIL="compose"
  [[ "$PM2_APP" -eq 1 ]] && MODE_DETAIL="pm2"
  [[ "$COMPOSE_APP" -eq 1 && "$PM2_APP" -eq 1 ]] && MODE_DETAIL="both"
  check "App runtime available" 1 "$MODE_DETAIL"
else
  check "App runtime available" 0 "run: docker compose up -d   OR   npm run pm2:demo"
fi

# 2) Health + choose crawl fixture for this deploy mode
HEALTH="$(curl -fsS "$GATEWAY/api/v1/health" || true)"
if printf '%s' "$HEALTH" | grep -q '"success"'; then
  check "API Gateway health" 1
else
  check "API Gateway health" 0 "$HEALTH"
fi

DEPLOY_MODE="$(printf '%s' "$HEALTH" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("deployMode") or "compose")' 2>/dev/null || echo compose)"
if [[ -z "$FIXTURE_URL" ]]; then
  if [[ "$DEPLOY_MODE" == "pm2" ]]; then
    FIXTURE_URL="http://127.0.0.1:3000/fixture/demo.html"
  else
    FIXTURE_URL="http://api-gateway:3000/fixture/demo.html"
  fi
fi
yellow "deployMode=$DEPLOY_MODE  fixture=$FIXTURE_URL"

# 3) Dashboard + fixture in browser-reachable host
DASH="$(curl -fsS "$GATEWAY/" || true)"
if printf '%s' "$DASH" | grep -q 'Web Crawler Demo'; then
  check "Dashboard page loads" 1 "http://localhost:3000"
else
  check "Dashboard page loads" 0
fi

FIX="$(curl -fsS "$GATEWAY/fixture/demo.html" || true)"
if printf '%s' "$FIX" | grep -q 'Aurora Lighthouse'; then
  check "Fixture page loads" 1
else
  check "Fixture page loads" 0
fi

# 4) Login + crawl
TOKEN="$(curl -fsS -X POST "$GATEWAY/api/v1/user/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@local.dev","password":"demo"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')"

TASK_JSON="$(curl -fsS -X POST "$GATEWAY/api/v1/crawl" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"$FIXTURE_URL\",\"depth\":1}")"
TASK_ID="$(printf '%s' "$TASK_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["taskId"])')"
check "Crawl returns taskId" 1 "$TASK_ID"

STATUS=""
for i in $(seq 1 45); do
  STATUS="$(curl -fsS "$GATEWAY/api/v1/crawl/$TASK_ID" -H "Authorization: Bearer $TOKEN" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("data",{}).get("status",""))')"
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    break
  fi
  sleep 1
done

if [[ "$STATUS" == "completed" ]]; then
  check "Task status becomes completed" 1
else
  ERR="$(curl -fsS "$GATEWAY/api/v1/crawl/$TASK_ID" -H "Authorization: Bearer $TOKEN" \
    | python3 -c 'import sys,json; t=json.load(sys.stdin).get("data",{}).get("task",{}); print(t.get("error",""))')"
  check "Task status becomes completed" 0 "status=$STATUS error=$ERR"
fi

# 5) Search
SEARCH="$(curl -fsS "$GATEWAY/api/v1/search?q=aurora%20lighthouse")"
HITS="$(printf '%s' "$SEARCH" | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("data",{}).get("hits",[])))')"
if [[ "$HITS" -ge 1 ]]; then
  check "Elasticsearch search finds page" 1 "hits=$HITS"
else
  check "Elasticsearch search finds page" 0 "hits=0"
fi

# 6) Cache
ENC_URL="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$FIXTURE_URL'''))")"
SRC1="$(curl -fsS "$GATEWAY/api/v1/data?url=$ENC_URL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("data",{}).get("source",""))')"
SRC2="$(curl -fsS "$GATEWAY/api/v1/data?url=$ENC_URL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("data",{}).get("source",""))')"
if [[ "$SRC1" == "cache" || "$SRC1" == "mongodb" ]]; then
  check "Page load returns data" 1 "source=$SRC1"
else
  check "Page load returns data" 0 "source=$SRC1"
fi
if [[ "$SRC2" == "cache" ]]; then
  check "Second page load hits Redis cache" 1 "source=$SRC2"
else
  check "Second page load hits Redis cache" 0 "source=$SRC2"
fi

# 7) External URL (optional but recommended)
EXT_JSON="$(curl -fsS -X POST "$GATEWAY/api/v1/crawl" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","depth":1}')"
EXT_ID="$(printf '%s' "$EXT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["taskId"])')"
EXT_STATUS=""
for i in $(seq 1 45); do
  EXT_STATUS="$(curl -fsS "$GATEWAY/api/v1/crawl/$EXT_ID" -H "Authorization: Bearer $TOKEN" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("data",{}).get("status",""))')"
  if [[ "$EXT_STATUS" == "completed" || "$EXT_STATUS" == "failed" ]]; then
    break
  fi
  sleep 1
done
if [[ "$EXT_STATUS" == "completed" ]]; then
  check "External crawl https://example.com" 1
else
  check "External crawl https://example.com" 0 "status=$EXT_STATUS"
fi

echo
echo "Score: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  red "Overall: NOT READY"
  exit 1
fi
green "Overall: DEMO OK — safe to show in interview / class"
echo
echo "Manual UI (2 min) at http://localhost:3000 :"
echo "  1) Keep default fixture URL → Start crawl → wait for completed"
echo "  2) Search: aurora lighthouse → see result"
echo "  3) Load page twice → second badge should say cache"
echo "  4) Optional: crawl https://example.com"
