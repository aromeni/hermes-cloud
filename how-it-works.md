# Hermes Cloud — End-to-End Architecture Walkthrough

---

## 1. How the two services are wired together

```
Browser
  │
  │  HTTP on port 3001
  ▼
nginx (frontend container)
  │
  ├── GET /            → serves React SPA (static files from /usr/share/nginx/html)
  │
  ├── /api/*           → proxy_pass → backend:8000
  └── /webhooks/*      → proxy_pass → backend:8000
                                │
                          FastAPI (uvicorn)
                          port 8000 inside container
```

`frontend/nginx.conf` is the bridge. Every request the browser makes to `/api/` or `/webhooks/` is transparently forwarded to the backend container over Docker's internal network (`backend:8000`). The browser never talks directly to the backend.

---

## 2. Startup sequence

```
docker compose up
  │
  ├─ backend container starts
  │    └─ uvicorn app.main:app
  │         └─ lifespan() in main.py
  │              └─ init_db()  ← creates hermes.db + incidents table if missing
  │
  └─ frontend container starts (waits for backend healthcheck to pass)
       └─ nginx serves pre-built React bundle
```

`database.py:init_db()` uses SQLAlchemy's `Base.metadata.create_all` over the async engine to create the `incidents` table from the `Incident` model definition in `models.py`.

---

## 3. Path A — Manual trigger (the UI form)

This is what happens when you fill in the form and click **Run Hermes Fix**.

```
TriggerForm.jsx
  │
  │  User types error text + repo URL + base branch
  │  Clicks submit → handleSubmit()
  │
  └─ api.js: triggerFix(errorText, repoUrl, baseBranch)
       └─ fetch("POST /api/trigger", { body: JSON })
            │
            │  HTTP POST crosses nginx proxy
            ▼
       routers/webhooks.py: manual_trigger()
            │
            ├─ Parses TriggerRequest (Pydantic validates the body)
            ├─ _create_incident() → inserts row in SQLite with status="pending"
            ├─ background_tasks.add_task(run_hermes_fix, incident.id)
            └─ Returns TriggerResponse { incident_id, message }
            │
            ▼
       api.js receives { incident_id, message }
  TriggerForm.jsx renders green success banner
```

FastAPI's `BackgroundTasks` means the HTTP response is sent immediately — the fix runs asynchronously after the response is already back in the browser.

---

## 4. Path B — Sentry webhook (automated)

```
Sentry issue alert fires
  │
  └─ POST /webhooks/sentry  (JSON payload)
       │
       ▼
  routers/webhooks.py: sentry_webhook()
       ├─ _extract_sentry_error(payload)  ← pulls event.data.event.title
       ├─ _extract_sentry_repo(payload)   ← pulls tags["repo_url"] if present
       ├─ _create_incident()
       └─ background_tasks.add_task(run_hermes_fix, incident.id)
```

Same background pipeline as the manual trigger from here on.

---

## 5. The background task — the core of the system

`tasks.py: run_hermes_fix(incident_id)` does all the heavy lifting:

```
run_hermes_fix(incident_id)
  │
  ├─ Open DB session → fetch Incident row
  ├─ Set status = "running", commit
  │
  ├─ _build_env()
  │    └─ copies os.environ, injects ANTHROPIC_API_KEY + GITHUB_TOKEN from settings
  │
  ├─ asyncio.create_subprocess_exec(
  │      "hermes", "fix",
  │      "--error",       incident.error_text,
  │      "--repo",        incident.repo_url,
  │      "--base-branch", incident.base_branch,
  │      stdout=PIPE, stderr=STDOUT,
  │      env=env
  │   )
  │
  │   ← hermes CLI runs here (could take 30–120s)
  │   ← it calls Anthropic API, clones repo, writes a fix, opens a GitHub PR
  │
  ├─ proc.communicate()  ← waits for process to finish, captures all output
  │
  ├─ PR_URL_PATTERN.search(output)
  │    └─ regex: r"https://github\.com/[^\s]+/pull/\d+"
  │         → extracts PR URL from hermes stdout if present
  │
  ├─ returncode == 0  → status = "success"
  │  returncode != 0  → status = "failed"
  │
  ├─ cost_saved = $119.58 if success else None
  │
  └─ Open DB session → update Incident (status, pr_url, time_taken, cost_saved)
       └─ commit
```

---

## 6. How the dashboard stays current

`App.jsx` polls every 10 seconds:

```
App.jsx: useEffect → refreshAll()
  │
  ├─ fetchStats()   → GET /api/stats
  │    └─ routers/stats.py: get_stats()
  │         └─ 6 SQL aggregate queries on the incidents table:
  │              COUNT(*), COUNT(status=success), COUNT(status=running),
  │              COUNT(status=failed), AVG(time_taken), SUM(cost_saved)
  │         └─ returns StatsResponse JSON
  │    └─ KPICards.jsx re-renders with new numbers
  │
  └─ fetchIncidents(page, pageSize)  → GET /api/incidents?page=1&page_size=20
       └─ routers/incidents.py: list_incidents()
            └─ SELECT * FROM incidents ORDER BY created_at DESC LIMIT 20 OFFSET 0
            └─ returns IncidentListResponse { items[], total, page, page_size }
       └─ IncidentTable.jsx re-renders rows
```

There is no WebSocket or push mechanism — just a `setInterval(refreshAll, 10_000)` in `App.jsx`. If an incident is `running`, it will flip to `success`/`failed` within the next poll cycle.

---

## 7. Data model — the single source of truth

Everything flows through one SQLite table (`incidents`):

| Column | Type | Set by |
|---|---|---|
| `id` | UUID string | `_create_incident()` at creation |
| `error_text` | text | form input / webhook payload |
| `repo_url` | string | form input / webhook payload |
| `base_branch` | string | form input, default `"main"` |
| `status` | enum | `pending` → `running` → `success`/`failed` |
| `pr_url` | string? | regex-extracted from hermes stdout |
| `time_taken` | float? | `time.monotonic()` delta in `tasks.py` |
| `cost_saved` | float? | `$119.58` per success, `null` otherwise |
| `created_at` | datetime | set at insert |
| `updated_at` | datetime | updated on every status change |

---

## 8. Full call chain — single incident lifecycle

```
User fills form
  → TriggerForm.handleSubmit()
  → api.triggerFix()
  → POST /api/trigger
  → webhooks.manual_trigger()
  → _create_incident()          [DB write: status=pending]
  → BackgroundTasks.add_task(run_hermes_fix)
  → HTTP 200 response to browser

  [background, async]
  → tasks.run_hermes_fix()
  → DB update: status=running
  → asyncio.create_subprocess_exec("hermes fix ...")
  → hermes calls Anthropic API, patches code, opens GitHub PR
  → stdout captured, PR URL extracted via regex
  → DB update: status=success, pr_url=..., time_taken=..., cost_saved=119.58

  [next 10s poll]
  → App.refreshAll()
  → GET /api/stats   → KPICards updates
  → GET /api/incidents → IncidentTable shows green "success" badge + "View PR" link
```

---

## Key files at a glance

| File | Role |
|---|---|
| `frontend/nginx.conf` | Routes browser requests — static files vs API proxy |
| `frontend/src/api.js` | All `fetch()` calls to the backend |
| `frontend/src/App.jsx` | Polling loop, page/state orchestration |
| `frontend/src/components/TriggerForm.jsx` | User input → `POST /api/trigger` |
| `frontend/src/components/IncidentTable.jsx` | Renders incident rows + pagination |
| `frontend/src/components/KPICards.jsx` | Renders the 4 stat cards |
| `backend/app/routers/webhooks.py` | Entry point for triggers (manual + Sentry) |
| `backend/app/tasks.py` | Subprocess runner — the actual hermes invocation |
| `backend/app/routers/stats.py` | SQL aggregation for KPI numbers |
| `backend/app/routers/incidents.py` | Paginated incident reads |
| `backend/app/models.py` | SQLAlchemy schema — single `Incident` table |
| `backend/app/database.py` | Async engine, session factory, `init_db()` |
