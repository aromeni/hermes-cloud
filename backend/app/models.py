"""SQLAlchemy ORM models."""
import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IncidentStatus(str, PyEnum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    error_text: Mapped[str] = mapped_column(Text, nullable=False)
    repo_url: Mapped[str] = mapped_column(String(512), nullable=False)
    base_branch: Mapped[str] = mapped_column(String(256), nullable=False, default="main")
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus), nullable=False, default=IncidentStatus.pending
    )
    logs: Mapped[str | None] = mapped_column(Text, nullable=True)
    pr_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    time_taken: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_saved: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
