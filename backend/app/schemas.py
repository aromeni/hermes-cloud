"""Pydantic schemas for API request/response validation."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, HttpUrl

from app.models import IncidentStatus


class IncidentBase(BaseModel):
    error_text: str
    repo_url: str
    base_branch: str = "main"


class IncidentCreate(IncidentBase):
    pass


class IncidentResponse(IncidentBase):
    id: str
    status: IncidentStatus
    pr_url: Optional[str] = None
    time_taken: Optional[float] = None
    cost_saved: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IncidentListResponse(BaseModel):
    items: list[IncidentResponse]
    total: int
    page: int
    page_size: int


class StatsResponse(BaseModel):
    total_incidents: int
    success_rate: float
    avg_time_seconds: float
    total_cost_saved: float
    running_count: int
    failed_count: int


class SentryWebhookPayload(BaseModel):
    """Minimal subset of a Sentry issue alert webhook."""

    event: Optional[dict] = None
    data: Optional[dict] = None
    project_name: Optional[str] = None


class TriggerRequest(BaseModel):
    error_text: str
    repo_url: str
    base_branch: str = "main"


class TriggerResponse(BaseModel):
    incident_id: str
    message: str
