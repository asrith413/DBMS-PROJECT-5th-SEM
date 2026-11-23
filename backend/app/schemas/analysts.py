from pydantic import Field

from app.schemas.common import ORMModel, RequestModel
from app.schemas.users import UserSummary


class AnalystCreate(RequestModel):
    user_id: int = Field(gt=0)
    expertise: str = Field(min_length=2, max_length=255)


class AnalystUpdate(RequestModel):
    expertise: str = Field(min_length=2, max_length=255)


class AnalystRead(ORMModel):
    user_id: int
    expertise: str
    workload: int
    user: UserSummary
