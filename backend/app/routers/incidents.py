"""Incidents read endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Incident
from app.schemas import IncidentListResponse, IncidentResponse

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> IncidentListResponse:
    """Return paginated incidents ordered by creation date descending."""
    count_result = await db.execute(select(func.count()).select_from(Incident))
    total = count_result.scalar_one()

    offset = (page - 1) * page_size
    result = await db.execute(
        select(Incident).order_by(Incident.created_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().all()

    return IncidentListResponse(items=list(items), total=total, page=page, page_size=page_size)


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str, db: AsyncSession = Depends(get_db)) -> IncidentResponse:
    """Return a single incident by ID."""
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident
