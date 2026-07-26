import base64
from datetime import datetime, timedelta, timezone
from typing import Literal
import jwt
from fastapi import HTTPException, Request, status
from app.settings import settings


class AuthJWT:
    def __init__(self, request: Request):
        self.request = request
        self._payload: dict | None = None

    @staticmethod
    def _private_key() -> str:
        return base64.b64decode(settings.JWT_PRIVATE_KEY).decode("utf-8")

    @staticmethod
    def _public_key() -> str:
        return base64.b64decode(settings.JWT_PUBLIC_KEY).decode("utf-8")

    def _token(self) -> str | None:
        authorization = self.request.headers.get("authorization")
        if authorization and authorization.lower().startswith("bearer "):
            return authorization[7:]
        return self.request.cookies.get("access_token")

    def _create_token(self, subject: str, expires_time: timedelta, token_type: Literal["access", "refresh"]):
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(subject),
            "type": token_type,
            "iat": now,
            "exp": now + expires_time,
        }
        return jwt.encode(payload, self._private_key(), algorithm=settings.JWT_ALGORITHM)

    def create_access_token(self, subject: str, expires_time: timedelta):
        return self._create_token(subject, expires_time, "access")

    def create_refresh_token(self, subject: str, expires_time: timedelta):
        return self._create_token(subject, expires_time, "refresh")

    def jwt_required(self):
        token = self._token()
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentification requise.")
        try:
            payload = jwt.decode(
                token,
                self._public_key(),
                algorithms=[settings.JWT_ALGORITHM],
                options={"require": ["exp", "iat", "sub", "type"]},
            )
            if payload.get("type") != "access":
                raise jwt.InvalidTokenError("Type de jeton invalide")
            self._payload = payload
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalide ou expirée.") from exc

    def get_jwt_subject(self) -> str | None:
        if self._payload is None:
            self.jwt_required()
        return self._payload.get("sub") if self._payload else None


def require_user(Authorize: AuthJWT):
    Authorize.jwt_required()
    return Authorize.get_jwt_subject()