from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def enum_values(enum_class: type[Enum]) -> list[str]:
    return [str(member.value) for member in enum_class]


class Role(str, Enum):
    ADMIN = "ADMIN"
    ANALYST = "ANALYST"
    REPORTER = "REPORTER"


class IncidentStatus(str, Enum):
    OPEN = "Open"
    ASSIGNED = "Assigned"
    UNDER_INVESTIGATION = "Under Investigation"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    CLOSED = "Closed"


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(
        SqlEnum(
            Role,
            name="role_enum",
            native_enum=False,
            create_constraint=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=Role.REPORTER,
        index=True,
    )
    department: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    analyst_profile: Mapped[Analyst | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    reported_incidents: Mapped[list[Incident]] = relationship(
        back_populates="reporter", foreign_keys="Incident.reported_by"
    )
    actions: Mapped[list[Action]] = relationship(back_populates="performer")
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="performer")


class Analyst(Base):
    __tablename__ = "analysts"
    __table_args__ = (
        CheckConstraint("workload >= 0", name="analyst_workload_nonnegative"),
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True
    )
    expertise: Mapped[str] = mapped_column(String(255), nullable=False)
    workload: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    user: Mapped[User] = relationship(back_populates="analyst_profile")
    assignments: Mapped[list[IncidentAssignment]] = relationship(
        back_populates="analyst"
    )


class IncidentType(Base):
    __tablename__ = "incident_types"

    type_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    incidents: Mapped[list[Incident]] = relationship(back_populates="incident_type")


class Severity(Base):
    __tablename__ = "severity"
    __table_args__ = (
        CheckConstraint("response_sla_hours > 0", name="response_sla_positive"),
        CheckConstraint("resolution_sla_hours > 0", name="resolution_sla_positive"),
        CheckConstraint(
            "resolution_sla_hours >= response_sla_hours",
            name="resolution_not_shorter_than_response",
        ),
    )

    severity_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    level: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    response_sla_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_sla_hours: Mapped[int] = mapped_column(Integer, nullable=False)

    incidents: Mapped[list[Incident]] = relationship(back_populates="severity")


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint(
            "resolved_date IS NULL OR resolved_date >= reported_date",
            name="resolved_after_reported",
        ),
        Index("ix_incidents_status_reported_date", "status", "reported_date"),
    )

    incident_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    type_id: Mapped[int] = mapped_column(
        ForeignKey("incident_types.type_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    severity_id: Mapped[int] = mapped_column(
        ForeignKey("severity.severity_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    reported_by: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[IncidentStatus] = mapped_column(
        SqlEnum(
            IncidentStatus,
            name="incident_status_enum",
            native_enum=False,
            create_constraint=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=IncidentStatus.OPEN,
        index=True,
    )
    reported_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
        index=True,
    )
    resolved_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    reporter: Mapped[User] = relationship(
        back_populates="reported_incidents", foreign_keys=[reported_by]
    )
    incident_type: Mapped[IncidentType] = relationship(back_populates="incidents")
    severity: Mapped[Severity] = relationship(back_populates="incidents")
    asset_links: Mapped[list[IncidentAsset]] = relationship(
        back_populates="incident", cascade="all, delete-orphan"
    )
    assignments: Mapped[list[IncidentAssignment]] = relationship(
        back_populates="incident", cascade="all, delete-orphan"
    )
    actions: Mapped[list[Action]] = relationship(
        back_populates="incident", cascade="all, delete-orphan"
    )
    threat_actor_links: Mapped[list[IncidentThreatActor]] = relationship(
        back_populates="incident", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="incident")


class Asset(Base):
    __tablename__ = "assets"

    asset_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), unique=True)
    department: Mapped[str] = mapped_column(String(120), nullable=False, index=True)

    incident_links: Mapped[list[IncidentAsset]] = relationship(
        back_populates="asset", passive_deletes="all"
    )


class IncidentAsset(Base):
    __tablename__ = "incident_assets"

    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.incident_id", ondelete="CASCADE"), primary_key=True
    )
    asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.asset_id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )
    impact_type: Mapped[str] = mapped_column(String(120), nullable=False)

    incident: Mapped[Incident] = relationship(back_populates="asset_links")
    asset: Mapped[Asset] = relationship(back_populates="incident_links")


class IncidentAssignment(Base):
    __tablename__ = "incident_assignment"
    __table_args__ = (
        UniqueConstraint(
            "incident_id",
            "analyst_id",
            name="uq_incident_assignment_incident_analyst_once",
        ),
        Index("ix_assignment_incident_date", "incident_id", "assigned_date"),
    )

    assignment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.incident_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    analyst_id: Mapped[int] = mapped_column(
        ForeignKey("analysts.user_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    role: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="Primary Analyst",
        server_default="Primary Analyst",
    )

    incident: Mapped[Incident] = relationship(back_populates="assignments")
    analyst: Mapped[Analyst] = relationship(back_populates="assignments")


class Action(Base):
    __tablename__ = "actions"
    __table_args__ = (Index("ix_actions_incident_date", "incident_id", "action_date"),)

    action_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.incident_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    performed_by: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    action_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    incident: Mapped[Incident] = relationship(back_populates="actions")
    performer: Mapped[User] = relationship(back_populates="actions")


class ThreatActor(Base):
    __tablename__ = "threat_actors"

    actor_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alias: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    incident_links: Mapped[list[IncidentThreatActor]] = relationship(
        back_populates="threat_actor", passive_deletes="all"
    )


class IncidentThreatActor(Base):
    __tablename__ = "incident_threat_actors"

    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.incident_id", ondelete="CASCADE"), primary_key=True
    )
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("threat_actors.actor_id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )

    incident: Mapped[Incident] = relationship(back_populates="threat_actor_links")
    threat_actor: Mapped[ThreatActor] = relationship(back_populates="incident_links")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_timestamp_id", "timestamp", "log_id"),)

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.incident_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    performed_by: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False, index=True
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    action_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
        index=True,
    )

    incident: Mapped[Incident] = relationship(back_populates="audit_logs")
    performer: Mapped[User] = relationship(back_populates="audit_logs")
