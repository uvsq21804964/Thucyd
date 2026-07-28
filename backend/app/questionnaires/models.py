from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class QuestionnaireVersionModel(Base):
    __tablename__ = "questionnaire_versions"
    __table_args__ = (
        UniqueConstraint(
            "family_key", "version", name="uq_questionnaire_family_version"
        ),
        UniqueConstraint(
            "family_key", "checksum", name="uq_questionnaire_family_checksum"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    family_key: Mapped[str] = mapped_column(String(96), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    version: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(24), index=True)
    checksum: Mapped[str] = mapped_column(String(64), index=True)
    questions: Mapped[list] = mapped_column(JSONB)
    created_by: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AuditQuestionnaireVersionModel(Base):
    __tablename__ = "audit_questionnaire_versions"

    audit_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("audits.id", ondelete="CASCADE"),
        primary_key=True,
    )
    questionnaire_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("questionnaire_versions.id", ondelete="RESTRICT"),
        index=True,
    )
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
