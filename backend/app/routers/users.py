from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.dependencies import AdminUser, DatabaseSession
from app.models import Role, User
from app.schemas.common import Message
from app.schemas.users import UserCreate, UserRead, UserUpdate
from app.services.auth_service import hash_password


router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserRead])
def list_users(_: AdminUser, db: DatabaseSession) -> list[User]:
    return list(db.scalars(select(User).order_by(User.name)).all())


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, _: AdminUser, db: DatabaseSession) -> User:
    email = payload.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        department=payload.department,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Unable to create this user.") from None
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, _: AdminUser, db: DatabaseSession) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int, payload: UserUpdate, _: AdminUser, db: DatabaseSession
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    values = payload.model_dump(exclude_unset=True)
    password = values.pop("password", None)
    new_role = values.get("role")
    if user.analyst_profile is not None and new_role not in (None, Role.ANALYST):
        raise HTTPException(
            status_code=409,
            detail="Remove the analyst profile before changing this user's role.",
        )
    if user.role == Role.ADMIN and new_role not in (None, Role.ADMIN):
        admin_count = db.scalar(
            select(func.count()).select_from(User).where(User.role == Role.ADMIN)
        ) or 0
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail="The final administrator cannot be demoted.",
            )
    if "email" in values:
        values["email"] = str(values["email"]).lower()
    for field, value in values.items():
        setattr(user, field, value)
    if password:
        user.password_hash = hash_password(password)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email address is already in use.") from None
    db.refresh(user)
    return user


@router.delete("/{user_id}", response_model=Message)
def delete_user(
    user_id: int, current_admin: AdminUser, db: DatabaseSession
) -> Message:
    if current_admin.user_id == user_id:
        raise HTTPException(status_code=409, detail="You cannot delete your own account.")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    db.delete(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This user is referenced by incident history and cannot be deleted.",
        ) from None
    return Message(message="User deleted.")
