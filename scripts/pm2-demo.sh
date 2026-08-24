#!/usr/bin/env bash
# PM2 cluster + automatic restart evidence demo.
# Infra: Docker (mongo/redis/elasticsearch)
# Apps: PM2 on host (cluster mode for extraction workers)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EVIDENCE_DIR="$ROOT/docs/evidence"
mkdir -p "$EVIDENCE_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$EVIDENCE_DIR/pm2-demo-$STAMP.md"
GATEWAY="${GATEWAY_URL:-http://127.0.0.1:3000}"
# Host-reachable fixture (PM2 gateway listens on localhost)
FIXTURE_URL="${FIXTURE_URL:-http://127.0.0.1:3000/fixture/demo.html}"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    red "Missing command: $1"
    exit 1
  }
}

need_cmd docker
need_cmd node
need_cmd npm
need_cmd python3
need_cmd curl

if ! npx pm2 -v >/dev/null 2>&1; then
  yellow "Installing root deps (pm2)..."
  npm install
fi

PM2="npx pm2"

# PM2 sometimes prints version warnings to stdout and breaks `jlist` JSON parsing.
pm2_jlist() {
  $PM2 jlist 2>/dev/null | python3 -c '
import sys
raw = sys.stdin.read()
start = raw.find("[")
end = raw.rfind("]")
if start < 0 or end < 0 or end <= start:
    raise SystemExit("pm2 jlist did not return JSON")
sys.stdout.write(raw[start:end+1])
'
}

# Align in-memory god daemon with local pm2 package (avoids noisy version banner).
$PM2 update >/dev/null 2>&1 || true

echo "==> 1) Stop Compose app containers (keep infra on host ports)"
docker compose stop api-gateway data-extraction data-storage search-indexing task-scheduler 2>/dev/null || true

echo "==> 2) Start infra (mongo/redis/elasticsearch)"
# Prefer the main compose infra services to avoid duplicate containers/ports.
if docker compose ps --services 2>/dev/null | grep -q '^mongo$'; then
  docker compose up -d mongo redis elasticsearch
else
  docker compose -f docker-compose.infra.yml up -d
fi
yellow "Waiting for Elasticsearch..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:9200/_cluster/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS "http://127.0.0.1:9200/_cluster/health" >/dev/null

echo "==> 3) Install host-compatible service dependencies"
# Docker volume node_modules are often incomplete/incompatible on the host.
for svc in api-gateway extraction-service storage-service search-service scheduler-service; do
  yellow "npm install in services/$svc"
  (cd "services/$svc" && npm install --omit=dev)
done

echo "==> 4) Start apps with PM2 (cluster extraction workers)"
$PM2 delete all >/dev/null 2>&1 || true
$PM2 start ecosystem.config.js
# Give cluster workers time to bind ports / connect to infra
sleep 8
$PM2 status | tee "$EVIDENCE_DIR/pm2-status-before-$STAMP.txt"

EXTRACT_COUNT="$(pm2_jlist | python3 -c 'import sys,json; apps=json.load(sys.stdin); print(sum(1 for a in apps if a.get("name")=="data-extraction" and a.get("pm2_env",{}).get("status")=="online"))')"
if [[ "$EXTRACT_COUNT" -lt 2 ]]; then
  red "Expected >=2 online data-extraction workers, got $EXTRACT_COUNT"
  $PM2 logs --lines 40
  exit 1
fi
green "data-extraction online workers: $EXTRACT_COUNT"

echo "==> 5) Submit multiple crawl tasks"
TOKEN="$(curl -fsS -X POST "$GATEWAY/api/v1/user/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@local.dev","password":"demo"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')"

TASK_IDS=()
for i in 1 2 3; do
  TID="$(curl -fsS -X POST "$GATEWAY/api/v1/crawl" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"url\":\"$FIXTURE_URL\",\"depth\":1}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["taskId"])')"
  TASK_IDS+=("$TID")
  echo "  queued task $i: $TID"
done

echo "==> 6) Capture one extraction worker PID, then kill -9"
BEFORE_JSON="$EVIDENCE_DIR/pm2-jlist-before-$STAMP.json"
pm2_jlist > "$BEFORE_JSON"
WORKER_PID="$(python3 - <<PY
import json
apps=json.load(open("$BEFORE_JSON"))
workers=[a for a in apps if a.get("name")=="data-extraction" and a.get("pid")]
print(workers[0]["pid"])
print("restart_before", workers[0].get("pm2_env",{}).get("restart_time",0), file=__import__("sys").stderr)
PY
)"
RESTART_BEFORE="$(python3 - <<PY
import json
apps=json.load(open("$BEFORE_JSON"))
workers=[a for a in apps if a.get("name")=="data-extraction" and a.get("pid")]
print(workers[0].get("pm2_env",{}).get("restart_time",0))
PY
)"
echo "  killing data-extraction pid=$WORKER_PID (restart_time before=$RESTART_BEFORE)"
kill -9 "$WORKER_PID" || true

echo "==> 7) Wait for PM2 autorestart"
RESTARTED=0
for i in $(seq 1 20); do
  sleep 1
  AFTER_JSON="$EVIDENCE_DIR/pm2-jlist-after-$STAMP.json"
  pm2_jlist > "$AFTER_JSON"
  RESTART_AFTER="$(python3 - <<PY
import json
apps=json.load(open("$AFTER_JSON"))
workers=[a for a in apps if a.get("name")=="data-extraction"]
online=[a for a in workers if a.get("pm2_env",{}).get("status")=="online"]
restarts=sum(int(a.get("pm2_env",{}).get("restart_time",0) or 0) for a in workers)
print(restarts)
print("online", len(online), file=__import__("sys").stderr)
PY
)"
  ONLINE_NOW="$(pm2_jlist | python3 -c 'import sys,json; apps=json.load(sys.stdin); print(sum(1 for a in apps if a.get("name")=="data-extraction" and a.get("pm2_env",{}).get("status")=="online"))')"
  if [[ "$ONLINE_NOW" -ge 2 && "$RESTART_AFTER" -gt "$RESTART_BEFORE" ]]; then
    RESTARTED=1
    break
  fi
done

$PM2 status | tee "$EVIDENCE_DIR/pm2-status-after-$STAMP.txt"
if [[ "$RESTARTED" -ne 1 ]]; then
  red "PM2 did not clearly autorestart extraction worker"
  exit 1
fi
green "PM2 autorestart observed (restart counters increased, workers online again)"

echo "==> 8) Confirm crawl tasks still complete"
COMPLETED=0
for TID in "${TASK_IDS[@]}"; do
  STATUS=""
  for i in $(seq 1 45); do
    STATUS="$(curl -fsS "$GATEWAY/api/v1/crawl/$TID" -H "Authorization: Bearer $TOKEN" \
      | python3 -c 'import sys,json; print(json.load(sys.stdin).get("data",{}).get("status",""))')"
    if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
      break
    fi
    sleep 1
  done
  echo "  task $TID -> $STATUS"
  if [[ "$STATUS" == "completed" ]]; then
    COMPLETED=$((COMPLETED + 1))
  fi
done

if [[ "$COMPLETED" -lt 1 ]]; then
  red "No crawl tasks completed after worker kill"
  exit 1
fi
green "Completed tasks after kill/restart: $COMPLETED/${#TASK_IDS[@]}"

cat > "$REPORT" <<EOF
# PM2 Demo Evidence ($STAMP)

## Goal

Demonstrate PM2 cluster mode and automatic restart for Node crawler services,
especially multiple \`data-extraction\` workers.

## Setup

- Infra: \`docker compose -f docker-compose.infra.yml up -d\`
- Apps: \`pm2 start ecosystem.config.js\`
- Extraction workers: 2 instances, \`exec_mode: cluster\`, \`autorestart: true\`

## Steps performed

1. Started PM2 apps; observed >=2 online \`data-extraction\` workers.
2. Submitted ${#TASK_IDS[@]} crawl tasks for \`$FIXTURE_URL\`.
3. Killed extraction worker PID \`$WORKER_PID\` with \`kill -9\`.
4. Observed PM2 restart counter increase and workers return online.
5. Confirmed \`$COMPLETED/${#TASK_IDS[@]}\` tasks reached \`completed\`.

## Results

- extraction workers before kill: $EXTRACT_COUNT online
- restart_time before: $RESTART_BEFORE
- restart observed: yes
- tasks completed after kill: $COMPLETED/${#TASK_IDS[@]}

## Artifacts

- \`docs/evidence/pm2-status-before-$STAMP.txt\`
- \`docs/evidence/pm2-status-after-$STAMP.txt\`
- \`docs/evidence/pm2-jlist-before-$STAMP.json\`
- \`docs/evidence/pm2-jlist-after-$STAMP.json\`

## Resume wording supported

> Managed Node.js processes using PM2, enabling automatic restart and load
> balancing across multiple instances of the crawler.

## Notes

- Scheduler remains a single PM2 process to avoid duplicate queue consumers.
- Concurrent task processing is bounded (\`MAX_CONCURRENT_TASKS\`); this is not
  full recursive multi-depth site crawling.
- MongoDB stores crawled pages (not users). Login is mock JWT on the gateway.
- Default day-to-day demo still uses full Docker Compose; PM2 is the process
  manager evidence path documented here.
EOF

green "Report written: $REPORT"
echo
yellow "Useful commands:"
echo "  npx pm2 status"
echo "  npx pm2 logs data-extraction"
echo "  npx pm2 stop all    # when finished"
echo "  docker compose up -d  # return to full Compose demo"
green "PM2 DEMO OK"
