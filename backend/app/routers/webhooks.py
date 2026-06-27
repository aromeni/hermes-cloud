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
    """Pull the error message out of a Sentry webhook payload."""
    try:
        event = payload.data.get("event", {}) if payload.data else {}
        return event.get("title") or event.get("message") or "Unknown Sentry error"
    except Exception:  # noqa: BLE001
        return "Unknown Sentry error"


def _extract_sentry_repo(payload: SentryWebhookPayload) -> str:
    """Best-effort extraction of a repo URL from Sentry payload metadata."""
    try:
        event = payload.data.get("event", {}) if payload.data else {}
        tags = {t[0]: t[1] for t in event.get("tags", []) if isinstance(t, (list, tuple))}
        return tags.get("repo_url", "")
    except Exception:  # noqa: BLE001
        return ""
