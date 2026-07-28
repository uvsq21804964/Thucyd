import copy
import gzip
import hashlib
import json
import unicodedata
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.database import AuditModel, SessionLocal, session_scope
from app.questionnaires.models import (
    AuditQuestionnaireVersionModel,
    QuestionnaireVersionModel,
)

DEFAULT_FAMILY_KEY = "builtin:thucyd"
DEFAULT_QUESTIONNAIRE_NAME = "Référentiel Thucyd"


class QuestionnaireVersionNotFound(ValueError):
    pass


def normalize_questions(questions: list[dict]) -> list[dict]:
    normalized = []
    for question in copy.deepcopy(questions):
        clean = {}
        for key, value in question.items():
            if key.startswith("cat") and key.endswith("gorie"):
                key = "catégorie"
            elif key.startswith("note num") and key.endswith("rique"):
                key = "note numérique"
            elif key.startswith("aide ") and key.endswith(" la notation"):
                key = "aide à la notation"
            clean[key] = value
        normalized.append(clean)
    return normalized


def pristine_questions(questions: list[dict]) -> list[dict]:
    template = normalize_questions(questions)
    for question in template:
        question["comment"] = None
        question["note numérique"] = None
    return template


def questionnaire_checksum(questions: list[dict]) -> str:
    canonical = json.dumps(
        pristine_questions(questions),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _family_key(name: str, source: str) -> str:
    normalized = unicodedata.normalize("NFKC", name).casefold().strip()
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]
    return f"{source}:{digest}"


def load_default_questionnaire() -> list[dict]:
    source = Path(__file__).resolve().parents[1] / "fiche" / "audit_book.json.gz"
    with gzip.open(source, "rt", encoding="utf-8") as handle:
        return pristine_questions(json.load(handle))


def ensure_questionnaire_version(
    database: Session,
    *,
    name: str,
    source: str,
    questions: list[dict],
    created_by: str,
    family_key: str | None = None,
) -> QuestionnaireVersionModel:
    clean_name = " ".join(name.split())[:255]
    if not clean_name:
        raise ValueError("Le nom du référentiel est obligatoire")
    template = pristine_questions(questions)
    checksum = questionnaire_checksum(template)
    resolved_family = family_key or _family_key(clean_name, source)
    database.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:family_key))"),
        {"family_key": resolved_family},
    )
    existing = database.scalar(
        select(QuestionnaireVersionModel).where(
            QuestionnaireVersionModel.family_key == resolved_family,
            QuestionnaireVersionModel.checksum == checksum,
        )
    )
    if existing is not None:
        return existing
    latest_version = database.scalar(
        select(func.max(QuestionnaireVersionModel.version)).where(
            QuestionnaireVersionModel.family_key == resolved_family
        )
    )
    version = QuestionnaireVersionModel(
        family_key=resolved_family,
        name=clean_name,
        version=int(latest_version or 0) + 1,
        source=source,
        checksum=checksum,
        questions=template,
        created_by=created_by[:120],
    )
    database.add(version)
    database.flush()
    return version


def resolve_questionnaire_version(
    database: Session,
    *,
    questionnaire: list[dict] | None,
    questionnaire_name: str | None,
    questionnaire_version_id: UUID | None,
    created_by: str,
) -> QuestionnaireVersionModel:
    if questionnaire_version_id is not None:
        version = database.get(QuestionnaireVersionModel, questionnaire_version_id)
        if version is None:
            raise QuestionnaireVersionNotFound("Version de questionnaire introuvable")
        return version
    if questionnaire is None:
        return ensure_questionnaire_version(
            database,
            name=DEFAULT_QUESTIONNAIRE_NAME,
            source="builtin",
            questions=load_default_questionnaire(),
            created_by=created_by,
            family_key=DEFAULT_FAMILY_KEY,
        )
    return ensure_questionnaire_version(
        database,
        name=questionnaire_name or "Questionnaire personnalisé",
        source="custom",
        questions=questionnaire,
        created_by=created_by,
    )


def questions_for_audit(version: QuestionnaireVersionModel) -> list[dict]:
    questions = pristine_questions(version.questions)
    for question in questions:
        question["comment"] = ""
    return questions


def link_audit_to_version(
    database: Session,
    audit_id: UUID,
    version_id: UUID,
) -> None:
    database.add(
        AuditQuestionnaireVersionModel(
            audit_id=audit_id,
            questionnaire_version_id=version_id,
        )
    )


def serialize_reference(version: QuestionnaireVersionModel) -> dict:
    return {
        "id": str(version.id),
        "name": version.name,
        "version": version.version,
        "source": version.source,
        "checksum": version.checksum,
        "question_count": len(version.questions or []),
        "created_by": version.created_by,
        "created_at": version.created_at,
    }


def questionnaire_reference_for_audit(audit_id: UUID | str) -> dict | None:
    parsed_id = audit_id if isinstance(audit_id, UUID) else UUID(str(audit_id))
    with SessionLocal() as database:
        version = database.scalar(
            select(QuestionnaireVersionModel)
            .join(
                AuditQuestionnaireVersionModel,
                AuditQuestionnaireVersionModel.questionnaire_version_id
                == QuestionnaireVersionModel.id,
            )
            .where(AuditQuestionnaireVersionModel.audit_id == parsed_id)
        )
        return serialize_reference(version) if version is not None else None


def list_questionnaire_versions() -> list[dict]:
    with SessionLocal() as database:
        versions = database.scalars(
            select(QuestionnaireVersionModel).order_by(
                QuestionnaireVersionModel.name,
                QuestionnaireVersionModel.version.desc(),
            )
        ).all()
        latest_by_family: dict[str, int] = {}
        for version in versions:
            latest_by_family[version.family_key] = max(
                latest_by_family.get(version.family_key, 0), version.version
            )
        return [
            {
                **serialize_reference(version),
                "is_latest": latest_by_family[version.family_key] == version.version,
            }
            for version in versions
        ]


def backfill_questionnaire_versions() -> None:
    default_questions = load_default_questionnaire()
    default_checksum = questionnaire_checksum(default_questions)
    with session_scope() as database:
        database.execute(text("SELECT pg_advisory_xact_lock(731942817)"))
        default_version = ensure_questionnaire_version(
            database,
            name=DEFAULT_QUESTIONNAIRE_NAME,
            source="builtin",
            questions=default_questions,
            created_by="system",
            family_key=DEFAULT_FAMILY_KEY,
        )
        linked_ids = set(
            database.scalars(select(AuditQuestionnaireVersionModel.audit_id)).all()
        )
        audits = database.scalars(select(AuditModel)).all()
        for audit in audits:
            if audit.id in linked_ids:
                continue
            template = pristine_questions(audit.questionnaire)
            checksum = questionnaire_checksum(template)
            if checksum == default_checksum:
                version = default_version
            else:
                version = ensure_questionnaire_version(
                    database,
                    name="Référentiel historique importé",
                    source="legacy",
                    questions=template,
                    created_by="migration",
                    family_key=f"legacy:{checksum[:32]}",
                )
            link_audit_to_version(database, audit.id, version.id)
