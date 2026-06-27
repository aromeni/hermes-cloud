# Hermes Cloud

A full-stack SaaS dashboard for the [Hermes CLI](https://github.com/example/hermes) autonomous bug-fix tool.

- **Backend** — FastAPI + SQLAlchemy (async) + SQLite
- **Frontend** — React + Vite + TailwindCSS
- **Deployment** — Docker Compose (backend + nginx-served frontend)

---

## Quick Start

### 1. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and fill in:
#   ANTHROPIC_API_KEY=sk-ant-...
#   GITHUB_TOKEN=ghp_...
```

### 2. Start with Docker Compose

```bash
docker-compose up --build
```

| Service  | URL                      |
|----------|--------------------------|
| Frontend | http://localhost:3000    |
| Backend  | http://localhost:8000    |
| API docs | http://localhost:8000/docs |

### 3. Run end-to-end smoke test

With the stack running:

```bash
./tests/e2e_test.sh
```

---

## Local Development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in secrets
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` and `/webhooks/*` to `http://localhost:8000`.

---

## API Reference

| Method | Path                       | Description                          |
|--------|----------------------------|--------------------------------------|
| GET    | `/api/incidents`           | Paginated incident list              |
| GET    | `/api/incidents/{id}`      | Single incident                      |
| GET    | `/api/stats`               | Aggregate KPI metrics                |
| POST   | `/api/trigger`             | Manual fix trigger                   |
| POST   | `/webhooks/sentry`         | Sentry issue-alert webhook receiver  |
| GET    | `/health`                  | Liveness probe                       |

Full OpenAPI docs available at `/docs`.

### Manual trigger example

```bash
curl -X POST http://localhost:8000/api/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "error_text": "TypeError: Cannot read property foo of undefined",
    "repo_url": "https://github.com/org/repo",
    "base_branch": "main"
  }'
```

### Sentry webhook example

Configure a Sentry **Issue Alert → Webhook** action pointing at:

```
http://<your-host>/webhooks/sentry
```

---

## Project Structure

```
hermes-cloud/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS, routers
│   │   ├── models.py        # SQLAlchemy Incident model
│   │   ├── database.py      # Async engine + session
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── config.py        # Settings from environment
│   │   ├── tasks.py         # Background hermes subprocess runner
│   │   └── routers/
│   │       ├── incidents.py
│   │       ├── stats.py
│   │       └── webhooks.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── components/
│   │       ├── KPICards.jsx
│   │       ├── IncidentTable.jsx
│   │       └── TriggerForm.jsx
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── tests/
    └── e2e_test.sh
```

---

## Environment Variables

| Variable             | Required | Default                              | Description                          |
|----------------------|----------|--------------------------------------|--------------------------------------|
| `ANTHROPIC_API_KEY`  | Yes      | —                                    | Passed to `hermes fix` subprocess    |
| `GITHUB_TOKEN`       | Yes      | —                                    | Passed to `hermes fix` subprocess    |
| `HERMES_CLI_PATH`    | No       | `hermes`                             | Absolute path to hermes binary       |
| `DATABASE_URL`       | No       | `sqlite+aiosqlite:///./hermes.db`    | SQLAlchemy async database URL        |
| `COST_PER_SUCCESS`   | No       | `119.58`                             | Dollar value credited per success    |

---

## Cost Savings Formula

Each successful fix credits `$119.58` (configurable via `COST_PER_SUCCESS`) — derived from the Hermes CLI dry-run benchmark. The dashboard totals these across all successful incidents.
