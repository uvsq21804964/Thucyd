from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, status
from sqlalchemy import func, select

from app import schemas
from app.AuditDao.audit import CATEGORY, NUMERIC_MARK
from app.AuditDao.openaudits import OpenAudits
from app.database import EvidenceModel, SessionLocal, get_user_by_id
from app.get_user_role import UserRole, user_role
from app.oauth2 import AuthJWT

les_audits = OpenAudits()
audit = APIRouter()
ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.ADMIN}
ALL_ROLES = ADMIN_ROLES | {UserRole.AUDITOR}


def _get_audit(audit_id: str):
    found = les_audits.get_audit(audit_id)
    if found is None:
        raise HTTPException(status_code=404, detail="Audit introuvable")
    return found


def _identity(authorize: AuthJWT, access_token: str | None):
    role = user_role(authorize, access_token)
    if role not in ALL_ROLES:
        raise HTTPException(status_code=403, detail="Accès refusé")
    current_user = get_user_by_id(authorize.get_jwt_subject())
    if current_user is None:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return role, current_user.name


def _can_access(item, role: UserRole, username: str) -> bool:
    if role in ADMIN_ROLES:
        return True
    normalized = username.casefold()
    auditors = {name.casefold() for name in item.list_auditeurs}
    return normalized in auditors or (
        item.chef is not None and normalized == item.chef.casefold()
    )


def _authorized_audit(audit_id, authorize, access_token):
    role, username = _identity(authorize, access_token)
    item = _get_audit(audit_id)
    if not _can_access(item, role, username):
        raise HTTPException(status_code=403, detail="Accès refusé à cet audit")
    return item, role, username


def _require_admin(authorize, access_token):
    role, _ = _identity(authorize, access_token)
    if role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Action réservée aux administrateurs")


@audit.post("/createAudit")
@audit.post("/createAudit/", include_in_schema=False)
async def create_audit(payload: schemas.audits, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    _identity(Authorize, access_token)
    questionnaire = None
    if payload.questionnaire is not None:
        questionnaire = [
            {
                **question.model_dump(by_alias=True),
                "comment": "",
                "note numérique": None,
            }
            for question in payload.questionnaire
        ]
    return {
        "message": les_audits.CreerAudit(
            payload.company_name,
            payload.chef_auditeurs,
            payload.list_auditeurs,
            payload.description,
            questionnaire,
        )
    }


def _ensure_editable(item):
    if item.finis():
        raise HTTPException(status_code=409, detail="Un audit termine ne peut plus etre modifie")


@audit.post("/audit/{id}/complete")
async def complete_audit(id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, role, username = _authorized_audit(id, Authorize, access_token)
    if role not in ADMIN_ROLES and (item.chef is None or username.casefold() != item.chef.casefold()):
        raise HTTPException(status_code=403, detail="Action reservee au chef d'audit ou aux administrateurs")
    if item.finis():
        raise HTTPException(status_code=409, detail="Cet audit est deja termine")
    completion = item.incomplete()
    if completion["incomplete"]:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Toutes les questions doivent etre notees avant la cloture",
                **completion,
            },
        )
    with SessionLocal() as session:
        pending_evidence = session.scalar(
            select(func.count()).select_from(EvidenceModel).where(
                EvidenceModel.audit_id == UUID(id), EvidenceModel.status == "pending"
            )
        )
    if pending_evidence:
        raise HTTPException(
            status_code=409,
            detail=f"{pending_evidence} preuve(s) documentaire(s) restent à valider avant la clôture.",
        )
    item.confirmer_terminer()
    les_audits.update(item)
    return {"message": "Audit termine", "audit": item.showinfo()}

def _build_audit_results(item):
    category_totals = {}
    for question in item.fiche:
        category = question[CATEGORY]
        bucket = category_totals.setdefault(category, {"sum": 0, "answered": 0, "total": 0})
        bucket["total"] += 1
        mark = question[NUMERIC_MARK]
        if mark is not None:
            bucket["sum"] += mark
            bucket["answered"] += 1

    categories = [
        {
            "name": name,
            "score": values["sum"] / values["answered"] if values["answered"] else None,
            "answered": values["answered"],
            "total": values["total"],
        }
        for name, values in category_totals.items()
    ]
    answered_marks = [question[NUMERIC_MARK] for question in item.fiche if question[NUMERIC_MARK] is not None]
    return {
        "audit": item.showinfo(),
        "score": sum(answered_marks) / len(answered_marks) if answered_marks else None,
        "answered": len(answered_marks),
        "total_questions": len(item.fiche),
        "categories": categories,
        "questions": item.fiche,
    }


def _evidence_metadata(audit_id: str):
    with SessionLocal() as session:
        rows = session.execute(
            select(
                EvidenceModel.id,
                EvidenceModel.question_ref,
                EvidenceModel.filename,
                EvidenceModel.size,
                EvidenceModel.status,
                EvidenceModel.uploaded_by,
                EvidenceModel.uploaded_at,
                EvidenceModel.reviewed_by,
                EvidenceModel.reviewed_at,
            ).where(EvidenceModel.audit_id == UUID(audit_id))
        ).all()
    return [
        {
            "id": str(row.id),
            "question_ref": row.question_ref,
            "filename": row.filename,
            "size": row.size,
            "status": row.status,
            "uploaded_by": row.uploaded_by,
            "uploaded_at": row.uploaded_at,
            "reviewed_by": row.reviewed_by,
            "reviewed_at": row.reviewed_at,
        }
        for row in rows
    ]


@audit.get("/audit/{id}/results")
async def audit_results(id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(id, Authorize, access_token)
    results = _build_audit_results(item)
    results["evidence"] = _evidence_metadata(id)
    return results

@audit.get("/audit/{id}")
async def get_audit(id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(id, Authorize, access_token)
    return item.showinfo()


def _visible_audits(ids, role, username):
    result = []
    for audit_id in ids:
        item = _get_audit(str(audit_id))
        if _can_access(item, role, username):
            result.append(item.showinfo())
    return result


def _visible_items(role, username):
    items = []
    for audit_id in les_audits.get_list_id():
        item = _get_audit(str(audit_id))
        if _can_access(item, role, username):
            items.append(item)
    return items


@audit.get("/dashboard/stats")
async def dashboard_stats(Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    role, username = _identity(Authorize, access_token)
    items = _visible_items(role, username)
    finished = [item for item in items if item.finis()]
    current = [item for item in items if not item.finis()]
    current_year = datetime.now().year
    monthly = [0] * 12
    for item in finished:
        completed_at = item.datefin or item.date
        if completed_at.year == current_year:
            monthly[completed_at.month - 1] += 1
    return {
        "total": len(items),
        "current": len(current),
        "finished": len(finished),
        "year": current_year,
        "monthly_finished": monthly,
    }

@audit.get("/currentAudits")
async def current_audits(Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    role, username = _identity(Authorize, access_token)
    return _visible_audits(les_audits.get_curent(), role, username)


@audit.get("/finishedAudits")
async def finished_audits(Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    role, username = _identity(Authorize, access_token)
    return _visible_audits(les_audits.get_termine(), role, username)


@audit.get("/categories/{id}")
async def categories(id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(id, Authorize, access_token)
    return list(dict.fromkeys(question[CATEGORY] for question in item.fiche))


@audit.get("/questions/{categorie}/{id}")
def questions(categorie: str, id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(id, Authorize, access_token)
    return [question for question in item.fiche if question[CATEGORY].casefold() == categorie.casefold()]


@audit.put("/audit/{id}/answers/{question_ref}")
async def save_answer(
    id: str,
    question_ref: int,
    payload: schemas.answer,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    item, _, _ = _authorized_audit(id, Authorize, access_token)
    _ensure_editable(item)
    if not item.set_answer(question_ref, payload.mark, payload.comment):
        raise HTTPException(status_code=404, detail="Question introuvable")
    les_audits.update(item)
    return {"message": "Réponse enregistrée", "question_ref": question_ref}

@audit.post("/setMark")
async def set_mark(payload: schemas.setmark, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(payload.id, Authorize, access_token)
    _ensure_editable(item)
    item.set_mark(payload.qst_ref, payload.mark)
    les_audits.update(item)
    return {"message": f"Note attribuée : {payload.mark}"}


@audit.post("/setComment")
async def set_comment(payload: schemas.comment, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(payload.id, Authorize, access_token)
    _ensure_editable(item)
    item.set_comment(payload.qst_ref, payload.comment)
    les_audits.update(item)
    return {"message": "Commentaire ajouté"}


@audit.get("/completionGauge/{id}")
async def completion_gauge(id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(id, Authorize, access_token)
    return item.incomplete()


@audit.post("/setDescription")
async def set_description(payload: schemas.description, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(payload.id, Authorize, access_token)
    _ensure_editable(item)
    item.set_description(payload.description)
    les_audits.update(item)
    return {"message": "Description ajoutée"}


@audit.get("/cyberscore/{id}")
async def cyberscore(id: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, _, _ = _authorized_audit(id, Authorize, access_token)
    return item.CyberScore()


@audit.delete("/delete")
async def delete_audit(payload: schemas.audit, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    _require_admin(Authorize, access_token)
    _get_audit(payload.id)
    les_audits.delete_audit(payload.id)
    return {"message": f"Audit {payload.id} supprimé"}


@audit.delete("/audit/deleteAuditer")
async def delete_auditor(payload: schemas.auditor, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, role, username = _authorized_audit(payload.id, Authorize, access_token)
    if role not in ADMIN_ROLES and (item.chef is None or username.casefold() != item.chef.casefold()):
        raise HTTPException(status_code=403, detail="Action réservée au chef d'audit ou aux administrateurs")
    return les_audits.delete_auditer(payload.id, payload.auditor)


@audit.put("/audit/addAuditer")
async def add_auditor(payload: schemas.auditor, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    item, role, username = _authorized_audit(payload.id, Authorize, access_token)
    if role not in ADMIN_ROLES and (item.chef is None or username.casefold() != item.chef.casefold()):
        raise HTTPException(status_code=403, detail="Action réservée au chef d'audit ou aux administrateurs")
    return les_audits.add_auditer(payload.id, payload.auditor)


@audit.delete("/audit/removeChef")
async def remove_chef(payload: schemas.chef, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    _require_admin(Authorize, access_token)
    _get_audit(payload.id)
    return les_audits.remove_chef(payload.id, payload.chef)


@audit.post("/audit/{id}/addChef")
async def add_chef(id: str, payload: schemas.chef, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    _require_admin(Authorize, access_token)
    if id != payload.id:
        raise HTTPException(status_code=400, detail="Identifiants d'audit incohérents")
    _get_audit(payload.id)
    return les_audits.add_chef(payload.id, payload.chef)
