import hashlib
from datetime import datetime, timezone
from pathlib import PurePath
from typing import Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.database import EvidenceModel, SessionLocal, session_scope
from app.get_user_role import UserRole
from app.oauth2 import AuthJWT
from app.routes.GestionAudit import ADMIN_ROLES, _authorized_audit, _ensure_editable

MAX_EVIDENCE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".txt",
    ".csv",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
}

router = APIRouter()


class EvidenceValidation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["validated", "rejected"]
    comment: str = Field(default="", max_length=500)


def _safe_filename(value: str | None) -> str:
    filename = (value or "document").replace("\\", "/").rsplit("/", 1)[-1]
    filename = "".join(
        character for character in filename if character.isprintable()
    ).strip()
    return filename[:255] or "document"


def _validate_metadata(filename: str, content_type: str) -> None:
    extension = PurePath(filename).suffix.lower()
    if (
        extension not in ALLOWED_EXTENSIONS
        or content_type.lower() not in ALLOWED_CONTENT_TYPES
    ):
        raise HTTPException(
            status_code=415,
            detail="Format non autorisé. Utilisez PDF, image, texte, CSV, Word ou Excel.",
        )


def _question_exists(audit, question_ref: int) -> bool:
    return any(int(question.get("ref", -1)) == question_ref for question in audit.fiche)


def _can_delete(evidence: EvidenceModel, role: UserRole, username: str, audit) -> bool:
    is_lead = audit.chef is not None and username.casefold() == audit.chef.casefold()
    return evidence.status == "pending" and (
        role in ADMIN_ROLES
        or is_lead
        or evidence.uploaded_by.casefold() == username.casefold()
    )


def _serialize(evidence: EvidenceModel, role: UserRole, username: str, audit) -> dict:
    return {
        "id": str(evidence.id),
        "audit_id": str(evidence.audit_id),
        "question_ref": evidence.question_ref,
        "filename": evidence.filename,
        "content_type": evidence.content_type,
        "size": evidence.size,
        "checksum": evidence.checksum,
        "status": evidence.status,
        "uploaded_by": evidence.uploaded_by,
        "uploaded_at": evidence.uploaded_at,
        "reviewed_by": evidence.reviewed_by,
        "reviewed_at": evidence.reviewed_at,
        "review_comment": evidence.review_comment,
        "can_validate": True,
        "can_delete": _can_delete(evidence, role, username, audit),
    }


@router.get("/audits/{audit_id}/questions/{question_ref}/evidence")
async def list_evidence(
    audit_id: str,
    question_ref: int,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    audit, role, username = _authorized_audit(audit_id, Authorize, access_token)
    if not _question_exists(audit, question_ref):
        raise HTTPException(status_code=404, detail="Question introuvable")
    with SessionLocal() as session:
        items = session.scalars(
            select(EvidenceModel)
            .where(
                EvidenceModel.audit_id == UUID(audit_id),
                EvidenceModel.question_ref == question_ref,
            )
            .order_by(EvidenceModel.uploaded_at.desc())
        ).all()
        return [_serialize(item, role, username, audit) for item in items]


@router.post("/audits/{audit_id}/questions/{question_ref}/evidence", status_code=201)
async def upload_evidence(
    audit_id: str,
    question_ref: int,
    document: UploadFile = File(...),
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    audit, role, username = _authorized_audit(audit_id, Authorize, access_token)
    _ensure_editable(audit)
    if not _question_exists(audit, question_ref):
        raise HTTPException(status_code=404, detail="Question introuvable")
    filename = _safe_filename(document.filename)
    content_type = (document.content_type or "application/octet-stream").lower()
    _validate_metadata(filename, content_type)
    try:
        content = await document.read(MAX_EVIDENCE_SIZE + 1)
    finally:
        await document.close()
    if not content:
        raise HTTPException(status_code=422, detail="Le document est vide")
    if len(content) > MAX_EVIDENCE_SIZE:
        raise HTTPException(
            status_code=413, detail="Le document dépasse la limite de 10 Mo"
        )
    evidence = EvidenceModel(
        audit_id=UUID(audit_id),
        question_ref=question_ref,
        filename=filename,
        content_type=content_type,
        size=len(content),
        checksum=hashlib.sha256(content).hexdigest(),
        content=content,
        uploaded_by=username,
    )
    with session_scope() as session:
        session.add(evidence)
    return _serialize(evidence, role, username, audit)


@router.get("/evidence/{evidence_id}/download")
async def download_evidence(
    evidence_id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)
):
    try:
        parsed_id = UUID(evidence_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail="Identifiant de preuve invalide"
        ) from exc
    with SessionLocal() as session:
        evidence = session.get(EvidenceModel, parsed_id)
        if evidence is None:
            raise HTTPException(status_code=404, detail="Preuve introuvable")
        _authorized_audit(str(evidence.audit_id), Authorize, access_token)
        return Response(
            content=evidence.content,
            media_type=evidence.content_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(evidence.filename)}",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )


@router.patch("/evidence/{evidence_id}/validation")
async def validate_evidence(
    evidence_id: str,
    payload: EvidenceValidation,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    try:
        parsed_id = UUID(evidence_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail="Identifiant de preuve invalide"
        ) from exc
    with session_scope() as session:
        evidence = session.get(EvidenceModel, parsed_id)
        if evidence is None:
            raise HTTPException(status_code=404, detail="Preuve introuvable")
        audit, role, username = _authorized_audit(
            str(evidence.audit_id), Authorize, access_token
        )
        _ensure_editable(audit)
        evidence.status = payload.status
        evidence.review_comment = payload.comment.strip() or None
        evidence.reviewed_by = username
        evidence.reviewed_at = datetime.now(timezone.utc)
        session.flush()
        result = _serialize(evidence, role, username, audit)
    return result


@router.delete("/evidence/{evidence_id}", status_code=204)
async def delete_evidence(
    evidence_id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)
):
    try:
        parsed_id = UUID(evidence_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail="Identifiant de preuve invalide"
        ) from exc
    with session_scope() as session:
        evidence = session.get(EvidenceModel, parsed_id)
        if evidence is None:
            raise HTTPException(status_code=404, detail="Preuve introuvable")
        audit, role, username = _authorized_audit(
            str(evidence.audit_id), Authorize, access_token
        )
        _ensure_editable(audit)
        if not _can_delete(evidence, role, username, audit):
            raise HTTPException(
                status_code=403, detail="Suppression de cette preuve non autorisée"
            )
        session.delete(evidence)
    return Response(status_code=204)
