# Web Crawler (Microservices Demo)

Containerized Node.js microservices crawler with Redis task scheduling and caching, MongoDB persistence, and Elasticsearch indexing/search.

```text
Browser / Dashboard
        |
        v
   API Gateway
        |
        v
 Task Scheduler ----> Redis queue
        |                  |
        |                  v
        +---------- Extraction worker
                          |
             +------------+------------+
             |                         |
             v                         v
          MongoDB               Elasticsearch
             |                         |
             +-------- Search / cache -+
```

## Quick start

```bash
cp .env.example .env   # or use the existing .env
docker compose up -d --build
```

Open the dashboard: [http://localhost:3000](http://localhost:3000)

Or run the scripted demo:

```bash
chmod +x scripts/demo.sh
./scripts/demo.sh
```

## 2–3 minute demo

1. Open `http://localhost:3000`.
2. Keep the default crawl URL: `http://api-gateway:3000/fixture/demo.html`  
   (this hostname is reachable from containers; do not use `localhost` for crawl targets).
3. Click **Start crawl**. Watch status: `queued` → `processing` → `completed`.
4. Search for `aurora lighthouse` and confirm a hit.
5. Click **Load page** twice. The second response should show source `cache` (Redis).

Optional: crawl `https://example.com` if the host has outbound network access.

## Main API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/user/login` | no | Mock login, returns JWT |
| POST | `/api/v1/crawl` | Bearer | Enqueue crawl task |
| GET | `/api/v1/crawl/:taskId` | Bearer | Task status |
| GET | `/api/v1/search?q=` | no | Search indexed pages |
| GET | `/api/v1/data?url=` | no | Page from MongoDB/Redis |

Example:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/user/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@local.dev","password":"demo"}' | jq -r .token)

curl -s -X POST http://localhost:3000/api/v1/crawl \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://api-gateway:3000/fixture/demo.html","depth":1}'
```

## Services

| Compose service | Port | Role |
|-----------------|------|------|
| api-gateway | 3000 | Public API + dashboard |
| data-extraction | 3001 | Fetch/parse, then store + index |
| data-storage | 3002 | MongoDB + Redis page cache |
| search-indexing | 3003 | Elasticsearch index/search |
| task-scheduler | 3005 | Redis queue producer/consumer |
| mongo / redis / elasticsearch | 27017 / 6379 / 9200 | Data plane |

## What works today

- End-to-end crawl → MongoDB → Elasticsearch → search
- Redis priority queue with atomic `ZPOPMAX` claim and retries
- Redis page cache with visible `cache` / `mongodb` source label
- Mongoose Page/URL models with validation
- Elasticsearch custom `html_strip_analyzer`
- Thin static dashboard for demos
- One-command Compose startup + `scripts/demo.sh`

## PM2 evidence demo

Day-to-day demo uses Docker Compose. For resume evidence of PM2 cluster mode and
automatic restart:

```bash
chmod +x scripts/pm2-demo.sh
npm run pm2:demo
# or: ./scripts/pm2-demo.sh
```

This script:

1. stops Compose **app** containers (keeps mongo/redis/elasticsearch);
2. starts Node services with `pm2 start ecosystem.config.js` (2 extraction workers);
3. submits multiple crawl tasks;
4. `kill -9` one extraction worker;
5. shows PM2 autorestart;
6. confirms tasks still complete;
7. writes a report under `docs/evidence/`.

When finished:

```bash
npx pm2 stop all
docker compose up -d   # back to full Compose demo
```

See also `docs/ARCHITECTURE.md`.

## Clarifications

- **MongoDB** stores crawled pages / URL records — not users.
- **Login** is mock JWT on the API Gateway — not full OAuth.
- **Default deploy** is local Docker Compose.
- **AWS** is a production extension idea, not currently deployed.
- **Concurrent extraction** means bounded parallel tasks, not full recursive crawl.

## Known limitations

- Resume metrics (40% cache / 50% search) are **not measured** yet
- Mock JWT login only; OAuth is unused scaffolding
- Crawl depth / link following is minimal
- No SSRF protection beyond http(s) scheme checks
- At-least-once delivery is basic; full idempotency is future work

## Future work

- Reproducible Redis and Elasticsearch benchmarks for resume numbers
- Bounded concurrent crawl by domain, robots.txt, deeper link graph
- Automated unit/integration tests
- Optional AWS deployment

## Troubleshooting

- If search finds nothing after an old failed index mapping, reset ES:

  ```bash
  docker compose exec elasticsearch curl -X DELETE http://localhost:9200/pages
  docker compose restart search-indexing
  ```

- Crawl URL must be reachable **from the extraction container**. Prefer `http://api-gateway:3000/...` for the local fixture.
