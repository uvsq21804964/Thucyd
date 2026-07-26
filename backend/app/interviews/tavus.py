import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ConfigDict, HttpUrl

from app.settings import settings

logger = logging.getLogger(__name__)
TAVUS_CONVERSATIONS_URL = "https://tavusapi.com/v2/conversations"


class TavusConversation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    conversation_id: str
    conversation_url: HttpUrl
    status: str
    meeting_token: str | None = None


@dataclass
class TavusAPIError(Exception):
    status_code: int
    detail: str


def _error_detail(response: httpx.Response) -> str:
    try:
        payload: Any = response.json()
    except ValueError:
        return "Réponse invalide du service Tavus."
    if isinstance(payload, dict):
        for key in ("message", "detail", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                detail = value.strip()[:500]
                if "maximum concurrent conversations" in detail.casefold():
                    return (
                        "La limite de conversations Tavus simultanées est atteinte. "
                        "Reprenez la conversation active ou terminez-la avant de réessayer."
                    )
                return detail
            if isinstance(value, dict):
                nested = value.get("message") or value.get("detail")
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()[:500]
    return "La création de la conversation Tavus a échoué."


def create_tavus_conversation(
    *,
    conversation_name: str,
    conversational_context: str,
    custom_greeting: str,
) -> TavusConversation:
    if not settings.TAVUS_API_KEY:
        raise TavusAPIError(503, "TAVUS_API_KEY n'est pas configurée.")
    if not settings.TAVUS_PERSONA_ID:
        raise TavusAPIError(503, "TAVUS_PERSONA_ID n'est pas configuré.")

    payload: dict[str, Any] = {
        "persona_id": settings.TAVUS_PERSONA_ID,
        "conversation_name": conversation_name[:120],
        "conversational_context": conversational_context,
        "custom_greeting": custom_greeting[:500],
        "require_auth": settings.TAVUS_REQUIRE_AUTH,
        "max_participants": 2,
    }
    if settings.TAVUS_REPLICA_ID:
        payload["replica_id"] = settings.TAVUS_REPLICA_ID

    try:
        response = httpx.post(
            TAVUS_CONVERSATIONS_URL,
            headers={
                "Content-Type": "application/json",
                "x-api-key": settings.TAVUS_API_KEY,
            },
            json=payload,
            timeout=20,
        )
    except httpx.RequestError as exc:
        logger.warning("Tavus conversation request failed: %s", type(exc).__name__)
        raise TavusAPIError(502, "Tavus est temporairement injoignable.") from exc

    if response.is_error:
        detail = _error_detail(response)
        status_code = 409 if "limite de conversations Tavus" in detail else 502
        raise TavusAPIError(status_code, detail)
    try:
        return TavusConversation.model_validate(response.json())
    except (ValueError, TypeError) as exc:
        raise TavusAPIError(502, "Réponse de création Tavus invalide.") from exc


def get_tavus_conversation_status(conversation_id: str) -> str:
    if not settings.TAVUS_API_KEY:
        raise TavusAPIError(503, "TAVUS_API_KEY n'est pas configurée.")
    safe_id = quote(conversation_id, safe="")
    try:
        response = httpx.get(
            f"{TAVUS_CONVERSATIONS_URL}/{safe_id}",
            headers={"x-api-key": settings.TAVUS_API_KEY},
            timeout=10,
        )
    except httpx.RequestError as exc:
        logger.warning("Tavus conversation status request failed: %s", type(exc).__name__)
        raise TavusAPIError(502, "Tavus est temporairement injoignable.") from exc
    if response.status_code == 404:
        return "ended"
    if response.is_error:
        raise TavusAPIError(502, _error_detail(response))
    try:
        payload: Any = response.json()
    except ValueError as exc:
        raise TavusAPIError(502, "Réponse de statut Tavus invalide.") from exc
    status = payload.get("status") if isinstance(payload, dict) else None
    if not isinstance(status, str) or not status.strip():
        raise TavusAPIError(502, "Réponse de statut Tavus invalide.")
    return status.strip().lower()


def end_tavus_conversation(conversation_id: str) -> None:
    if not settings.TAVUS_API_KEY:
        raise TavusAPIError(503, "TAVUS_API_KEY n'est pas configurée.")
    safe_id = quote(conversation_id, safe="")
    try:
        response = httpx.post(
            f"{TAVUS_CONVERSATIONS_URL}/{safe_id}/end",
            headers={"x-api-key": settings.TAVUS_API_KEY},
            timeout=15,
        )
    except httpx.RequestError as exc:
        logger.warning("Tavus end conversation request failed: %s", type(exc).__name__)
        raise TavusAPIError(502, "Tavus est temporairement injoignable.") from exc
    if response.is_error:
        raise TavusAPIError(502, _error_detail(response))
