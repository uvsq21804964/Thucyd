import json
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.AuditDao.openaudits import OpenAudits
from app.database import AuditModel, EvidenceModel, SessionLocal, session_scope
from app.interviews.turn_engine import process_turn
from app.interviews.models import InterviewSessionModel, InterviewTurnModel
from app.interviews.monitoring import aggregate_latency, session_coverage, session_duration_seconds
from app.interviews.tavus import (
    TavusAPIError,
    create_tavus_conversation,
    end_tavus_conversation,
    get_tavus_conversation_status,
)
from app.interviews.tokens import create_session_token, extract_session_claims, tavus_context
from app.oauth2 import AuthJWT
from app.question_conditions import active_question_refs
from app.routes.GestionAudit import ADMIN_ROLES, _authorized_audit, _identity
from app.settings import settings

router = APIRouter()


def _opening_greeting(company_name: str, total_questions: int) -> str:
    estimated_minutes = max(5, min(45, round(total_questions * 0.75)))
    return (
        f"Bonjour, je suis l'auditeur IA de Thucyd pour l'audit de {company_name}. "
        f"L'entretien peut comporter jusqu'à {total_questions} questions et durera environ {estimated_minutes} minutes. "
        "Vos réponses seront enregistrées automatiquement. Vous pourrez me demander de répéter, "
        "de reformuler, de faire une pause ou de corriger votre dernière réponse. "
        "Êtes-vous prêt à commencer ?"
    )[:500]


def _resume_greeting(
    interview: InterviewSessionModel,
    audit,
    turns: list[InterviewTurnModel],
) -> str:
    state = dict(interview.followups or {})
    stage = str(state.get("stage") or "interview")
    if turns:
        last_prompt = " ".join(str(turns[-1].assistant_text or "").split())
        if last_prompt:
            return f"Rebonjour. Nous reprenons exactement où nous nous étions arrêtés. {last_prompt}"[:500]
    if stage == "closing":
        prompt = str(state.get("closing_prompt") or "").strip()
        if prompt:
            return f"Rebonjour. Reprenons la conclusion de notre entretien. {prompt}"[:500]
    references = [int(reference) for reference in interview.question_refs]
    current_reference = (
        references[min(interview.current_index, len(references) - 1)]
        if references
        else None
    )
    current_question = next(
        (
            question
            for question in audit.fiche
            if current_reference is not None
            and int(question.get("ref", -1)) == current_reference
        ),
        None,
    )
    if current_question is not None:
        return (
            "Rebonjour. Nous reprenons exactement où nous nous étions arrêtés. "
            + str(current_question["question"]).strip()
        )[:500]
    return _opening_greeting(audit.company_name, len(references))

def _latest_capture(turns: list[InterviewTurnModel]) -> dict[str, Any] | None:
    for turn in reversed(turns):
        decision = turn.decision if isinstance(turn.decision, dict) else {}
        updates = decision.get("updates")
        if not isinstance(updates, list) or not updates:
            continue
        items = []
        for update in updates[:2]:
            if not isinstance(update, dict):
                continue
            summary = " ".join(str(update.get("answer_summary") or "").split())
            if not summary:
                continue
            try:
                question_ref = int(update["question_ref"])
                confidence = min(1.0, max(0.0, float(update.get("confidence") or 0)))
            except (KeyError, TypeError, ValueError):
                continue
            raw_evidence = update.get("evidence")
            evidence = (
                [
                    " ".join(str(item).split())
                    for item in raw_evidence[:2]
                    if str(item).strip()
                ]
                if isinstance(raw_evidence, list)
                else []
            )
            mark = update.get("suggested_mark") if confidence >= 0.7 else None
            mark_rationale = " ".join(
                str(update.get("mark_rationale") or "").split()
            )
            items.append(
                {
                    "question_ref": question_ref,
                    "summary": summary[:500],
                    "evidence": evidence,
                    "mark": mark,
                    "mark_rationale": mark_rationale[:500] if mark is not None else None,
                    "confidence": confidence,
                }
            )
        if items:
            return {"recorded_at": turn.created_at, "items": items}
    return None


def _review_summary(
    questions: list[dict],
    turns: list[InterviewTurnModel],
    references: list[int],
    document_evidence: dict[int, list[dict]] | None = None,
) -> dict[str, Any]:
    reference_set = set(references)
    latest_updates: dict[int, dict] = {}
    for turn in turns:
        decision = turn.decision if isinstance(turn.decision, dict) else {}
        updates = decision.get("updates")
        if not isinstance(updates, list):
            continue
        for update in updates:
            if not isinstance(update, dict):
                continue
            try:
                reference = int(update["question_ref"])
            except (KeyError, TypeError, ValueError):
                continue
            if reference in reference_set:
                latest_updates[reference] = update

    items = []
    counts = {"ready": 0, "attention": 0, "unanswered": 0, "without_evidence": 0}
    for question in questions:
        try:
            reference = int(question["ref"])
        except (KeyError, TypeError, ValueError):
            continue
        if reference not in reference_set:
            continue

        comment = str(question.get("comment") or "").strip()
        summary, _, comment_evidence = comment.partition("Preuves mentionnées :")
        summary = " ".join(summary.split())
        update = latest_updates.get(reference)
        if update is not None:
            update_summary = " ".join(str(update.get("answer_summary") or "").split())
            if update_summary != summary:
                update = None

        evidence = []
        confidence = None
        mark_rationale = None
        if update is not None:
            raw_evidence = update.get("evidence")
            if isinstance(raw_evidence, list):
                evidence = [
                    " ".join(str(value).split())
                    for value in raw_evidence
                    if str(value).strip()
                ][:4]
            try:
                confidence = min(1.0, max(0.0, float(update.get("confidence"))))
            except (TypeError, ValueError):
                confidence = None
            mark_rationale = " ".join(
                str(update.get("mark_rationale") or "").split()
            ) or None
        elif comment_evidence.strip():
            evidence = [
                value.strip()
                for value in comment_evidence.split(";")
                if value.strip()
            ][:4]

        documents = (document_evidence or {}).get(reference, [])
        validated_documents = [
            document["filename"]
            for document in documents
            if document["status"] == "validated"
        ]
        for filename in validated_documents:
            label = f"Document : {filename}"
            if label not in evidence:
                evidence.append(label)
        has_pending_document = any(
            document["status"] == "pending" for document in documents
        )
        has_rejected_document = any(
            document["status"] == "rejected" for document in documents
        )

        mark = question.get("note numérique")
        marking_guide = question.get("aide à la notation") or []
        reasons = []
        if not summary:
            status = "unanswered"
            reasons.append("Aucune réponse enregistrée")
        else:
            if confidence is not None and confidence < 0.8:
                reasons.append("Niveau de confiance à confirmer")
            if mark is None:
                reasons.append(
                    "Note à valider selon l'aide à la notation"
                    if marking_guide
                    else "Note à compléter"
                )
            if has_pending_document:
                reasons.append("Preuve documentaire à valider")
            elif has_rejected_document and not validated_documents:
                reasons.append("Preuve documentaire refusée")
            status = "attention" if reasons else "ready"

        without_evidence = bool(summary) and not evidence
        if without_evidence:
            counts["without_evidence"] += 1
        counts[status] += 1
        items.append(
            {
                "question_ref": reference,
                "category": str(question.get("catégorie") or ""),
                "workstream": str(question.get("chantier") or ""),
                "question": str(question.get("question") or ""),
                "summary": summary,
                "mark": mark,
                "mark_rationale": mark_rationale,
                "confidence": confidence,
                "evidence": evidence,
                "without_evidence": without_evidence,
                "status": status,
                "reasons": reasons,
            }
        )
    counts["total"] = len(items)
    return {"counts": counts, "items": items}

def _document_evidence_index(database, audit_id: UUID) -> dict[int, list[dict]]:
    rows = database.execute(
        select(
            EvidenceModel.question_ref,
            EvidenceModel.filename,
            EvidenceModel.status,
        ).where(EvidenceModel.audit_id == audit_id)
    ).all()
    result: dict[int, list[dict]] = {}
    for question_ref, filename, status in rows:
        result.setdefault(question_ref, []).append(
            {"filename": filename, "status": status}
        )
    return result


def _session_details(
    interview: InterviewSessionModel,
    audit,
    turns: list[InterviewTurnModel],
    document_evidence: dict[int, list[dict]] | None = None,
) -> dict[str, Any]:
    state = dict(interview.followups or {})
    all_references = [int(reference) for reference in interview.question_refs]
    references = active_question_refs(audit.fiche)
    covered_refs = {
        int(reference)
        for reference in state.get("covered_refs", [])
        if int(reference) in references
    }
    current_reference = (
        all_references[min(interview.current_index, len(all_references) - 1)]
        if all_references
        else None
    )
    current_question = next(
        (
            question
            for question in audit.fiche
            if current_reference is not None
            and int(question.get("ref", -1)) == current_reference
        ),
        None,
    )
    return {
        "session_id": str(interview.id),
        "audit_id": str(interview.audit_id),
        "company_name": audit.company_name,
        "status": interview.status,
        "current_index": interview.current_index,
        "total_questions": len(references),
        "answered_questions": len(covered_refs),
        "stage": state.get("stage", "interview"),
        "resumable": interview.status in {"active", "interrupted", "interrupting"}
        and state.get("stage") != "completed",
        "current_question": (
            {
                "ref": int(current_question["ref"]),
                "category": str(current_question.get("catégorie") or ""),
                "workstream": str(current_question.get("chantier") or ""),
            }
            if current_question is not None
            else None
        ),
        "last_saved_at": turns[-1].created_at if turns else None,
        "latest_capture": _latest_capture(turns),
        "review": _review_summary(audit.fiche, turns, references, document_evidence),
        "closing_notes": list(state.get("closing_notes") or []),
        "tavus": state.get("tavus"),
        "turns": [
            {
                "question_ref": turn.question_ref,
                "transcript": turn.transcript,
                "assistant_text": turn.assistant_text,
                "decision": turn.decision,
                "created_at": turn.created_at,
            }
            for turn in turns
        ],
    }


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: Literal["system", "user", "assistant", "tool"]
    content: Any

    def text_content(self) -> str:
        if isinstance(self.content, str):
            return self.content
        if isinstance(self.content, list):
            parts = []
            for item in self.content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            return " ".join(parts)
        return str(self.content or "")


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str = "ornisec-interviewer"
    messages: list[ChatMessage] = Field(min_length=1, max_length=200)
    stream: bool = True


def _authenticate_tavus(authorization: str | None):
    expected = settings.TAVUS_LLM_API_KEY
    if not expected:
        raise HTTPException(status_code=503, detail="Passerelle Tavus non configurée")
    scheme, _, supplied = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Clé de passerelle invalide")


def _chunk(identifier: str, model: str, content: str | None, finish_reason=None):
    delta = {"content": content} if content is not None else {}
    return {
        "id": identifier,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    }


async def _stream_response(text: str, model: str):
    identifier = f"chatcmpl-{uuid4().hex}"
    yield f"data: {json.dumps(_chunk(identifier, model, None), ensure_ascii=False)}\n\n"
    words = text.split(" ")
    for index, word in enumerate(words):
        content = word if index == len(words) - 1 else f"{word} "
        yield f"data: {json.dumps(_chunk(identifier, model, content), ensure_ascii=False)}\n\n"
    yield f"data: {json.dumps(_chunk(identifier, model, None, 'stop'), ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"



def _session_response(
    interview: InterviewSessionModel,
    audit_id: UUID,
    custom_greeting: str,
    tavus_state: dict[str, Any],
    *,
    reused: bool,
    resumed: bool = False,
):
    return {
        "session_id": str(interview.id),
        "audit_id": str(audit_id),
        "status": "active",
        "custom_greeting": custom_greeting,
        "reused": reused,
        "resumed": resumed,
        "tavus": tavus_state,
    }


def _load_turns(database, session_id: UUID) -> list[InterviewTurnModel]:
    return database.scalars(
        select(InterviewTurnModel)
        .where(InterviewTurnModel.session_id == session_id)
        .order_by(InterviewTurnModel.created_at)
    ).all()


async def _create_resume_conversation(
    interview: InterviewSessionModel,
    audit,
    turns: list[InterviewTurnModel],
) -> tuple[dict[str, Any], str]:
    greeting = _resume_greeting(interview, audit, turns)
    token = create_session_token(interview.id, interview.audit_id)
    try:
        tavus = await run_in_threadpool(
            create_tavus_conversation,
            conversation_name=f"Reprise audit ORNISEC - {audit.company_name}"[:120],
            conversational_context=tavus_context(token),
            custom_greeting=greeting,
        )
    except TavusAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return (
        {
            "conversation_id": tavus.conversation_id,
            "conversation_url": str(tavus.conversation_url),
            "meeting_token": tavus.meeting_token,
            "status": tavus.status,
            "resumed_at": time.time(),
        },
        greeting,
    )


async def _reuse_active_session(
    audit_id: UUID,
    custom_greeting: str,
):
    with SessionLocal() as database:
        interview = database.scalar(
            select(InterviewSessionModel)
            .where(
                InterviewSessionModel.audit_id == audit_id,
                InterviewSessionModel.status == "active",
            )
            .order_by(InterviewSessionModel.created_at.desc())
            .limit(1)
        )
        if interview is None:
            return None
        tavus_state = dict(interview.followups or {}).get("tavus") or {}
        conversation_id = tavus_state.get("conversation_id")
        conversation_url = tavus_state.get("conversation_url")
        if not conversation_id or not conversation_url:
            return None
        session_id = interview.id

    try:
        provider_status = await run_in_threadpool(
            get_tavus_conversation_status,
            conversation_id,
        )
    except TavusAPIError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Impossible de vérifier la salle Tavus existante. "
                "Réessayez dans quelques instants."
            ),
        ) from exc

    if provider_status == "active":
        tavus_state["status"] = "active"
        with SessionLocal() as database:
            interview = database.get(InterviewSessionModel, session_id)
            if interview is None:
                return None
            return _session_response(
                interview,
                audit_id,
                custom_greeting,
                tavus_state,
                reused=True,
            )

    with session_scope() as database:
        interview = database.get(InterviewSessionModel, session_id)
        if interview is not None:
            state = dict(interview.followups or {})
            previous_tavus = dict(state.get("tavus") or {})
            previous_tavus["status"] = provider_status
            state["tavus"] = previous_tavus
            interview.followups = state
            interview.status = "ended"
    return None


@router.get("/interview-monitoring")
async def interview_monitoring(
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    role, username = _identity(Authorize, access_token)
    normalized_user = username.casefold()
    with SessionLocal() as database:
        audit_rows = database.scalars(select(AuditModel)).all()
        visible_audits = {
            audit.id: audit
            for audit in audit_rows
            if role in ADMIN_ROLES
            or normalized_user in {
                str(auditor).casefold() for auditor in (audit.auditors or [])
            }
            or (
                audit.chef is not None
                and normalized_user == audit.chef.casefold()
            )
        }
        if not visible_audits:
            return _empty_monitoring_payload()

        sessions = database.scalars(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.audit_id.in_(list(visible_audits)))
            .order_by(InterviewSessionModel.updated_at.desc())
        ).all()
        latest_by_audit: dict[UUID, InterviewSessionModel] = {}
        for interview in sessions:
            latest_by_audit.setdefault(interview.audit_id, interview)
        selected_sessions = list(latest_by_audit.values())
        session_ids = [interview.id for interview in selected_sessions]
        turns = (
            database.scalars(
                select(InterviewTurnModel)
                .where(InterviewTurnModel.session_id.in_(session_ids))
                .order_by(InterviewTurnModel.created_at)
            ).all()
            if session_ids
            else []
        )
        turns_by_session: dict[UUID, list[InterviewTurnModel]] = {}
        for turn in turns:
            turns_by_session.setdefault(turn.session_id, []).append(turn)
        evidence_by_audit: dict[UUID, dict[int, list[dict]]] = {}
        if selected_sessions:
            evidence_rows = database.execute(
                select(
                    EvidenceModel.audit_id,
                    EvidenceModel.question_ref,
                    EvidenceModel.filename,
                    EvidenceModel.status,
                ).where(
                    EvidenceModel.audit_id.in_(
                        [interview.audit_id for interview in selected_sessions]
                    )
                )
            ).all()
            for audit_id, question_ref, filename, status in evidence_rows:
                audit_evidence = evidence_by_audit.setdefault(audit_id, {})
                audit_evidence.setdefault(question_ref, []).append(
                    {"filename": filename, "status": status}
                )

        session_rows = []
        interventions = []
        covered_total = 0
        question_total = 0
        response_total = 0
        completed_durations = []
        for interview in selected_sessions:
            audit_row = visible_audits[interview.audit_id]
            audit = OpenAudits._domain(audit_row)
            session_turns = turns_by_session.get(interview.id, [])
            coverage = session_coverage(interview, audit.fiche)
            covered_total += int(coverage["covered"])
            question_total += int(coverage["total"])
            duration = session_duration_seconds(interview, session_turns)
            if interview.status == "completed" and duration is not None:
                completed_durations.append(duration)
            review = _review_summary(
                audit.fiche,
                session_turns,
                active_question_refs(audit.fiche),
                evidence_by_audit.get(interview.audit_id),
            )
            response_total += review["counts"]["ready"] + review["counts"]["attention"]
            session_latency = aggregate_latency(session_turns)
            attention_items = [
                item for item in review["items"] if item["status"] == "attention"
            ]
            for item in attention_items:
                interventions.append(
                    {
                        "audit_id": str(interview.audit_id),
                        "session_id": str(interview.id),
                        "company_name": audit.company_name,
                        "question_ref": item["question_ref"],
                        "question": item["question"],
                        "category": item["category"],
                        "summary": item["summary"],
                        "confidence": item["confidence"],
                        "reasons": item["reasons"],
                    }
                )
            session_rows.append(
                {
                    "session_id": str(interview.id),
                    "audit_id": str(interview.audit_id),
                    "company_name": audit.company_name,
                    "status": interview.status,
                    "created_at": interview.created_at,
                    "updated_at": interview.updated_at,
                    "duration_seconds": duration,
                    "turn_count": len(session_turns),
                    "coverage": coverage,
                    "human_intervention_count": len(attention_items),
                    "average_latency_ms": session_latency["average_total_ms"],
                }
            )

    interventions.sort(
        key=lambda item: (
            len(item["reasons"]),
            -(item["confidence"] if item["confidence"] is not None else 0),
        ),
        reverse=True,
    )
    human_count = len(interventions)
    return {
        "generated_at": datetime.now(timezone.utc),
        "summary": {
            "session_count": len(session_rows),
            "completed_session_count": len(completed_durations),
            "average_duration_seconds": (
                round(sum(completed_durations) / len(completed_durations))
                if completed_durations
                else None
            ),
            "coverage_rate": (
                round(covered_total * 100 / question_total, 1)
                if question_total
                else 0.0
            ),
            "covered_questions": covered_total,
            "total_questions": question_total,
            "human_intervention_count": human_count,
            "human_intervention_rate": (
                round(human_count * 100 / response_total, 1)
                if response_total
                else 0.0
            ),
            "response_count": response_total,
        },
        "latency": aggregate_latency(turns),
        "sessions": session_rows,
        "interventions": interventions[:25],
    }


def _empty_monitoring_payload() -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc),
        "summary": {
            "session_count": 0,
            "completed_session_count": 0,
            "average_duration_seconds": None,
            "coverage_rate": 0.0,
            "covered_questions": 0,
            "total_questions": 0,
            "human_intervention_count": 0,
            "human_intervention_rate": 0.0,
            "response_count": 0,
        },
        "latency": aggregate_latency([]),
        "sessions": [],
        "interventions": [],
    }


@router.post("/interviews/{audit_id}/sessions")
async def create_interview_session(
    audit_id: str,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    audit, _, _ = _authorized_audit(audit_id, Authorize, access_token)
    references = [int(question["ref"]) for question in audit.fiche]
    if not references:
        raise HTTPException(status_code=409, detail="Le questionnaire est vide")
    if not settings.TAVUS_API_KEY:
        raise HTTPException(status_code=503, detail="TAVUS_API_KEY n'est pas configurée")
    if not settings.TAVUS_PERSONA_ID:
        raise HTTPException(status_code=503, detail="TAVUS_PERSONA_ID n'est pas configuré")
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY n'est pas configurée")

    parsed_audit_id = UUID(audit_id)
    custom_greeting = _opening_greeting(audit.company_name, len(references))
    reusable_session = await _reuse_active_session(
        parsed_audit_id,
        custom_greeting,
    )
    if reusable_session is not None:
        return reusable_session

    session_id = uuid4()
    token = create_session_token(session_id, parsed_audit_id)
    conversational_context = tavus_context(token)

    with session_scope() as database:
        database.add(
            InterviewSessionModel(
                id=session_id,
                audit_id=parsed_audit_id,
                question_refs=references,
                status="creating",
                followups={
                    "stage": "introduction",
                    "covered_refs": [],
                    "tavus": {"status": "creating"},
                },
            )
        )

    try:
        tavus = await run_in_threadpool(
            create_tavus_conversation,
            conversation_name=f"Audit ORNISEC - {audit.company_name}"[:120],
            conversational_context=conversational_context,
            custom_greeting=custom_greeting,
        )
    except TavusAPIError as exc:
        with session_scope() as database:
            interview = database.get(InterviewSessionModel, session_id)
            if interview is not None:
                state = dict(interview.followups or {})
                state["tavus"] = {"status": "failed", "error": exc.detail}
                interview.followups = state
                interview.status = "provider_error"
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    tavus_state = {
        "conversation_id": tavus.conversation_id,
        "conversation_url": str(tavus.conversation_url),
        "meeting_token": tavus.meeting_token,
        "status": tavus.status,
    }
    with session_scope() as database:
        interview = database.get(InterviewSessionModel, session_id)
        if interview is None:
            raise HTTPException(status_code=500, detail="Session d'entretien introuvable après sa création")
        state = dict(interview.followups or {})
        state["tavus"] = tavus_state
        interview.followups = state
        interview.status = "active"

    return _session_response(
        interview,
        parsed_audit_id,
        custom_greeting,
        tavus_state,
        reused=False,
    )

@router.get("/interviews/{session_id}")
async def get_interview_session(
    session_id: str,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    try:
        parsed_session_id = UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Identifiant de session invalide") from exc
    with SessionLocal() as database:
        interview = database.get(InterviewSessionModel, parsed_session_id)
        if interview is None:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        audit, _, _ = _authorized_audit(str(interview.audit_id), Authorize, access_token)
        turns = database.scalars(
            select(InterviewTurnModel)
            .where(InterviewTurnModel.session_id == parsed_session_id)
            .order_by(InterviewTurnModel.created_at)
        ).all()
        return _session_details(
            interview,
            audit,
            turns,
            _document_evidence_index(database, interview.audit_id),
        )


@router.get("/audits/{audit_id}/interviews/latest")
async def get_latest_interview_session(
    audit_id: str,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    audit, _, _ = _authorized_audit(audit_id, Authorize, access_token)
    parsed_audit_id = UUID(audit_id)
    with SessionLocal() as database:
        interview = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.audit_id == parsed_audit_id)
            .order_by(InterviewSessionModel.created_at.desc())
            .limit(1)
        )
        if interview is None:
            raise HTTPException(status_code=404, detail="Aucun entretien n'est disponible pour cet audit")
        turns = database.scalars(
            select(InterviewTurnModel)
            .where(InterviewTurnModel.session_id == interview.id)
            .order_by(InterviewTurnModel.created_at)
        ).all()
        return _session_details(
            interview,
            audit,
            turns,
            _document_evidence_index(database, interview.audit_id),
        )

@router.post("/interviews/{session_id}/resume")
async def resume_interview_session(
    session_id: str,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    try:
        parsed_session_id = UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Identifiant de session invalide") from exc

    with SessionLocal() as database:
        interview = database.get(InterviewSessionModel, parsed_session_id)
        if interview is None:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        audit, _, _ = _authorized_audit(str(interview.audit_id), Authorize, access_token)
        state = dict(interview.followups or {})
        if interview.status == "interrupting":
            raise HTTPException(
                status_code=409,
                detail="La sauvegarde de l'interruption est en cours. Réessayez dans un instant.",
            )
        if interview.status not in {"active", "interrupted"} or state.get("stage") == "completed":
            raise HTTPException(status_code=409, detail="Cet entretien ne peut plus être repris")
        turns = _load_turns(database, parsed_session_id)
        previous_tavus = dict(state.get("tavus") or {})
        conversation_id = previous_tavus.get("conversation_id")

    provider_status = "ended"
    if conversation_id:
        try:
            provider_status = await run_in_threadpool(
                get_tavus_conversation_status,
                conversation_id,
            )
        except TavusAPIError as exc:
            raise HTTPException(
                status_code=503,
                detail="Impossible de vérifier la salle Tavus avant la reprise.",
            ) from exc

    greeting = _resume_greeting(interview, audit, turns)
    if provider_status == "active":
        tavus_state = {**previous_tavus, "status": "active", "resumed_at": time.time()}
        reused = True
    else:
        with session_scope() as database:
            locked = database.scalar(
                select(InterviewSessionModel)
                .where(InterviewSessionModel.id == parsed_session_id)
                .with_for_update()
            )
            if locked is None:
                raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
            if locked.status == "resuming":
                raise HTTPException(status_code=409, detail="Une reprise est déjà en cours")
            if locked.status not in {"active", "interrupted"}:
                raise HTTPException(status_code=409, detail="Cet entretien ne peut plus être repris")
            locked.status = "resuming"
        try:
            tavus_state, greeting = await _create_resume_conversation(interview, audit, turns)
        except HTTPException:
            with session_scope() as database:
                locked = database.get(InterviewSessionModel, parsed_session_id)
                if locked is not None and locked.status == "resuming":
                    locked.status = "interrupted"
            raise
        reused = False

    with session_scope() as database:
        stored = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.id == parsed_session_id)
            .with_for_update()
        )
        if stored is None:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        if reused and stored.status not in {"active", "interrupted"}:
            raise HTTPException(status_code=409, detail="L'état de l'entretien a changé")
        if not reused and stored.status != "resuming":
            raise HTTPException(status_code=409, detail="La reprise a été interrompue")
        stored_state = dict(stored.followups or {})
        if not reused and previous_tavus.get("conversation_id"):
            history = list(stored_state.get("tavus_history") or [])
            history.append(previous_tavus)
            stored_state["tavus_history"] = history[-10:]
        stored_state["tavus"] = tavus_state
        stored.followups = stored_state
        stored.status = "active"

    return _session_response(
        stored,
        stored.audit_id,
        greeting,
        tavus_state,
        reused=reused,
        resumed=True,
    )


@router.post("/interviews/{session_id}/interrupt")
async def interrupt_interview_session(
    session_id: str,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    try:
        parsed_session_id = UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Identifiant de session invalide") from exc

    with SessionLocal() as database:
        interview = database.get(InterviewSessionModel, parsed_session_id)
        if interview is None:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        _authorized_audit(str(interview.audit_id), Authorize, access_token)
        state = dict(interview.followups or {})
        if interview.status == "resuming":
            raise HTTPException(status_code=409, detail="La reconnexion est déjà en cours")
        if interview.status in {"completed", "ended"} or state.get("stage") == "completed":
            return {"session_id": session_id, "status": interview.status, "resumable": False}
        tavus_state = dict(state.get("tavus") or {})
        conversation_id = tavus_state.get("conversation_id")

    with session_scope() as database:
        stored = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.id == parsed_session_id)
            .with_for_update()
        )
        if stored is None:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        stored_state = dict(stored.followups or {})
        if stored.status == "interrupting":
            return {
                "session_id": session_id,
                "status": "interrupting",
                "resumable": True,
                "cleanup_pending": True,
            }
        if stored.status in {"completed", "ended"} or stored_state.get("stage") == "completed":
            return {"session_id": session_id, "status": stored.status, "resumable": False}
        if stored.status == "resuming":
            raise HTTPException(status_code=409, detail="La reconnexion est déjà en cours")
        stored.status = "interrupting"
    provider_ended = tavus_state.get("status") == "ended"
    cleanup_error = None
    if conversation_id and tavus_state.get("status") != "ended":
        try:
            await run_in_threadpool(end_tavus_conversation, conversation_id)
            provider_ended = True
        except TavusAPIError as exc:
            cleanup_error = exc.detail

    with session_scope() as database:
        stored = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.id == parsed_session_id)
            .with_for_update()
        )
        if stored is None:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        state = dict(stored.followups or {})
        if stored.status in {"completed", "ended"} or state.get("stage") == "completed":
            return {"session_id": session_id, "status": stored.status, "resumable": False}
        if stored.status == "resuming":
            raise HTTPException(status_code=409, detail="La reconnexion est déjà en cours")
        tavus_state = dict(state.get("tavus") or {})
        tavus_state["status"] = "ended" if provider_ended else "interrupt_pending"
        tavus_state["interrupted_at"] = time.time()
        if cleanup_error:
            tavus_state["cleanup_error"] = cleanup_error
        state["tavus"] = tavus_state
        stored.followups = state
        stored.status = "interrupted"

    return {
        "session_id": session_id,
        "status": "interrupted",
        "resumable": True,
        "cleanup_pending": bool(cleanup_error),
    }

@router.post("/interviews/{session_id}/end")
async def end_interview_session(
    session_id: str,
    Authorize: AuthJWT = Depends(),
    access_token: str = Cookie(None),
):
    try:
        parsed_session_id = UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Identifiant de session invalide") from exc

    with SessionLocal() as database:
        interview = database.get(InterviewSessionModel, parsed_session_id)
        if interview is None:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        _authorized_audit(str(interview.audit_id), Authorize, access_token)
        if interview.status in {"resuming", "interrupting"}:
            raise HTTPException(status_code=409, detail="Une transition de connexion est déjà en cours")
        tavus_state = dict(interview.followups or {}).get("tavus") or {}
        conversation_id = tavus_state.get("conversation_id")
        already_ended = tavus_state.get("status") == "ended"

    if not conversation_id:
        raise HTTPException(status_code=409, detail="Conversation Tavus introuvable")
    cleanup_pending = False
    cleanup_error = None
    if not already_ended:
        try:
            await run_in_threadpool(end_tavus_conversation, conversation_id)
        except TavusAPIError as exc:
            cleanup_pending = True
            cleanup_error = exc.detail

    with session_scope() as database:
        interview = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.id == parsed_session_id)
            .with_for_update()
        )
        if interview is None:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        state = dict(interview.followups or {})
        tavus_state = dict(state.get("tavus") or {})
        tavus_state["status"] = "end_pending" if cleanup_pending else "ended"
        if cleanup_error:
            tavus_state["cleanup_error"] = cleanup_error
        state["tavus"] = tavus_state
        interview.followups = state
        if interview.status != "completed":
            interview.status = "ended"

    return {
        "session_id": session_id,
        "status": interview.status,
        "cleanup_pending": cleanup_pending,
        "tavus": tavus_state,
    }

@router.post("/v1/chat/completions")
async def tavus_chat_completions(
    payload: ChatCompletionRequest,
    authorization: str | None = Header(default=None),
):
    _authenticate_tavus(authorization)
    session_id, audit_id = extract_session_claims(payload.messages)
    assistant_text = await run_in_threadpool(process_turn, session_id, audit_id, payload.messages)

    if payload.stream:
        return StreamingResponse(
            _stream_response(assistant_text, payload.model),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return {
        "id": f"chatcmpl-{uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": payload.model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": assistant_text},
            "finish_reason": "stop",
        }],
    }
