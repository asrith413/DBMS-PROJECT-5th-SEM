from datetime import datetime

from pydantic import EmailStr, Field, model_validator

from app.models import Role
from app.schemas.common import (
    ORMModel,
    PasswordValue,
    RequestModel,
    validate_patch_fields,
)


class UserCreate(RequestModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: PasswordValue
    role: Role
    department: str | None = Field(default=None, max_length=120)


class UserUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    role: Role | None = None
    department: str | None = Field(default=None, max_length=120)
    password: PasswordValue | None = None

    @model_validator(mode="after")
    def at_least_one_value(self) -> "UserUpdate":
        validate_patch_fields(self, {"name", "email", "role", "password"})
        return self


class UserSummary(ORMModel):
    user_id: int
    name: str
    email: EmailStr
    role: Role


class UserRead(UserSummary):
    department: str | None
    created_at: datetime
