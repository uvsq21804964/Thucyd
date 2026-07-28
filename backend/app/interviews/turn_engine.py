import hashlib
import json
import re
from datetime import datetime, timezone
from time import perf_counter
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from app.AuditDao.openaudits import OpenAudits
from app.database import AuditModel, SessionLocal, session_scope
from app.interviews.ai import (
    AnswerUpdate,
    InterviewDecision,
    make_decision,
    rephrase_question,
    select_candidates,
)
from app.interviews.models import InterviewSessionModel, InterviewTurnModel
from app.question_conditions import active_question_refs, active_questions

CLOSING_TEXT = (
    "Merci pour vos réponses. L'entretien est maintenant terminé. "
    "Un auditeur examinera les éléments recueillis."
)
TAVUS_ANALYSIS_BLOCK = re.compile(
    r"<(?P<tag>[\w:-]*analysis)\b[^>]*>.*?</(?P=tag)\s*>",
    flags=re.IGNORECASE | re.DOTALL,
)
CONTROL_COMMAND = re.compile(
    r"\[THUCYD_COMMAND:(repeat|rephrase|correct_previous)\]",
    flags=re.IGNORECASE,
)
MARKING_LEVEL_PATTERN = re.compile(r"^\s*(?P<mark>[0-4](?:[.,]\d+)?)\s*(?::|-|=)")


def _clean_tavus_text(value: str) -> str:
    clean = TAVUS_ANALYSIS_BLOCK.sub(" ", value)
    return " ".join(clean.split())


def _message_text(message) -> str:
    text = message.text_content()
    return _clean_tavus_text(text) if message.role == "user" else " ".join(text.split())


def _history_hash(messages: list) -> str:
    serialized = [{"role": message.role, "content": _message_text(message)} for message in messages]
    return hashlib.sha256(
        json.dumps(serialized, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _last_user_text(messages: list) -> str:
    for message in reversed(messages):
        if message.role == "user":
            return _clean_tavus_text(message.text_content())
    return ""


def _last_assistant_text(messages: list) -> str:
    for message in reversed(messages):
        if message.role == "assistant":
            return " ".join(message.text_content().split())
    return ""


def _detect_command(transcript: str) -> str | None:
    explicit = CONTROL_COMMAND.search(transcript)
    if explicit:
        return explicit.group(1).lower()
    normalized = transcript.casefold().strip(" .!?")
    if re.fullmatch(r"(pouvez-vous |peux-tu )?(répéter|répétez)( la question)?", normalized):
        return "repeat"
    if re.fullmatch(r"(pouvez-vous |peux-tu )?(reformuler|reformulez)( la question)?", normalized):
        return "rephrase"
    if re.fullmatch(r"(pause|mettez? en pause|fais une pause)", normalized):
        return "pause"
    if re.fullmatch(
        r"(je (souhaite|voudrais) )?(corriger|modifier|reprendre) "
        r"(ma |la )?(dernière|précédente) réponse",
        normalized,
    ):
        return "correct_previous"
    return None


def _is_ready_to_start(transcript: str) -> bool:
    normalized = transcript.casefold()
    return not any(
        phrase in normalized
        for phrase in ("pas encore", "attendez", "une minute", "pas prêt", "pas prête")
    )


def _is_close_confirmation(transcript: str) -> bool:
    normalized = transcript.casefold().strip(" .!?")
    if normalized in {
        "oui",
        "oui merci",
        "on peut terminer",
        "nous pouvons terminer",
        "vous pouvez clôturer",
        "je confirme",
        "terminer",
        "clôturer",
    }:
        return True
    return normalized.startswith("oui") and any(
        marker in normalized for marker in ("termin", "clôtur", "fin de l'entretien")
    )


def _recent_dialogue(messages: list, limit: int = 8) -> list[dict[str, str]]:
    dialogue = []
    for message in messages:
        if message.role not in {"user", "assistant"}:
            continue
        content = _message_text(message)
        if content:
            dialogue.append({"role": message.role, "content": content[:2000]})
    return dialogue[-limit:]


def _stored_dialogue(turns: list[InterviewTurnModel]) -> list[dict[str, str]]:
    dialogue = []
    for turn in turns:
        transcript = _clean_tavus_text(str(turn.transcript or ""))
        assistant_text = " ".join(str(turn.assistant_text or "").split())
        if transcript:
            dialogue.append({"role": "user", "content": transcript[:2000]})
        if assistant_text:
            dialogue.append({"role": "assistant", "content": assistant_text[:2000]})
    return dialogue

def _fallback_decision(current_question: dict) -> InterviewDecision:
    return InterviewDecision(
        action="next_question",
        question_ref=int(current_question["ref"]),
        reason="Mode déterministe ou décision IA indisponible.",
        spoken_text="Merci pour ces éléments. Passons au point suivant.",
        updates=[],
    )


def _marking_criterion(marking_guide: list, mark: float) -> str | None:
    for raw_criterion in marking_guide:
        criterion = " ".join(str(raw_criterion).split())
        match = MARKING_LEVEL_PATTERN.match(criterion)
        if not match:
            continue
        criterion_mark = float(match.group("mark").replace(",", "."))
        if abs(criterion_mark - float(mark)) < 0.001:
            return criterion[:300]
    return None


def _validated_decision(
    decision: InterviewDecision | None,
    current_question: dict,
    candidates: list[dict],
) -> InterviewDecision:
    if decision is None or decision.question_ref != int(current_question["ref"]):
        return _fallback_decision(current_question)

    candidates_by_ref = {int(question["ref"]): question for question in candidates}
    updates = []
    for update in decision.updates:
        question = candidates_by_ref.get(update.question_ref)
        if question is None:
            continue
        marking_guide = question.get("aide à la notation") or []
        if update.suggested_mark is not None and marking_guide:
            rationale = _clean_tavus_text(update.mark_rationale or "")
            criterion = _marking_criterion(marking_guide, update.suggested_mark)
            if not rationale or criterion is None:
                update = update.model_copy(
                    update={"suggested_mark": None, "mark_rationale": None}
                )
            else:
                update = update.model_copy(
                    update={"mark_rationale": f"{criterion} — {rationale}"[:500]}
                )
        updates.append(update)
    return decision.model_copy(update={"updates": updates})


def _safe_followup(text: str) -> str:
    clean = _clean_tavus_text(text)
    if not clean or len(clean) > 300 or clean.count("?") != 1 or "<" in clean or ">" in clean:
        return "Pouvez-vous préciser votre réponse avec un exemple ou une preuve concrète ?"
    return clean


def _safe_transition(text: str) -> str:
    clean = _clean_tavus_text(text)
    if not clean or len(clean) > 240 or "?" in clean or "<" in clean or ">" in clean:
        return "Merci pour ces éléments. Passons au point suivant."
    return clean


def _merge_result(question: dict, update: AnswerUpdate) -> bool:
    summary = _clean_tavus_text(update.answer_summary)
    if not summary:
        return False
    if update.evidence:
        evidence = "; ".join(
            clean
            for item in update.evidence
            if (clean := _clean_tavus_text(item))
        )
        if evidence:
            summary = f"{summary}\nPreuves mentionnées : {evidence}"
    question["comment"] = summary[:2000]
    marking_guide = question.get("aide à la notation") or []
    mark_is_justified = not marking_guide or bool(update.mark_rationale)
    if (
        update.suggested_mark is not None
        and update.confidence >= 0.7
        and mark_is_justified
    ):
        question["note numérique"] = update.suggested_mark
    return True


def _next_uncovered_index(references: list[int], current_index: int, covered_refs: set[int], eligible_refs: set[int] | None = None) -> int | None:
    for index in range(current_index + 1, len(references)):
        if references[index] not in covered_refs and (eligible_refs is None or references[index] in eligible_refs):
            return index
    return None


def _closing_prompt(questions: list[dict], covered_count: int, total: int) -> str:
    ranked = sorted(
        (question for question in questions if str(question.get("comment") or "").strip()),
        key=lambda question: (
            question.get("note numérique") is None,
            question.get("note numérique") if question.get("note numérique") is not None else 5,
        ),
    )
    snippets = []
    for question in ranked[:2]:
        summary = _clean_tavus_text(str(question.get("comment") or "")).split(
            "Preuves mentionnées :", 1
        )[0].strip()
        if summary:
            snippets.append(summary[:180].rstrip(" .") + ".")
    recap = " ".join(snippets)
    opening = f"Nous avons parcouru {covered_count} point{'s' if covered_count > 1 else ''} sur {total}."
    if recap:
        opening = f"{opening} Je retiens notamment ceci : {recap}"
    return f"{opening} Souhaitez-vous clôturer l'entretien maintenant ?"


def _add_control_turn(
    database,
    *,
    session_id: UUID,
    turn_index: int,
    transcript: str,
    assistant_text: str,
    action: str,
    input_hash: str,
):
    database.add(
        InterviewTurnModel(
            session_id=session_id,
            turn_index=turn_index,
            question_ref=None,
            transcript=transcript[:20_000],
            assistant_text=assistant_text,
            decision={
                "action": action,
                "question_ref": None,
                "reason": "Commande de contrôle de l'entretien.",
                "updates": [],
                "source": "control",
            },
            input_hash=input_hash,
        )
    )


def _process_introduction(
    session_id: UUID,
    audit_id: UUID,
    transcript: str,
    input_hash: str,
    first_question: str,
) -> str:
    with session_scope() as database:
        interview = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.id == session_id)
            .with_for_update()
        )
        if interview is None or interview.audit_id != audit_id:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        duplicate = database.scalar(
            select(InterviewTurnModel).where(
                InterviewTurnModel.session_id == session_id,
                InterviewTurnModel.input_hash == input_hash,
            )
        )
        if duplicate is not None:
            return duplicate.assistant_text
        state = dict(interview.followups or {})
        if state.get("stage") != "introduction":
            raise HTTPException(status_code=409, detail="L'introduction a déjà été traitée")
        if _is_ready_to_start(transcript):
            state["stage"] = "interview"
            assistant_text = f"Parfait, commençons. {first_question}"
            action = "introduction_complete"
        else:
            assistant_text = (
                "Bien sûr. Prenez le temps nécessaire et dites-moi lorsque vous êtes prêt à commencer."
            )
            action = "introduction_wait"
        interview.followups = state
        interview.updated_at = datetime.now(timezone.utc)
        _add_control_turn(
            database,
            session_id=session_id,
            turn_index=-1,
            transcript=transcript,
            assistant_text=assistant_text,
            action=action,
            input_hash=input_hash,
        )
        return assistant_text


def _process_closing(
    session_id: UUID,
    audit_id: UUID,
    transcript: str,
    input_hash: str,
    turn_index: int,
) -> str:
    with session_scope() as database:
        interview = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.id == session_id)
            .with_for_update()
        )
        if interview is None or interview.audit_id != audit_id:
            raise HTTPException(status_code=404, detail="Session d'entretien introuvable")
        duplicate = database.scalar(
            select(InterviewTurnModel).where(
                InterviewTurnModel.session_id == session_id,
                InterviewTurnModel.input_hash == input_hash,
            )
        )
        if duplicate is not None:
            return duplicate.assistant_text
        state = dict(interview.followups or {})
        if _is_close_confirmation(transcript):
            state["stage"] = "completed"
            interview.status = "completed"
            assistant_text = CLOSING_TEXT
            action = "complete"
        else:
            notes = list(state.get("closing_notes") or [])
            if transcript.casefold().strip(" .!?") not in {"non", "pas encore"}:
                notes.append(transcript[:1000])
                state["closing_notes"] = notes[-3:]
            assistant_text = (
                "Très bien. Vous pouvez corriger votre dernière réponse ou me dire lorsque vous souhaitez clôturer."
            )
            action = "closing_wait"
        interview.followups = state
        interview.updated_at = datetime.now(timezone.utc)
        _add_control_turn(
            database,
            session_id=session_id,
            turn_index=turn_index,
            transcript=transcript,
            assistant_text=assistant_text,
            action=action,
            input_hash=input_hash,
        )
        return assistant_text


def _rewind_previous_answer(
    session_id: UUID,
    audit_id: UUID,
    transcript: str,
    input_hash: str,
) -> str:
    with session_scope() as database:
        interview = database.scalar(
            select(InterviewSessionModel)
            .where(InterviewSessionModel.id == session_id)
            .with_for_update()
        )
        audit = database.scalar(
            select(AuditModel).where(AuditModel.id == audit_id).with_for_update()
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
        previous = database.scalar(
            select(InterviewTurnModel)
            .where(
                InterviewTurnModel.session_id == session_id,
                InterviewTurnModel.question_ref.is_not(None),
            )
            .order_by(InterviewTurnModel.created_at.desc())
            .limit(1)
        )
        if previous is None or previous.question_ref not in interview.question_refs:
            return "Aucune réponse précédente ne peut encore être corrigée."
        references = [int(reference) for reference in interview.question_refs]
        previous_ref = int(previous.question_ref)
        previous_index = references.index(previous_ref)
        questions = OpenAudits._normalize_questions(audit.questionnaire)
        question = next(item for item in questions if int(item["ref"]) == previous_ref)
        state = dict(interview.followups or {})
        covered_refs = {int(reference) for reference in state.get("covered_refs", [])}
        covered_refs.discard(previous_ref)
        state["covered_refs"] = sorted(covered_refs)
        state["stage"] = "interview"
        state["correction_ref"] = previous_ref
        state.pop(str(previous_ref), None)
        interview.current_index = previous_index
        interview.status = "active"
        interview.followups = state
        interview.updated_at = datetime.now(timezone.utc)
        assistant_text = (
            "Bien sûr, reprenons ce point. " + str(question["question"]).strip()
        )
        _add_control_turn(
            database,
            session_id=session_id,
            turn_index=previous_index,
            transcript=transcript,
            assistant_text=assistant_text,
            action="correct_previous",
            input_hash=input_hash,
        )
        return assistant_text


def process_turn(session_id: UUID, audit_id: UUID, messages: list) -> str:
    turn_started = perf_counter()
    input_hash = _history_hash(messages)
    transcript = _last_user_text(messages)
    request_dialogue = _recent_dialogue(messages)

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
        stage = str(followups.get("stage") or "interview")
        questions = OpenAudits._normalize_questions(audit_snapshot.questionnaire)
        stored_turns = database.scalars(
            select(InterviewTurnModel)
            .where(InterviewTurnModel.session_id == session_id)
            .order_by(InterviewTurnModel.created_at.desc())
            .limit(4)
        ).all()

    context_loaded_at = perf_counter()
    recent_dialogue = (_stored_dialogue(list(reversed(stored_turns))) + request_dialogue)[-8:]
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
        if stage == "introduction":
            return "Dites-moi simplement lorsque vous êtes prêt à commencer."
        if stage == "closing":
            return str(followups.get("closing_prompt") or CLOSING_TEXT)
        return str(current_question["question"]).strip()

    command = _detect_command(transcript)
    previous_prompt = _last_assistant_text(messages) or str(current_question["question"]).strip()
    if command == "repeat":
        return f"Bien sûr. {previous_prompt}"
    if command == "rephrase":
        rephrased = rephrase_question(previous_prompt, recent_dialogue)
        return _safe_followup(rephrased or f"Autrement dit, {previous_prompt}")
    if command == "pause":
        return (
            "Bien sûr. L'entretien est en pause. Utilisez le bouton Reprendre "
            "lorsque vous êtes prêt."
        )
    if command == "correct_previous":
        return _rewind_previous_answer(session_id, audit_id, transcript, input_hash)
    if stage == "introduction":
        return _process_introduction(
            session_id,
            audit_id,
            transcript,
            input_hash,
            str(current_question["question"]).strip(),
        )
    if stage == "closing":
        return _process_closing(
            session_id,
            audit_id,
            transcript,
            input_hash,
            snapshot_index,
        )

    eligible_questions = active_questions(questions)
    active_index = next(
        (
            index
            for index, question in enumerate(eligible_questions)
            if int(question["ref"]) == current_reference
        ),
        None,
    )
    if active_index is None:
        raise HTTPException(status_code=409, detail="La question courante n'est plus active")
    candidates = select_candidates(eligible_questions, active_index, transcript)
    ai_started = perf_counter()
    ai_decision = make_decision(
        current_question=current_question,
        candidates=candidates,
        transcript=transcript[:20_000],
        followups_used=int(followups.get(str(current_reference), 0)),
        recent_dialogue=recent_dialogue,
    )
    ai_finished = perf_counter()
    decision = _validated_decision(ai_decision, current_question, candidates)
    validation_finished = perf_counter()
    persistence_started = perf_counter()

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
        state = dict(interview.followups or {})
        correction_ref = state.get("correction_ref")
        is_correction = (
            isinstance(correction_ref, int) and correction_ref == current_reference
        )
        has_correction_update = any(
            update.question_ref == current_reference for update in decision.updates
        )
        applied_updates = []
        covered_refs = {
            int(reference) for reference in state.get("covered_refs", [])
        }
        if is_correction and has_correction_update:
            corrected_question = stored_by_ref.get(current_reference)
            if corrected_question is not None:
                corrected_question["comment"] = ""
                corrected_question["note numérique"] = None
            state.pop("correction_ref", None)
        for update in decision.updates:
            question = stored_by_ref.get(update.question_ref)
            if question is None:
                continue
            if not _merge_result(question, update):
                continue
            if update.confidence >= 0.6:
                covered_refs.add(update.question_ref)
            applied_updates.append(update.model_dump())

        state["covered_refs"] = sorted(covered_refs)
        followup_count = int(state.get(str(current_reference), 0))
        should_follow_up = (
            (decision.action == "follow_up" or (is_correction and not has_correction_update))
            and followup_count < 1
        )

        if should_follow_up:
            state[str(current_reference)] = followup_count + 1
            assistant_text = _safe_followup(decision.spoken_text)
            action = "follow_up"
        else:
            covered_refs.add(current_reference)
            state["covered_refs"] = sorted(covered_refs)
            eligible_refs = set(active_question_refs(stored_questions))
            next_index = _next_uncovered_index(
                references, snapshot_index, covered_refs, eligible_refs
            )
            if next_index is None:
                state["stage"] = "closing"
                active_stored_questions = active_questions(stored_questions)
                assistant_text = _closing_prompt(
                    active_stored_questions,
                    len(covered_refs & eligible_refs),
                    len(eligible_refs),
                )
                state["closing_prompt"] = assistant_text
                action = "closing"
            else:
                interview.current_index = next_index
                next_question = stored_by_ref.get(references[next_index])
                if next_question is None:
                    raise HTTPException(status_code=409, detail="Question suivante introuvable")
                transition = _safe_transition(decision.spoken_text)
                assistant_text = f"{transition} {str(next_question['question']).strip()}"
                action = "next_question"

        audit.questionnaire = stored_questions
        interview.followups = state
        interview.updated_at = datetime.now(timezone.utc)
        timings = {
            "context_ms": round((context_loaded_at - turn_started) * 1000),
            "preparation_ms": round((ai_started - context_loaded_at) * 1000),
            "ai_ms": round((ai_finished - ai_started) * 1000),
            "validation_ms": round((validation_finished - ai_finished) * 1000),
        }
        database.flush()
        timings["persistence_ms"] = round((perf_counter() - persistence_started) * 1000)
        timings["total_ms"] = round((perf_counter() - turn_started) * 1000)
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
                    "timings": timings,
                },
                input_hash=input_hash,
            )
        )
        return assistant_text
