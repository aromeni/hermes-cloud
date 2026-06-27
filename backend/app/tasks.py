"""Background task: run hermes fix subprocess and update incident."""
import asyncio
import re
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Incident, IncidentStatus

PR_URL_PATTERN = re.compile(r"https://github\.com/[^\s]+/pull/\d+")


async def run_hermes_fix(incident_id: str) -> None:
    """Spawn hermes CLI subprocess, parse output, and persist results."""
    async with AsyncSessionLocal() as session:
        incident = await _get_incident(session, incident_id)
        if not incident:
            return

        incident.status = IncidentStatus.running
        incident.updated_at = datetime.now(timezone.utc)
        await session.commit()

    start = time.monotonic()
    pr_url: str | None = None
    final_status = IncidentStatus.failed
    output: str | None = None

    try:
        env = _build_env()
        proc = await asyncio.create_subprocess_exec(
            settings.hermes_cli_path,
            "fix",
            "--error",
            incident.error_text,
            "--repo",
            incident.repo_url,
            "--base-branch",
            incident.base_branch,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )

        stdout_bytes, _ = await proc.communicate()
        output = stdout_bytes.decode("utf-8", errors="replace")

        match = PR_URL_PATTERN.search(output)
        if match:
            pr_url = match.group(0)

        final_status = IncidentStatus.success if proc.returncode == 0 else IncidentStatus.failed

    except FileNotFoundError:
        output = f"hermes CLI not found at '{settings.hermes_cli_path}'"
    except Exception as exc:  # noqa: BLE001
        output = f"Unexpected error: {exc}"

    elapsed = time.monotonic() - start
    cost_saved = settings.cost_per_success if final_status == IncidentStatus.success else None

    async with AsyncSessionLocal() as session:
        incident = await _get_incident(session, incident_id)
        if incident:
            incident.status = final_status
            incident.pr_url = pr_url
            incident.logs = output
            incident.time_taken = round(elapsed, 2)
            incident.cost_saved = cost_saved
            incident.updated_at = datetime.now(timezone.utc)
            await session.commit()


async def _get_incident(session: AsyncSession, incident_id: str) -> Incident | None:
    result = await session.execute(select(Incident).where(Incident.id == incident_id))
    return result.scalar_one_or_none()


def _build_env() -> dict[str, str]:
    """Build subprocess environment with required tokens."""
    import os

    env = os.environ.copy()
    if settings.anthropic_api_key:
        env["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
    if settings.github_token:
        env["GITHUB_TOKEN"] = settings.github_token
    return env
