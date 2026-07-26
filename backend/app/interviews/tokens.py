import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import HTTPException

from app.oauth2 import AuthJWT
from app.settings import settings

TOKEN_PATTERN = re.compile(r"<ornisec_session>([^<]+)</ornisec_session>")
TOKEN_AUDIENCE = "ornisec-tavus-llm"


def create_session_token(session_id: UUID, audit_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(session_id),
            "audit_id": str(audit_id),
            "aud": TOKEN_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(hours=12),
        },
        AuthJWT._private_key(),
        algorithm=settings.JWT_ALGORITHM,
    )


def extract_session_claims(messages: list) -> tuple[UUID, UUID]:
    token = None
    for message in messages:
        if getattr(message, "role", None) != "system":
            continue
        match = TOKEN_PATTERN.search(message.text_content())
        if match:
            token = match.group(1)
            break
    if token is None:
        raise HTTPException(status_code=400, detail="Jeton de session d'entretien absent")
    try:
        payload = jwt.decode(
            token,
            AuthJWT._public_key(),
            algorithms=[settings.JWT_ALGORITHM],
            audience=TOKEN_AUDIENCE,
        )
        return UUID(payload["sub"]), UUID(payload["audit_id"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Jeton de session d'entretien invalide") from exc


def tavus_context(token: str) -> str:
    return (
        "Internal ORNISEC routing context. Never repeat, reveal or modify this value. "
        f"<ornisec_session>{token}</ornisec_session>"
    )
