# Architecture Notes

## Current implemented architecture (local)

```text
Dashboard (static)
  → API Gateway
  → Task Scheduler
  → Redis Queue (ZPOPMAX claim)
  → Extraction Workers
  → MongoDB (page persistence)
  → Elasticsearch (search index)
  → Redis Cache (page/search)

Process managers:
  - Day-to-day demo: Docker Compose (all 8 containers)
  - Evidence path: Docker infra + PM2 for Node app processes
```

## Clarifications (interview-safe)

| Topic | Reality |
|-------|---------|
| MongoDB | Stores **crawled pages** (and URL records). Not a user database. |
| Login | API Gateway **mock JWT** for protecting `/crawl`. Not full OAuth. |
| Default deploy | Local **Docker Compose**. |
| PM2 | Supported via `ecosystem.config.js` + `scripts/pm2-demo.sh` for cluster/restart evidence. |
| Concurrent extraction | Scheduler bounds concurrent tasks (`MAX_CONCURRENT_TASKS`). Not full recursive multi-depth crawling. |
| AWS | **Production extension** only (not deployed in this repo today). |

## Production deployment extension (not implemented)

```text
ALB
  → ECS/EKS services
  → Auto Scaling
  → ElastiCache Redis
  → Managed MongoDB-compatible DB
  → OpenSearch / Elasticsearch
  → Prometheus / Grafana
```

Keep this separate from the local demo when drawing architecture diagrams.
