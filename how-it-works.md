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

nginx also injects `Host` and `X-Real-IP` headers on proxied requests so FastAPI sees the original client IP.

FastAPI has CORS middleware (`allow_origins=["*"]`) so direct browser fetch calls also work without the nginx proxy (e.g. when hitting port 8001 in development).

---

## 2. Startup sequence

```
docker compose up
  │
  ├─ backend container starts
  │    └─ entrypoint.sh
  │         ├─ git config --global user.email / user.name  (for hermes commits)
  │         ├─ writes ~/.netrc with GITHUB_TOKEN            (for git push/PR)
  │         └─ uvicorn app.main:app
  │              └─ lifespan() in main.py
  │                   └─ init_db()  ← creates hermes.db + incidents table if missing
  │                   └─ CORS middleware registered
  │
  └─ frontend container waits until backend healthcheck passes
       healthcheck: GET http://localhost:8000/health → {"status": "ok"}
       interval: 10s, timeout: 5s, retries: 5
       └─ once healthy: nginx starts serving pre-built React bundle
```

`database.py:init_db()` uses SQLAlchemy's `Base.metadata.create_all` over the async engine to create the `incidents` table from the `Incident` model in `models.py`.

The `/health` endpoint (`main.py`) is only used by Docker's healthcheck to gate frontend startup — it is not called by the dashboard UI.

---

## 3. Path A — Manual trigger (the UI form)

This is what happens when you fill in the form and click **Run Hermes Fix**.

```
TriggerForm.jsx
  │
  │  User types error text + repo URL + base branch
  │  Clicks submit → handleSubmit()
  │  (form requires traceback starting with "Traceback (most recent call last):")
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
            └─ Returns TriggerResponse { incident_id, message: "Fix queued." }
            │
            ▼
       api.js receives { incident_id, message }
  TriggerForm.jsx:
    ├─ renders green success banner: "✓ Incident <short-id> created — Fix queued."
    ├─ resets all form fields
    └─ calls onTriggered() → App.jsx: refreshAll()   ← immediate poll, no 10s wait
```

FastAPI's `BackgroundTasks` means the HTTP response is sent immediately — the fix runs asynchronously after the response is already back in the browser. The form's `onTriggered` callback triggers an immediate dashboard refresh so the new `pending` row appears without waiting for the next scheduled poll.

---

## 4. Path B — Sentry webhook (automated)

```
Sentry issue alert fires
  │
  └─ POST /webhooks/sentry  (JSON payload)
       │
       ▼
  routers/webhooks.py: sentry_webhook()
       ├─ _extract_sentry_error(payload)
       │    └─ tries event.data.event["title"]
       │         then event.data.event["message"]
       │         fallback: "Unknown Sentry error"
       ├─ _extract_sentry_repo(payload)
       │    └─ pulls tags["repo_url"] from event tags (list-of-tuples format)
       │         fallback: "" (empty string)
       ├─ _create_incident()
       └─ background_tasks.add_task(run_hermes_fix, incident.id)
       └─ Returns TriggerResponse { incident_id, message: "Incident created and fix queued." }
```

Same background pipeline as the manual trigger from here on.

---

## 5. The background task — the core of the system

`tasks.py: run_hermes_fix(incident_id)` does all the heavy lifting:

```
run_hermes_fix(incident_id)
  │
  ├─ DB session #1 → fetch Incident row
  ├─ Set status = "running", updated_at = now(), commit, close session
  │
  ├─ _build_env()
  │    └─ copies os.environ
  │    └─ overlays ANTHROPIC_API_KEY and GITHUB_TOKEN from pydantic-settings
  │
  ├─ asyncio.create_subprocess_exec(
  │      settings.hermes_cli_path, "fix",
  │      "--error",       incident.error_text,
  │      "--repo",        incident.repo_url,
  │      "--base-branch", incident.base_branch,
  │      stdout=PIPE,
  │      stderr=STDOUT,   ← stderr merged into stdout so both are captured together
  │      env=env
  │   )
  │
  │   ← hermes CLI runs here (typically 30–120s)
  │   ← internally: Anthropic API → Claude Code → git clone → patch → pytest → git push → GitHub PR
  │
  ├─ stdout_bytes, _ = await proc.communicate()   ← waits for process exit
  ├─ output = stdout_bytes.decode("utf-8", errors="replace")
  ├─ output_lines = output.splitlines()
  │   ⚠ output_lines are captured but NEVER persisted — no logs column in the DB
  │     failures are currently invisible in the dashboard
  │
  ├─ PR_URL_PATTERN.search(output)
  │    └─ regex: r"https://github\.com/[^\s]+/pull/\d+"
  │         → extracts PR URL from hermes stdout if present
  │
  ├─ returncode == 0  → final_status = "success"
  │  returncode != 0  → final_status = "failed"
  │
  │  exception handlers (set final_status = "failed", output_lines = error message):
  │    FileNotFoundError → hermes CLI not found at '<path>'
  │    Exception         → Unexpected error: <exc>
  │
  ├─ elapsed = time.monotonic() delta
  ├─ cost_saved = settings.cost_per_success ($119.58) if success, else None
  │
  └─ DB session #2 → update Incident
       ├─ status, pr_url, time_taken (rounded to 2dp), cost_saved, updated_at
       └─ commit
```

Two separate DB sessions are used intentionally: the first closes before the long-running subprocess starts so the connection is not held open during the 30–120s fix.

---

## 6. How the dashboard stays current

`App.jsx` polls every 10 seconds **and** immediately after any manual trigger:

```
App.jsx: two refresh triggers
  │
  ├─ setInterval(refreshAll, 10_000)    ← background poll every 10s
  └─ onTriggered callback               ← immediate call from TriggerForm after POST

refreshAll()
  │
  ├─ loadStats()    → GET /api/stats
  │    └─ routers/stats.py: get_stats()
  │         └─ 6 SQL queries on the incidents table:
  │              COUNT(*)                                  → total_incidents
  │              COUNT WHERE status='success'              → success_count
  │              COUNT WHERE status='running'              → running_count
  │              COUNT WHERE status='failed'               → failed_count
  │              AVG(time_taken) WHERE time_taken NOT NULL → avg_time_seconds
  │              SUM(cost_saved) WHERE cost_saved NOT NULL → total_cost_saved
  │         └─ success_rate computed: success_count / total * 100
  │         └─ returns StatsResponse JSON
  │    └─ KPICards.jsx re-renders with new numbers
  │
  └─ loadIncidents(page, pageSize)  → GET /api/incidents?page=1&page_size=20
       └─ routers/incidents.py: list_incidents()
            └─ COUNT(*) for total
            └─ SELECT * FROM incidents ORDER BY created_at DESC LIMIT 20 OFFSET 0
            └─ returns IncidentListResponse { items[], total, page, page_size }
       └─ IncidentTable.jsx re-renders rows
```

There is no WebSocket or push mechanism. If an incident is `running`, it will flip to `success`/`failed` within the next poll cycle (≤10s).

A second read endpoint exists but is not used by the dashboard UI: `GET /api/incidents/{incident_id}` returns a single incident by ID.

---

## 7. Data model — the single source of truth

Everything flows through one SQLite table (`incidents`), backed by `IncidentStatus(str, PyEnum)` with values `pending → running → success | failed`:

| Column | SQLAlchemy type | Set by |
|---|---|---|
| `id` | `String(36)` (UUID) | `_create_incident()` via `uuid.uuid4()` |
| `error_text` | `Text`, NOT NULL | form input / webhook payload |
| `repo_url` | `String(512)`, NOT NULL | form input / webhook payload |
| `base_branch` | `String(256)`, NOT NULL | form input, default `"main"` |
| `status` | `Enum(IncidentStatus)`, NOT NULL | `pending` → `running` → `success`/`failed` |
| `pr_url` | `String(512)`, nullable | regex-extracted from hermes stdout |
| `time_taken` | `Float`, nullable | `time.monotonic()` delta in `tasks.py` |
| `cost_saved` | `Float`, nullable | `$119.58` per success, `None` otherwise |
| `created_at` | `DateTime(timezone=True)` | set at insert |
| `updated_at` | `DateTime(timezone=True)` | updated on every status change |

No `logs` column exists. The hermes subprocess output is decoded and searched for a PR URL but then discarded — failure reasons are not stored and cannot be viewed in the dashboard.

---

## 8. Full call chain — single incident lifecycle

```
User fills form
  → TriggerForm.handleSubmit()
  → api.triggerFix(errorText, repoUrl, baseBranch)
  → POST /api/trigger
  → webhooks.manual_trigger()
  → _create_incident()                    [DB write #1: id, error_text, repo_url, status=pending]
  → BackgroundTasks.add_task(run_hermes_fix, incident.id)
  → HTTP 200 → TriggerResponse { incident_id, message: "Fix queued." }

  [browser, synchronous]
  → TriggerForm shows green banner
  → TriggerForm calls onTriggered() → App.refreshAll()
  → GET /api/stats + GET /api/incidents   [dashboard shows new "pending" row]

  [background, async — 30–120s]
  → tasks.run_hermes_fix(incident_id)
  → DB session #1: status=running, updated_at=now()    [DB write #2]
  → asyncio.create_subprocess_exec("hermes fix ...")
  → hermes: clones repo, calls Anthropic API (Claude), patches code, runs pytest, pushes branch, opens GitHub PR
  → stdout+stderr captured, decoded utf-8
  → PR URL extracted via regex
  → DB session #2: status=success|failed, pr_url, time_taken, cost_saved, updated_at=now()  [DB write #3]

  [next ≤10s poll]
  → App.refreshAll()
  → GET /api/stats   → KPICards updates (success rate, cost saved, avg time)
  → GET /api/incidents → IncidentTable shows green "success" badge + "View PR" link
```

---

## Key files at a glance

| File | Role |
|---|---|
| `docker-compose.yml` | Service wiring, port mapping, healthcheck gate |
| `backend/entrypoint.sh` | Git identity + `~/.netrc` auth before uvicorn |
| `backend/Dockerfile` | Installs hermes, claude CLI, patches `code_agent.py`, copies `sre_protocol.md` |
| `frontend/nginx.conf` | Routes browser requests — SPA fallback vs `/api/` and `/webhooks/` proxy |
| `frontend/src/api.js` | All `fetch()` calls to the backend |
| `frontend/src/App.jsx` | Polling loop + immediate refresh, page/state orchestration |
| `frontend/src/components/TriggerForm.jsx` | User input → `POST /api/trigger` → calls `onTriggered()` |
| `frontend/src/components/IncidentTable.jsx` | Renders incident rows + pagination |
| `frontend/src/components/KPICards.jsx` | Renders the 4 stat cards |
| `backend/app/main.py` | FastAPI app, CORS middleware, lifespan `init_db()`, `/health` endpoint |
| `backend/app/routers/webhooks.py` | Entry points: `POST /api/trigger` and `POST /webhooks/sentry` |
| `backend/app/tasks.py` | Subprocess runner — hermes invocation, PR URL extraction, DB updates |
| `backend/app/routers/stats.py` | 6 SQL aggregations for KPI numbers |
| `backend/app/routers/incidents.py` | Paginated list + single-incident read |
| `backend/app/models.py` | SQLAlchemy schema — `Incident` table + `IncidentStatus` enum |
| `backend/app/database.py` | Async engine, session factory, `init_db()` |
| `backend/patch_hermes.py` | Build-time patch: makes `code_agent.py` pass `ANTHROPIC_API_KEY` to claude subprocess |
| `backend/sre_protocol.md` | SRE prompt file copied into the pip-installed hermes package location |
