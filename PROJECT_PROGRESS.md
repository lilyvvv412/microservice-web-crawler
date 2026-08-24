# Web Crawler Project Progress

Last updated: 2026-08-08 (`./scripts/validate-demo.sh` 10/10 PASS)

## 1. Project Goal

Turn the purchased starter code into a project that:

- runs locally through Docker Compose;
- provides a complete crawl-to-search demonstration;
- satisfies the main requirements of the original school final project;
- can be explained confidently in an SDE/SWE intern or new-grad interview;
- supports every resume claim with working code, tests, or reproducible measurements.

The intended project story is:

> I initially built a small Express and MongoDB web application as a course
> project, then extended it into a microservices-based web crawler with
> Redis-backed task scheduling and caching, MongoDB persistence,
> Elasticsearch indexing, and containerized deployment.

**Safe demo wording today (`demo.sh` + `validate-demo.sh` + dashboard verified):**

> A containerized microservices web crawler with Redis-backed task scheduling
> and caching, MongoDB persistence, and Elasticsearch indexing and search.

Do **not** claim verified 40%/50% latency numbers until Phase 5 measurements
exist. PM2 cluster and automatic-restart evidence is now available locally;
the day-to-day demo still runs through Docker Compose.

## 2. Target Resume Version

The advisor-provided version is the target specification, not yet the final
verified wording:

- Designed and developed a web crawler with Node.js microservices, including
  data extraction, data storage, an API gateway, search and indexing, and task
  scheduling.
- Managed Node.js processes using PM2, with automatic restart and load
  balancing across multiple crawler instances.
- Used Redis for task queues and caching frequently accessed pages and
  metadata.
- Designed MongoDB data models with Mongoose and input validation.
- Used Elasticsearch to index and search crawled data, including custom
  analyzers and filters.
- Used Promises and async/await to manage concurrent extraction.

The following numbers are **not verified and must not be treated as final**:

- 40% reduction in average response time from Redis;
- 50% improvement in search query speed from Elasticsearch.

These numbers will be replaced by results from reproducible benchmarks.

## 3. School Final Project Requirements

Source reviewed:

`/Users/lilyluo/Downloads/467-finalproj.html`

Important requirements:

- Express and MongoDB;
- at least two Mongoose schemas;
- at least three forms or AJAX interactions;
- input validation and basic security/stability handling;
- at least 10 points of researched/independently implemented topics;
- deployment and supporting documentation;
- tests can count as a research topic.

UI interactions (dashboard):

1. submit a URL for crawling;
2. inspect crawl-task status;
3. search crawled pages;
4. load page detail and show MongoDB vs Redis cache source;
5. optionally recrawl or delete a stored page (still open).

A small static dashboard is sufficient. A separate React app is not required.

## 4. Intended Local Architecture

```text
Browser / Dashboard (api-gateway:3000)
          |
          v
     API Gateway
          |
          v
   Task Scheduler ----> Redis priority queue (ZPOPMAX claim)
          |                    |
          |                    v
          +------------ Extraction worker
                          |
             normalize Page DTO
                          |
             +------------+------------+
             |                         |
             v                         v
     Storage / MongoDB          Search / Elasticsearch
             |                         |
             +---- Redis page/search cache ----+
```

Runtime path:

1. `POST /api/v1/crawl` → Scheduler enqueues Redis task, returns `taskId`
2. Scheduler consumer atomically claims task (`ZPOPMAX`)
3. Consumer calls Extraction `POST /extract`
4. Extraction fetches URL, parses HTML, normalizes Page DTO
5. Extraction `POST` Storage `/api/pages` (MongoDB upsert + Redis cache)
6. Extraction `POST` Search `/api/index` using MongoDB `_id`
7. Scheduler marks task `completed` (Redis key + hash, 7-day TTL)
8. `GET /api/v1/search?q=` → Elasticsearch
9. `GET /api/v1/data?url=` → MongoDB or Redis (`source: cache|mongodb`)

Services:

- API Gateway: public API + static dashboard + fixture page
- Task Scheduler: enqueue, claim, status, retry
- Extraction Service: fetch/parse/persist/index
- Storage Service: Mongoose + MongoDB + Redis page cache
- Search Service: Elasticsearch index/search + Redis search cache
- Redis / MongoDB / Elasticsearch: data plane

## 5. Completed Work

### 5.1 Foundation (earlier)

- corrected mismatched service directory names in Docker Compose;
- corrected service entry points in `package.json` and PM2 configuration;
- added shared configuration and structured logging modules;
- corrected Docker build contexts and Dockerfiles;
- aligned Node Elasticsearch client with Elasticsearch 7.14;
- separated Page and URL Mongoose schemas;
- repaired Task Scheduler initialization and status routes;
- all eight containers previously started successfully.

### 5.2 Demo pipeline (2026-08-08, Cursor)

Code for the stable local demo is in place and **runtime-verified**:

- `./scripts/demo.sh` passed
- `./scripts/validate-demo.sh` passed **10/10** (re-run 2026-08-08)

Implemented:

| Area | Change |
|------|--------|
| Extraction pipeline | `fetch → extract → normalize → Storage → Search` |
| Page DTO alignment | `mainContent→content`, `description→metadata.description`, required `statusCode` |
| URL dedupe | `urlExtractor` uses `Map` keyed by normalized URL |
| HTTP(S) only | reject non-http(s) URLs with 400 |
| Fetch timeout | axios timeout via `REQUEST_TIMEOUT` |
| Header normalize | coerce array headers (e.g. `set-cookie`) to strings for MongoDB |
| Search params | Gateway and Search accept `q` or `query` |
| Scheduler claim | Redis `ZPOPMAX` atomic claim |
| Task status TTL | `crawler:completed:{taskId}` / failed keys with `EX` |
| Compose env | Extraction gets `DATA_STORAGE_URL`, `SEARCH_INDEXING_URL` |
| Dashboard | `services/api-gateway/public/` crawl / status / search / cache source |
| Fixture page | `/fixture/demo.html` with searchable "aurora lighthouse" text |
| Docs/scripts | `README.md`, `.env.example`, `scripts/demo.sh`, `scripts/validate-demo.sh` |
| Progress file | this document |

### 5.3 Key files touched (do not discard)

```text
services/extraction-service/src/app.js
services/extraction-service/src/normalize/pageDocument.js
services/extraction-service/src/extractors/htmlExtractor.js
services/extraction-service/src/extractors/urlExtractor.js
services/scheduler-service/src/queue/consumer.js
services/scheduler-service/src/app.js
services/api-gateway/src/app.js
services/api-gateway/src/routes/index.js
services/api-gateway/public/**                    # dashboard + fixture
services/storage-service/controllers/storage.js   # cache by id + url
services/search-service/src/controllers/search.js # q|query
services/search-service/src/controllers/index.js  # strip _id from ES body
services/search-service/src/elastic/connection.js # 1 shard, 0 replicas
docker-compose.yml
README.md
.env.example
scripts/demo.sh
scripts/validate-demo.sh
PROJECT_PROGRESS.md
```

### 5.4 Demo completion checklist

Target user flow (all verified):

- [x] Open dashboard at `http://localhost:3000`
- [x] Crawl `http://api-gateway:3000/fixture/demo.html` (container-reachable URL)
- [x] Gateway returns `taskId`
- [x] Status moves `queued → processing → completed`
- [x] Extraction parses title/body/links
- [x] Page stored in MongoDB
- [x] Same page indexed in Elasticsearch
- [x] Search `aurora lighthouse` returns a hit
- [x] Second page read shows Redis `source: cache`
- [x] `docker compose up -d --build` + README demo steps

Status:

- [x] implemented in code
- [x] verified on this machine (`./scripts/demo.sh` passed 2026-08-08)
- [x] automated validation (`./scripts/validate-demo.sh` — 10/10 PASS 2026-08-08; re-confirmed under PM2 runtime)
- [x] dashboard opened at `http://localhost:3000` (manual UI check 2026-08-08)
- [x] external crawl `https://example.com` works

Runtime fixes applied during verification:

- Search Service must strip `_id` / `id` from the Elasticsearch document
  body and pass them only as the index API `id` parameter. Otherwise ES
  returns `mapper_parsing_exception: Field [_id] is a metadata field...`
  (fixed in `services/search-service/src/controllers/index.js`).
- Response headers with array values (e.g. GitHub `set-cookie`) must be
  coerced to strings before MongoDB save (fixed in Extraction
  `headersToObject` / `pageDocument` normalize).

### 5.5 Important demo constraint

Extraction runs **inside Docker**. Crawl targets must be reachable from the
container network.

- Good: `http://api-gateway:3000/fixture/demo.html`
- Bad for crawl: `http://localhost:3000/fixture/demo.html` (localhost inside
  the extraction container is not the gateway)

The dashboard defaults to the `api-gateway` hostname for this reason.

## 6. Current Development Plan

### Phase 1 — Foundation

Status: complete.

### Phase 2 — End-to-End Pipeline

Status: **verified**.

Evidence:

- `./scripts/demo.sh` passed
- `./scripts/validate-demo.sh` passed 10/10
- dashboard available at `http://localhost:3000`

If ES mapping is stale from older runs:

```bash
docker compose exec elasticsearch curl -X DELETE http://localhost:9200/pages
docker compose restart search-indexing
```

### Phase 3 — Crawler Correctness

Partially started; not demo-blocking.

Done enough for demo:

- [x] URL normalization/dedupe in extractor
- [x] http(s) scheme check
- [x] fetch timeout
- [x] bounded retries (3)
- [x] max concurrent consumer tasks
- [x] header array → string coercion for MongoDB

Still open:

- [ ] maximum crawl depth / link following
- [ ] per-domain rate limits
- [ ] stronger idempotency
- [ ] `robots.txt`
- [ ] SSRF / private-network protection
- [ ] graceful recovery of in-flight tasks after crash

### Phase 4 — Course-Compatible Dashboard

Status: thin static dashboard shipped and usable for demo.

- [x] crawl submission form
- [x] task-status polling view
- [x] search form and result view
- [x] page detail with MongoDB / Redis cache source label
- [ ] delete / recrawl actions
- [ ] prettier validation messages if school grading needs more form polish

### Phase 5 — Testing and Evidence

- [x] repeatable demo script (`scripts/demo.sh`) — passed
- [x] checklist validator (`scripts/validate-demo.sh`) — 10/10 passed
- [ ] unit tests for parser / DTO / queue claim
- [ ] integration tests for full path
- [ ] Redis cache vs uncached benchmark → replace resume 40% claim
- [ ] Elasticsearch vs MongoDB text search benchmark → replace 50% claim

### Phase 6 — Operations

- [x] PM2 cluster-mode demonstration with evidence (`scripts/pm2-demo.sh`)
- [x] PM2 automatic restart demonstration (kill -9 worker → restart_time++, still online)
- health checks / structured logs exist but can be tightened
- image-size / dependency upgrades later

PM2 evidence (2026-08-08):

- Report: `docs/evidence/pm2-demo-20260808T073452Z.md`
- 2 `data-extraction` cluster workers online
- Killed one worker with `kill -9`; restart counter `0 → 1` and a new pid
- 3/3 crawl tasks completed after kill/restart

```bash
npm run pm2:demo
# artifacts → docs/evidence/pm2-demo-*.md
# afterward: npx pm2 stop all && docker compose up -d
```

### Phase 7 — Optional AWS Extension

Only after local demo + evidence are solid. OAuth is optional scaffolding and
not part of the core demo.

## 7. Video Course Priorities

Screenshots reviewed:

`/Users/lilyluo/Desktop/webcrawler-videotree`

For the current stage, prioritize only what unblocks verification and evidence:

1. Redis crawler practice / queue semantics
2. Elasticsearch `match` / analyzers / document indexing
3. Async concurrency bounds
4. Mocha / unit testing Elasticsearch CRUD
5. Deploy service lessons if packaging for submission

Skip internals (FST, RoaringBitmap, Java ES clients, WeChat OAuth, etc.).

## 8. Interview Topics to Master

- Node.js event loop and async I/O;
- Promise error propagation and bounded concurrency;
- Redis queue (`ZADD` / `ZPOPMAX`) and cache-aside;
- at-least-once processing vs idempotency;
- MongoDB schema validation and upsert-by-URL;
- Elasticsearch inverted index, mappings, custom analyzers;
- API Gateway as BFF for crawl/search;
- sync service calls after async queue claim;
- retry/timeout vs full circuit breaking;
- PM2 cluster vs Docker replica scaling;
- how to design honest latency benchmarks.

## 9. Resume Evidence Checklist

Do not finalize a bullet until the corresponding evidence exists.

- [x] microservice pipeline coded (Gateway→Scheduler→Redis→Extract→Mongo→ES→Search)
- [x] pipeline verified by `./scripts/demo.sh` on this machine
- [x] pipeline validated by `./scripts/validate-demo.sh` (10/10)
- [x] PM2 cluster mode demonstrated (`docs/evidence/pm2-demo-*.md`)
- [x] PM2 automatic restart demonstrated (kill worker → PM2 relaunch)
- [x] Redis queue with atomic claim + retries
- [x] Redis cache hit/miss visible (`source` field + dashboard badge)
- [x] two or more validated Mongoose schemas
- [x] Elasticsearch custom analyzer in index settings
- [x] concurrent extraction bound (`MAX_CONCURRENT_TASKS`)
- [ ] reproducible cache benchmark
- [ ] reproducible search benchmark
- [x] architecture diagram in README
- [x] one-command local startup
- [x] README and demo instructions
- [x] smoke/validation scripts (`demo.sh` + `validate-demo.sh`)
- [ ] unit/integration automated tests
- [ ] optional AWS deployment evidence

## 10. How to Resume Work (for Codex)

Preferred prompt:

> Read `PROJECT_PROGRESS.md` and `docs/ARCHITECTURE.md`. Phase 2 demo is
> verified. Next priority is evidence: run/fix `npm run pm2:demo` first, then
> Redis/ES benchmarks, then Mongoose validation tests. Do not invent 40%/50%
> numbers. Do not start AWS/OAuth unless asked. Keep Compose demo working.
> Clarifications: MongoDB=crawled pages not users; login=mock JWT; AWS=extension.

### Immediate next commands

```bash
cd "/Users/lilyluo/Downloads/Project*3/web crawler"
docker compose up -d --build
./scripts/validate-demo.sh
open http://localhost:3000
```

### If something fails, inspect

```bash
docker compose logs -f task-scheduler data-extraction data-storage search-indexing api-gateway
```

Common issues:

- Docker Desktop not running;
- crawl URL used `localhost` instead of `api-gateway`;
- stale Elasticsearch `pages` index from older mappings;
- Extraction started before Storage/ES were ready (retry should recover);
- array response headers (e.g. `set-cookie`) — already fixed in Extraction normalize.
