import copy
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, distinct, select

from app.AuditDao.audit import Audit
from app.database import AuditModel, SessionLocal, session_scope
from app.questionnaires.versioning import (
    link_audit_to_version,
    questions_for_audit,
    resolve_questionnaire_version,
    serialize_reference,
)


class OpenAudits:
    @staticmethod
    def _normalize_questions(questions):
        normalized = []
        for question in questions:
            clean = {}
            for key, value in question.items():
                if key.startswith("cat") and key.endswith("gorie"):
                    key = "cat\u00e9gorie"
                elif key.startswith("note num") and key.endswith("rique"):
                    key = "note num\u00e9rique"
                elif key.startswith("aide ") and key.endswith(" la notation"):
                    key = "aide \u00e0 la notation"
                clean[key] = value
            normalized.append(clean)
        return normalized

    @staticmethod
    def _uuid(value):
        try:
            return value if isinstance(value, UUID) else UUID(str(value))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _domain(row: AuditModel) -> Audit:
        return Audit(
            str(row.id),
            row.company_name,
            OpenAudits._normalize_questions(copy.deepcopy(row.questionnaire)),
            row.started_at,
            row.chef,
            row.description,
            row.finished_at,
            list(row.auditors or []),
            row.status,
        )

    def get_size(self):
        with SessionLocal() as session:
            return len(session.scalars(select(AuditModel.id)).all())

    def get_list_id(self):
        with SessionLocal() as session:
            return list(session.scalars(select(AuditModel.id)).all())

    def get_listcompanies(self):
        with SessionLocal() as session:
            return list(session.scalars(select(distinct(AuditModel.company_name))).all())

    def CreerAudit(
        self,
        company_name: str,
        chef_auditeurs,
        list_auditeurs,
        description=None,
        questionnaire=None,
        questionnaire_name=None,
        questionnaire_version_id=None,
        created_by="system",
    ):
        with session_scope() as session:
            version = resolve_questionnaire_version(
                session,
                questionnaire=questionnaire,
                questionnaire_name=questionnaire_name,
                questionnaire_version_id=questionnaire_version_id,
                created_by=created_by,
            )
            row = AuditModel(
                company_name=company_name,
                description=description,
                chef=chef_auditeurs,
                auditors=list_auditeurs,
                started_at=datetime.now(timezone.utc),
                questionnaire=questions_for_audit(version),
                status="in_progress",
            )
            session.add(row)
            session.flush()
            link_audit_to_version(session, row.id, version.id)
            session.flush()
            return {
                "audit_id": str(row.id),
                "message": f"Audit créé avec l'identifiant {row.id}.",
                "questionnaire_reference": serialize_reference(version),
            }

    def get_audit(self, audit_id):
        parsed = self._uuid(audit_id)
        if parsed is None:
            return None
        with SessionLocal() as session:
            row = session.get(AuditModel, parsed)
            return self._domain(row) if row else None

    def get_curent(self):
        with SessionLocal() as session:
            return list(session.scalars(select(AuditModel.id).where(AuditModel.status == "in_progress")).all())

    def get_termine(self):
        with SessionLocal() as session:
            return list(session.scalars(select(AuditModel.id).where(AuditModel.status == "finished")).all())

    def delete_audit(self, audit_id):
        parsed = self._uuid(audit_id)
        if parsed:
            with session_scope() as session:
                session.execute(delete(AuditModel).where(AuditModel.id == parsed))

    def delete_all(self):
        with session_scope() as session:
            session.execute(delete(AuditModel))

    def update(self, audit: Audit):
        parsed = self._uuid(audit._id)
        if parsed is None:
            return
        with session_scope() as session:
            row = session.get(AuditModel, parsed)
            if row is None:
                return
            row.questionnaire = copy.deepcopy(audit.fiche)
            row.description = audit.description
            row.chef = audit.chef
            row.auditors = list(audit.list_auditeurs)
            row.finished_at = audit.datefin
            row.status = audit.status

    def delete_auditer(self, audit_id, auditer):
        audit = self.get_audit(audit_id)
        target = auditer.casefold()
        match = next((name for name in audit.list_auditeurs if name.casefold() == target), None)
        if match is None:
            return {"message": f"L'auditeur {auditer} n'appartient pas à cet audit."}
        audit.list_auditeurs.remove(match)
        self.update(audit)
        return {"message": f"L'auditeur {auditer} a été retiré de cet audit."}

    def add_auditer(self, audit_id, auditer):
        audit = self.get_audit(audit_id)
        target = auditer.casefold()
        if any(name.casefold() == target for name in audit.list_auditeurs):
            return {"message": "Cet auditeur est déjà affecté à cet audit."}
        audit.list_auditeurs.append(auditer)
        self.update(audit)
        return {"message": f"L'auditeur {auditer} a été ajouté à cet audit."}

    def remove_chef(self, audit_id, chef):
        audit = self.get_audit(audit_id)
        if audit.chef is None or chef.casefold() != audit.chef.casefold():
            return {"message": "Cet utilisateur n'est pas le chef de cet audit."}
        audit.chef = None
        self.update(audit)
        return {"message": "Le chef d'audit a été retiré."}

    def add_chef(self, audit_id, chef):
        audit = self.get_audit(audit_id)
        if audit.chef is not None:
            return {"message": "Cet audit possède déjà un chef."}
        audit.chef = chef
        self.update(audit)
        return {"message": f"{chef} est maintenant chef de cet audit."}
