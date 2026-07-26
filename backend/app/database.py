from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Integer, String, Text, create_engine, select
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.outils import hash_password
from app.settings import settings


def _database_url() -> str:
    url = settings.DATABASE_URL
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


engine = create_engine(
    _database_url(),
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password: Mapped[str] = mapped_column(String(255))
    role: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AuditModel(Base):
    __tablename__ = "audits"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    chef: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    auditors: Mapped[list] = mapped_column(JSONB, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    questionnaire: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(32), default="in_progress", index=True)


@contextmanager
def session_scope():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_user_by_id(user_id: str | UUID) -> UserModel | None:
    try:
        parsed_id = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    except (TypeError, ValueError):
        return None
    with SessionLocal() as session:
        return session.get(UserModel, parsed_id)


def get_user_by_email(email: str) -> UserModel | None:
    with SessionLocal() as session:
        return session.scalar(select(UserModel).where(UserModel.email == email.lower()))


def init_database() -> None:
    Base.metadata.create_all(engine)
    with session_scope() as session:
        email = settings.INITIAL_ADMIN_EMAIL.lower()
        if session.scalar(select(UserModel).where(UserModel.email == email)) is None:
            session.add(
                UserModel(
                    name="admin",
                    email=email,
                    password=hash_password(settings.INITIAL_ADMIN_PASSWORD),
                    role=0,
                )
            )