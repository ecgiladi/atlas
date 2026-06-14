# Atlas

Personal, Hebrew-RTL, map-first **travel discovery & comparison** tool for an Israeli
traveler. See [`NOW.md`](./NOW.md) for vision, model decisions, and roadmap.

## Stack
FastAPI + Next.js 14 (App Router) + PostgreSQL + Redis · Docker (Babel, not SWC) ·
uv (Python) / pnpm (web) · MapLibre GL JS · nginx · `atlas.giladihome.info`.

## Ports (assigned)
| Resource | Host | Container |
|----------|------|-----------|
| Web      | 3003 | 3000 |
| API      | 8003 | 8000 |
| Postgres | 5434 (127.0.0.1) | 5432 |
| Redis    | 6380 (127.0.0.1) | 6379 |

## Dev quickstart
```bash
cp .env.example .env          # set POSTGRES_PASSWORD + REDIS_PASSWORD
docker compose up -d --build

# apply schema (review migration first — see backend/alembic/versions/)
docker compose exec backend alembic upgrade head

# smoke-test seed: continent>country>city>site
docker compose exec backend python -m app.seed
```

API health: `curl http://localhost:8003/api/health`

## Tests
```bash
cd backend && uv run pytest          # inheritance resolver (no DB needed)
```

## Layout
```
backend/   FastAPI app, SQLAlchemy models, Alembic migrations, seed, tests
web/       Next.js 14 App Router (RTL Hebrew)
infra/     nginx site config
```
