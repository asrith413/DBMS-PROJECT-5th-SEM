from pydantic import BaseModel, EmailStr, Field

from app.models import Role
from app.schemas.common import PasswordValue, RequestModel
from app.schemas.users import UserRead


class RegistrationRequest(RequestModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: PasswordValue
    department: str | None = Field(default=None, max_length=120)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class TokenPayload(BaseModel):
    sub: str
    role: Role
