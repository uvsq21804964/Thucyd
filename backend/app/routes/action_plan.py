from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException
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
    source: Literal["human", "rules"] = "human"
    validation_status: Literal["pending", "validated", "rejected"] = "pending"
    validation_comment: str = Field(default="", max_length=1000)
    validated_by: str | None = Field(default=None, max_length=120)
    validated_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("le titre est obligatoire")
        return value

    @field_validator("owner", "resources", "validation_comment")
    @classmethod
    def clean_optional_text(cls, value: str):
        return value.strip()


class ActionPlanPayload(BaseModel):
    items: list[ActionItem] = Field(default_factory=list, max_length=100)


class ActionValidationPayload(BaseModel):
    decision: Literal["validated", "rejected"]
    comment: str = Field(default="", max_length=1000)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, value: str):
        return value.strip()


MATERIAL_FIELDS = {
    "title",
    "description",
    "question_ref",
    "priority",
    "impact",
    "effort",
    "owner",
    "due_date",
    "estimated_cost",
    "human_days",
    "resources",
}
TECHNICAL_TERMS = (
    "technique",
    "accès",
    "sauvegarde",
    "réseau",
    "système",
    "vulnérabil",
    "chiffrement",
    "journal",
    "incident",
)
PEOPLE_TERMS = ("rh", "sensibil", "formation", "collaborateur")
SUPPLIER_TERMS = ("fournisseur", "prestataire", "sous-trait", "achat")


def _normalized_items(items: list[dict]) -> list[dict]:
    return [ActionItem.model_validate(item).model_dump(mode="json") for item in items]


def _material_changed(incoming: dict, stored: dict) -> bool:
    return any(incoming.get(field) != stored.get(field) for field in MATERIAL_FIELDS)


def _serialize_saved_item(item: ActionItem, stored: dict | None) -> dict:
    incoming = item.model_dump(mode="json")
    if stored is None:
        incoming.update(
            source="human",
            validation_status="pending",
            validation_comment="",
            validated_by=None,
            validated_at=None,
        )
        return incoming

    previous = ActionItem.model_validate(stored).model_dump(mode="json")
    incoming["source"] = previous["source"]
    if _material_changed(incoming, previous):
        incoming.update(
            validation_status="pending",
            validation_comment="",
            validated_by=None,
            validated_at=None,
        )
    else:
        for field in (
            "validation_status",
            "validation_comment",
            "validated_by",
            "validated_at",
        ):
            incoming[field] = previous[field]
    return incoming


def _gap_profile(question: dict, today: date) -> dict:
    mark = float(question["note numérique"])
    category = str(question.get("catégorie") or "")
    workstream = str(question.get("chantier") or "")
    question_text = " ".join(str(question.get("question") or "").split()).rstrip(" ?")
    context = f"{category} {workstream} {question_text}".casefold()

    if any(term in context for term in TECHNICAL_TERMS):
        owner = "DSI / Équipe IT"
        effort = "high"
        cost = 12_000
        human_days = 12
        resources = "Équipe IT, RSSI et budget d'outillage ou de prestation"
    elif any(term in context for term in PEOPLE_TERMS):
        owner = "RH / RSSI"
        effort = "low"
        cost = 3_000
        human_days = 4
        resources = "RH, RSSI et support de sensibilisation ou de formation"
    elif any(term in context for term in SUPPLIER_TERMS):
        owner = "Achats / RSSI"
        effort = "medium"
        cost = 5_000
        human_days = 6
        resources = "Achats, RSSI, juridique et référents fournisseurs"
    else:
        owner = "RSSI / Direction"
        effort = "medium"
        cost = 5_000
        human_days = 6
        resources = "RSSI, direction métier concernée et appui documentaire"

    critical = mark <= 1
    finding = " ".join(str(question.get("comment") or "").split())
    description = (
        f"Écart relevé avec une note de {mark:g}/4. "
        f"Constat : {finding or question_text}. "
        "Résultat attendu : définir, mettre en œuvre et documenter la mesure corrective, "
        "puis vérifier son efficacité."
    )
    return ActionItem(
        title=f"Mettre en conformité — {question_text}"[:300],
        description=description[:2000],
        question_ref=int(question["ref"]),
        priority="critical" if critical else "high",
        impact="high",
        effort=effort,
        owner=owner,
        due_date=today + timedelta(days=30 if critical else 60),
        estimated_cost=cost,
        human_days=human_days,
        resources=resources,
        status="todo",
        source="rules",
        validation_status="pending",
    ).model_dump(mode="json")


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
            "items": _normalized_items(plan.items) if plan else [],
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
    with session_scope() as session:
        plan = session.scalar(
            select(ActionPlanModel)
            .where(ActionPlanModel.audit_id == parsed_id)
            .with_for_update()
        )
        stored_by_id = {
            str(item.get("id")): item
            for item in (plan.items if plan else [])
            if item.get("id")
        }
        serialized = [
            _serialize_saved_item(item, stored_by_id.get(item.id))
            for item in payload.items
        ]
        if plan is None:
            plan = ActionPlanModel(audit_id=parsed_id, items=serialized)
            session.add(plan)
        else:
            plan.items = serialized
            plan.updated_at = datetime.now(timezone.utc)
    return {"message": "Plan d'action enregistré", "items": serialized}


@router.post("/audit/{audit_id}/action-plan/generate")
async def generate_action_plan(
    audit_id: str,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    audit, _, _ = _authorized_audit(audit_id, Authorize, access_token)
    parsed_id = UUID(audit_id)
    gaps = [
        question
        for question in audit.active_questions()
        if question.get("note numérique") is not None
        and float(question["note numérique"]) < 3
    ]

    with session_scope() as session:
        plan = session.scalar(
            select(ActionPlanModel)
            .where(ActionPlanModel.audit_id == parsed_id)
            .with_for_update()
        )
        current_items = _normalized_items(plan.items) if plan else []
        existing_refs = {
            int(item["question_ref"])
            for item in current_items
            if item.get("question_ref") is not None
        }
        capacity = max(0, 100 - len(current_items))
        proposals = [
            _gap_profile(question, date.today())
            for question in gaps
            if int(question["ref"]) not in existing_refs
        ][:capacity]
        serialized = current_items + proposals
        if plan is None:
            plan = ActionPlanModel(audit_id=parsed_id, items=serialized)
            session.add(plan)
        else:
            plan.items = serialized
            plan.updated_at = datetime.now(timezone.utc)

    return {
        "message": f"{len(proposals)} proposition(s) générée(s) depuis les écarts",
        "generated_count": len(proposals),
        "gap_count": len(gaps),
        "items": serialized,
    }


@router.patch("/audit/{audit_id}/action-plan/items/{item_id}/validation")
async def validate_action_item(
    audit_id: str,
    item_id: str,
    payload: ActionValidationPayload,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    _, _, username = _authorized_audit(audit_id, Authorize, access_token)
    parsed_id = UUID(audit_id)
    with session_scope() as session:
        plan = session.scalar(
            select(ActionPlanModel)
            .where(ActionPlanModel.audit_id == parsed_id)
            .with_for_update()
        )
        if plan is None:
            raise HTTPException(status_code=404, detail="Plan d'action introuvable")
        items = _normalized_items(plan.items)
        selected = next((item for item in items if item["id"] == item_id), None)
        if selected is None:
            raise HTTPException(status_code=404, detail="Action introuvable")

        if payload.decision == "rejected" and not payload.comment:
            raise HTTPException(
                status_code=409,
                detail="Un commentaire est requis pour refuser une proposition",
            )
        if payload.decision == "validated":
            missing = []
            if not str(selected.get("owner") or "").strip():
                missing.append("responsable")
            if not selected.get("due_date"):
                missing.append("échéance")
            if missing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Complétez avant validation : {', '.join(missing)}",
                )
            if date.fromisoformat(selected["due_date"]) < date.today():
                raise HTTPException(
                    status_code=409,
                    detail="L'échéance doit être aujourd'hui ou ultérieure",
                )

        selected["validation_status"] = payload.decision
        selected["validation_comment"] = payload.comment
        selected["validated_by"] = username
        selected["validated_at"] = datetime.now(timezone.utc).isoformat()
        plan.items = items
        plan.updated_at = datetime.now(timezone.utc)

    return {"message": "Validation enregistrée", "item": selected}
