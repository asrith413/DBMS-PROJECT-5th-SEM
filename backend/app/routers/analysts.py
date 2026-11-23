from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app.dependencies import AdminUser, CurrentUser, DatabaseSession
from app.models import Analyst, IncidentAssignment, Role, User
from app.schemas.analysts import AnalystCreate, AnalystRead, AnalystUpdate
from app.schemas.common import Message


router = APIRouter(prefix="/analysts", tags=["Analysts"])


@router.get("", response_model=list[AnalystRead])
def list_analysts(_: AdminUser, db: DatabaseSession) -> list[Analyst]:
    query = select(Analyst).options(joinedload(Analyst.user)).order_by(Analyst.workload, Analyst.user_id)
    return list(db.scalars(query).all())


@router.post("", response_model=AnalystRead, status_code=status.HTTP_201_CREATED)
def create_analyst(
    payload: AnalystCreate, _: AdminUser, db: DatabaseSession
) -> Analyst:
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.role != Role.ANALYST:
        raise HTTPException(status_code=409, detail="The user must have the ANALYST role.")
    if db.get(Analyst, payload.user_id):
        raise HTTPException(status_code=409, detail="Analyst profile already exists.")
    analyst = Analyst(user_id=user.user_id, expertise=payload.expertise, workload=0)
    db.add(analyst)
    db.commit()
    db.refresh(analyst)
    return analyst


@router.get("/{analyst_id}", response_model=AnalystRead)
def get_analyst(
    analyst_id: int, current_user: CurrentUser, db: DatabaseSession
) -> Analyst:
    if current_user.role != Role.ADMIN and current_user.user_id != analyst_id:
        raise HTTPException(status_code=403, detail="You cannot view this analyst profile.")
    analyst = db.scalar(
        select(Analyst).options(joinedload(Analyst.user)).where(Analyst.user_id == analyst_id)
    )
    if analyst is None:
        raise HTTPException(status_code=404, detail="Analyst not found.")
    return analyst


@router.patch("/{analyst_id}", response_model=AnalystRead)
def update_analyst(
    analyst_id: int,
    payload: AnalystUpdate,
    _: AdminUser,
    db: DatabaseSession,
) -> Analyst:
    analyst = db.get(Analyst, analyst_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Analyst not found.")
    analyst.expertise = payload.expertise
    db.commit()
    db.refresh(analyst)
    return analyst


@router.delete("/{analyst_id}", response_model=Message)
def delete_analyst(
    analyst_id: int, _: AdminUser, db: DatabaseSession
) -> Message:
    analyst = db.get(Analyst, analyst_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Analyst not found.")
    has_history = db.scalar(
        select(IncidentAssignment.assignment_id).where(
            IncidentAssignment.analyst_id == analyst_id
        ).limit(1)
    )
    if has_history:
        raise HTTPException(
            status_code=409,
            detail="Analyst has assignment history and cannot be removed.",
        )
    analyst.user.role = Role.REPORTER
    db.delete(analyst)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Analyst cannot be removed.") from None
    return Message(message="Analyst profile deleted.")
