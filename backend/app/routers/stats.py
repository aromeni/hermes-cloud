"""Aggregated statistics endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Incident, IncidentStatus
from app.schemas import StatsResponse

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)) -> StatsResponse:
    """Return aggregate KPI metrics across all incidents."""
    total_result = await db.execute(select(func.count()).select_from(Incident))
    total = total_result.scalar_one()

    success_result = await db.execute(
        select(func.count()).where(Incident.status == IncidentStatus.success)
    )
    success_count = success_result.scalar_one()

    running_result = await db.execute(
        select(func.count()).where(Incident.status == IncidentStatus.running)
    )
    running_count = running_result.scalar_one()

    failed_result = await db.execute(
        select(func.count()).where(Incident.status == IncidentStatus.failed)
    )
    failed_count = failed_result.scalar_one()

    avg_time_result = await db.execute(
        select(func.avg(Incident.time_taken)).where(Incident.time_taken.isnot(None))
    )
    avg_time = avg_time_result.scalar_one() or 0.0

    cost_result = await db.execute(
        select(func.sum(Incident.cost_saved)).where(Incident.cost_saved.isnot(None))
    )
    total_cost_saved = cost_result.scalar_one() or 0.0

    success_rate = (success_count / total * 100) if total > 0 else 0.0

    return StatsResponse(
        total_incidents=total,
        success_rate=round(success_rate, 1),
        avg_time_seconds=round(avg_time, 2),
        total_cost_saved=round(total_cost_saved, 2),
        running_count=running_count,
        failed_count=failed_count,
    )
