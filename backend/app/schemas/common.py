from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints


PasswordValue = Annotated[
    str,
    StringConstraints(
        strip_whitespace=False,
        min_length=8,
        max_length=128,
    ),
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RequestModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


def validate_patch_fields(
    model: BaseModel, non_nullable_fields: set[str]
) -> None:
    if not model.model_fields_set:
        raise ValueError("At least one field must be supplied.")
    null_fields = sorted(
        field
        for field in non_nullable_fields & model.model_fields_set
        if getattr(model, field) is None
    )
    if null_fields:
        raise ValueError(f"Fields cannot be null: {', '.join(null_fields)}.")


class Message(BaseModel):
    message: str
