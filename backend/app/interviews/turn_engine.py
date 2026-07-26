import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from app.AuditDao.openaudits import OpenAudits
from app.database import AuditModel, SessionLocal, session_scope
from app.interviews.ai import AnswerUpdate, InterviewDecision, make_decision, select_candidates
from app.interviews.models import InterviewSessionModel, InterviewTurnModel

CLOSING_TEXT = (
    "Merci pour vos réponses. L'entretien est maintenant terminé. "
    "Un auditeur examinera les éléments recueillis."
)


def _history_hash(messages: list) -> str:
    serialized = [{"role": message.role, "content": message.text_content()} for message in messages]
    return hashlib.sha256(
        json.dumps(serialized, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _last_user_text(messages: list) -> str:
    for message in reversed(messages):
        if message.role == "user":
            return message.text_content().strip()
    return ""


def _fallback_decision(current_question: dict, transcript: str) -> InterviewDecision:
    return InterviewDecision(
        action="next_question",
        question_ref=int(current_question["ref"]),
        reason="Mode déterministe ou décision IA indisponible.",
        spoken_text="Question suivante.",
        updates=[
            AnswerUpdate(
                question_ref=int(current_question["ref"]),
                answer_summary=transcript[:1500],
                evidence=[],
                suggested_mark=None,
                confidence=1,
            )
        ],
    )


def _validated_decision(
    decision: InterviewDecision | None,
    current_question: dict,
    candidates: list[dict],
    transcript: str,
) -> InterviewDecision:
    if decision is None or decision.question_ref != int(current_question["ref"]):
        return _fallback_decision(current_question, transcript)

    allowed_refs = {int(question["ref"]) for question in candidates}
    updates = [update for update in decision.updates if update.question_ref in allowed_refs]
    if int(current_question["ref"]) not in {update.question_ref for update in updates}:
        updates.append(
            AnswerUpdate(
                question_ref=int(current_question["ref"]),
                answer_summary=transcript[:1500],
                evidence=[],
                suggested_mark=None,
                confidence=0.5,
            )
        )
    return decision.model_copy(update={"updates": updates})


def _safe_followup(text: str) -> str:
    clean = " ".join(text.split())
    if not clean or len(clean) > 300 or clean.count("?") != 1 or "<" in clean or ">" in clean:
        return "Pouvez-vous préciser votre réponse avec un exemple ou une preuve concrète ?"
    return clean


def _merge_result(question: dict, update: AnswerUpdate):
    summary = update.answer_summary.strip()
    if update.evidence:
        evidence = "; ".join(item.strip() for item in update.evidence if item.strip())
        if evidence:
            summary = f"{summary}\nPreuves mentionnées : {evidence}"
    question["comment"] = summary[:2000]
    if update.suggested_mark is not None and update.confidence >= 0.7:
        question["note numérique"] = update.suggested_mark


def _next_uncovered_index(references: list[int], current_index: int, covered_refs: set[int]) -> int | None:
    for index in range(current_index + 1, len(references)):
        if references[index] not in covered_refs:
            return index
    return None


def process_turn(session_id: UUID, audit_id: UUID, messages: list) -> str:
    input_hash = _history_hash(messages)
    transcript = _last_user_text(messages)

    with SessionLocal() as database:
        interview_snapshot = database.get(InterviewSessionModel, session_id)
        audit_snapshot = database.get(AuditModel, audit_id)
        if interview_snapshot is None or interview_snapshot.audit_id != audit_id:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        if audit_snapshot is None:
            raise HTTPException(status_code=404, detail="Audit introuvable")
        snapshot_index = interview_snapshot.current_index
        snapshot_status = interview_snapshot.status
        references = [int(reference) for reference in interview_snapshot.question_refs]
        followups = dict(interview_snapshot.followups or {})
        questions = OpenAudits._normalize_questions(audit_snapshot.questionnaire)

    if snapshot_status == "completed":
        return CLOSING_TEXT
    if not references:
        raise HTTPException(status_code=409, detail="Le questionnaire est vide")

    current_reference = references[snapshot_index]
    current_question = next(
        (question for question in questions if int(question.get("ref", -1)) == current_reference),
        None,
    )
    if current_question is None:
        raise HTTPException(status_code=409, detail="Question d'entretien introuvable")
    if not transcript:
        return str(current_question["question"]).strip()

    candidates = select_candidates(questions, snapshot_index, transcript)
    ai_decision = make_decision(
        current_question=current_question,
        candidates=candidates,
        transcript=transcript[:20_000],
        followups_used=int(followups.get(str(current_reference), 0)),
    )
    decision = _validated_decision(ai_decision, current_question, candidates, transcript)

    with session_scope() as database:
        interview = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.id == session_id)
            .with_for_update()
        )
        audit = database.scalar(
            select(AuditModel)
            .where(AuditModel.id == audit_id)
            .with_for_update()
        )
        if interview is None or audit is None or interview.audit_id != audit_id:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")

        duplicate = database.scalar(
            select(InterviewTurnModel).where(
                InterviewTurnModel.session_id == session_id,
                InterviewTurnModel.input_hash == input_hash,
            )
        )
        if duplicate is not None:
            return duplicate.assistant_text
        if interview.status == "completed":
            return CLOSING_TEXT
        if interview.current_index != snapshot_index:
            raise HTTPException(status_code=409, detail="Un autre tour de parole a déjà été traité")

        stored_questions = OpenAudits._normalize_questions(audit.questionnaire)
        stored_by_ref = {int(question["ref"]): question for question in stored_questions}
        applied_updates = []
        covered_refs = {
            int(reference)
            for reference in dict(interview.followups or {}).get("covered_refs", [])
        }
        for update in decision.updates:
            question = stored_by_ref.get(update.question_ref)
            if question is None:
                continue
            _merge_result(question, update)
            if update.confidence >= 0.6:
                covered_refs.add(update.question_ref)
            applied_updates.append(update.model_dump())

        state = dict(interview.followups or {})
        state["covered_refs"] = sorted(covered_refs)
        followup_count = int(state.get(str(current_reference), 0))
        should_follow_up = decision.action == "follow_up" and followup_count < 1

        if should_follow_up:
            state[str(current_reference)] = followup_count + 1
            assistant_text = _safe_followup(decision.spoken_text)
            action = "follow_up"
        else:
            covered_refs.add(current_reference)
            state["covered_refs"] = sorted(covered_refs)
            next_index = _next_uncovered_index(references, snapshot_index, covered_refs)
            if next_index is None:
                interview.status = "completed"
                assistant_text = CLOSING_TEXT
                action = "complete"
            else:
                interview.current_index = next_index
                next_question = stored_by_ref.get(references[next_index])
                if next_question is None:
                    raise HTTPException(status_code=409, detail="Question suivante introuvable")
                assistant_text = str(next_question["question"]).strip()
                action = "next_question"

        audit.questionnaire = stored_questions
        interview.followups = state
        interview.updated_at = datetime.now(timezone.utc)
        database.add(
            InterviewTurnModel(
                session_id=session_id,
                turn_index=snapshot_index,
                question_ref=current_reference,
                transcript=transcript[:20_000],
                assistant_text=assistant_text,
                decision={
                    "action": action,
                    "question_ref": current_reference,
                    "reason": decision.reason,
                    "updates": applied_updates,
                    "source": "openai" if ai_decision is not None else "deterministic",
                },
                input_hash=input_hash,
            )
        )
        return assistant_text
