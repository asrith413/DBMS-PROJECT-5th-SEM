from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models import IncidentStatus
from app.schemas.common import RequestModel, validate_patch_fields
from app.schemas.resources import (
    ActionRead,
    AssignmentRead,
    IncidentAssetRead,
    IncidentThreatActorRead,
    IncidentTypeRead,
    SeverityRead,
)
from app.schemas.users import UserSummary


class IncidentCreate(RequestModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=10000)
    type_id: int = Field(gt=0)
    severity_id: int = Field(gt=0)


class IncidentUpdate(RequestModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, min_length=10, max_length=10000)
    type_id: int | None = Field(default=None, gt=0)
    severity_id: int | None = Field(default=None, gt=0)
    status: IncidentStatus | None = None

    @model_validator(mode="after")
    def at_least_one_value(self) -> "IncidentUpdate":
        validate_patch_fields(
            self, {"title", "description", "type_id", "severity_id", "status"}
        )
        return self


class SLAStatus(BaseModel):
    response_deadline: datetime
    resolution_deadline: datetime
    remaining_resolution_hours: float
    response_breached: bool
    resolution_breached: bool
    sla_breached: bool
    state: Literal["Active", "Completed", "Breached"]


class IncidentRead(BaseModel):
    incident_id: int
    title: str
    description: str
    status: IncidentStatus
    reported_date: datetime
    resolved_date: datetime | None
    incident_type: IncidentTypeRead
    severity: SeverityRead
    reporter: UserSummary
    sla: SLAStatus


class IncidentDetail(IncidentRead):
    assignments: list[AssignmentRead] = Field(default_factory=list)
    assets: list[IncidentAssetRead] = Field(default_factory=list)
    actions: list[ActionRead] = Field(default_factory=list)
    threat_actors: list[IncidentThreatActorRead] = Field(default_factory=list)


class SeveritySuggestionRequest(RequestModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=5, max_length=10000)
    incident_type: str = Field(min_length=2, max_length=100)


class SeveritySuggestionResponse(BaseModel):
    suggested_severity: str
    confidence: float
    disclaimer: str
