"""Webhook and manual trigger endpoints."""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Incident, IncidentStatus
from app.schemas import SentryWebhookPayload, TriggerRequest, TriggerResponse
from app.tasks import run_hermes_fix

router = APIRouter(tags=["webhooks"])


@router.post("/webhooks/sentry", response_model=TriggerResponse)
async def sentry_webhook(
    payload: SentryWebhookPayload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> TriggerResponse:
    """Receive a Sentry issue alert and kick off a Hermes fix run."""
    error_text = _extract_sentry_error(payload)
    repo_url = _extract_sentry_repo(payload)

    incident = await _create_incident(db, error_text=error_text, repo_url=repo_url)
    background_tasks.add_task(run_hermes_fix, incident.id)

    return TriggerResponse(incident_id=incident.id, message="Incident created and fix queued.")


@router.post("/api/trigger", response_model=TriggerResponse)
async def manual_trigger(
    body: TriggerRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> TriggerResponse:
    """Manually trigger a Hermes fix run."""
    incident = await _create_incident(
        db,
        error_text=body.error_text,
        repo_url=body.repo_url,
        base_branch=body.base_branch,
    )
    background_tasks.add_task(run_hermes_fix, incident.id)

    return TriggerResponse(incident_id=incident.id, message="Fix queued.")


async def _create_incident(
    db: AsyncSession,
    *,
    error_text: str,
    repo_url: str,
    base_branch: str = "main",
) -> Incident:
    incident = Incident(
        id=str(uuid.uuid4()),
        error_text=error_text,
        repo_url=repo_url,
        base_branch=base_branch,
        status=IncidentStatus.pending,
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return incident


def _extract_sentry_error(payload: SentryWebhookPayload) -> str:
    """Pull a full traceback out of a Sentry webhook payload.

    Priority:
    1. Custom 'traceback' field on the event (our own webhook format)
    2. Real Sentry exception.values stacktrace (reconstructed into a traceback)
    3. title / message fallback
    """
    try:
        data = payload.data or {}
        event = data.get("event", {}) or {}

        # 1. Custom traceback field
        if event.get("traceback"):
            return event["traceback"]

        # 2. Real Sentry exception format
        exceptions = (event.get("exception") or {}).get("values", [])
        if exceptions:
            exc = exceptions[-1]
            exc_type = exc.get("type", "")
            exc_value = exc.get("value", "")
            frames = (exc.get("stacktrace") or {}).get("frames", [])
            if frames:
                lines = ["Traceback (most recent call last):"]
                for frame in frames:
                    filename = frame.get("filename", "unknown")
                    lineno = frame.get("lineno", "?")
                    function = frame.get("function", "?")
                    context = (frame.get("context_line") or "").strip()
                    lines.append(f'  File "{filename}", line {lineno}, in {function}')
                    if context:
                        lines.append(f"    {context}")
                lines.append(f"{exc_type}: {exc_value}")
                return "\n".join(lines)

        # 3. Fallback
        return event.get("title") or event.get("message") or "Unknown Sentry error"
    except Exception:  # noqa: BLE001
        return "Unknown Sentry error"


def _extract_sentry_repo(payload: SentryWebhookPayload) -> str:
    """Best-effort extraction of a repo URL from Sentry payload metadata.

    Checks data.tags first (our webhook format), then data.event.tags (real Sentry).
    """
    try:
        data = payload.data or {}
        event = data.get("event", {}) or {}

        # Check data.tags (top-level — our own webhook format)
        top_tags = {t[0]: t[1] for t in data.get("tags", []) if isinstance(t, (list, tuple))}
        if top_tags.get("repo_url"):
            return top_tags["repo_url"]

        # Check data.event.tags (real Sentry format)
        event_tags = {t[0]: t[1] for t in event.get("tags", []) if isinstance(t, (list, tuple))}
        return event_tags.get("repo_url", "")
    except Exception:  # noqa: BLE001
        return ""
