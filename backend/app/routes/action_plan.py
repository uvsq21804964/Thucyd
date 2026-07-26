from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import DateTime, ForeignKey, select
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, SessionLocal, session_scope
from app.oauth2 import AuthJWT
from app.routes.GestionAudit import _authorized_audit


class ActionPlanModel(Base):
    __tablename__ = "audit_action_plans"

    audit_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("audits.id", ondelete="CASCADE"),
        primary_key=True,
    )
    items: Mapped[list] = mapped_column(JSONB, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()), max_length=80)
    title: str = Field(min_length=2, max_length=300)
    description: str = Field(default="", max_length=2000)
    question_ref: int | None = Field(default=None, ge=1)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    impact: Literal["low", "medium", "high"] = "medium"
    effort: Literal["low", "medium", "high"] = "medium"
    owner: str = Field(default="", max_length=120)
    due_date: date | None = None
    estimated_cost: float = Field(default=0, ge=0, le=100_000_000)
    human_days: float = Field(default=0, ge=0, le=100_000)
    resources: str = Field(default="", max_length=1000)
    status: Literal["todo", "in_progress", "done"] = "todo"

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("le titre est obligatoire")
        return value


class ActionPlanPayload(BaseModel):
    items: list[ActionItem] = Field(default_factory=list, max_length=100)


router = APIRouter()


@router.get("/audit/{audit_id}/action-plan")
async def get_action_plan(
    audit_id: str,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    _authorized_audit(audit_id, Authorize, access_token)
    parsed_id = UUID(audit_id)
    with SessionLocal() as session:
        plan = session.get(ActionPlanModel, parsed_id)
        return {
            "audit_id": audit_id,
            "items": plan.items if plan else [],
            "updated_at": plan.updated_at if plan else None,
        }


@router.put("/audit/{audit_id}/action-plan")
async def save_action_plan(
    audit_id: str,
    payload: ActionPlanPayload,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    _authorized_audit(audit_id, Authorize, access_token)
    parsed_id = UUID(audit_id)
    serialized = [item.model_dump(mode="json") for item in payload.items]
    with session_scope() as session:
        plan = session.scalar(select(ActionPlanModel).where(ActionPlanModel.audit_id == parsed_id))
        if plan is None:
            plan = ActionPlanModel(audit_id=parsed_id, items=serialized)
            session.add(plan)
        else:
            plan.items = serialized
            plan.updated_at = datetime.now(timezone.utc)
    return {"message": "Plan d'action enregistré", "items": serialized}
