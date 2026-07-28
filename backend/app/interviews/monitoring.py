from collections.abc import Iterable
from datetime import datetime
from typing import Any

from app.question_conditions import active_question_refs


LATENCY_STAGES = (
    ("context_ms", "Chargement du contexte"),
    ("preparation_ms", "Préparation du tour"),
    ("ai_ms", "Analyse IA parallèle"),
    ("validation_ms", "Contrôle de la réponse"),
    ("persistence_ms", "Écriture en base"),
)


def _safe_milliseconds(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0 or parsed > 120_000:
        return None
    return parsed


def aggregate_latency(turns: Iterable[Any]) -> dict[str, Any]:
    values = {key: [] for key, _ in LATENCY_STAGES}
    total_values = []
    total_turns = 0
    sampled_turns = 0

    for turn in turns:
        total_turns += 1
        decision = turn.decision if isinstance(turn.decision, dict) else {}
        timings = decision.get("timings")
        if not isinstance(timings, dict):
            continue
        has_sample = False
        for key, _ in LATENCY_STAGES:
            parsed = _safe_milliseconds(timings.get(key))
            if parsed is not None:
                values[key].append(parsed)
                has_sample = True
        total = _safe_milliseconds(timings.get("total_ms"))
        if total is not None:
            total_values.append(total)
            has_sample = True
        if has_sample:
            sampled_turns += 1

    stages = []
    for key, label in LATENCY_STAGES:
        samples = values[key]
        stages.append(
            {
                "key": key.removesuffix("_ms"),
                "label": label,
                "average_ms": round(sum(samples) / len(samples)) if samples else None,
                "samples": len(samples),
            }
        )
    return {
        "average_total_ms": (
            round(sum(total_values) / len(total_values)) if total_values else None
        ),
        "sampled_turns": sampled_turns,
        "total_turns": total_turns,
        "stages": stages,
    }


def session_duration_seconds(session: Any, turns: list[Any]) -> int | None:
    if not turns or not isinstance(session.created_at, datetime):
        return None
    dated_turns = [turn.created_at for turn in turns if isinstance(turn.created_at, datetime)]
    if not dated_turns:
        return None
    duration = (max(dated_turns) - session.created_at).total_seconds()
    return max(0, round(duration))


def session_coverage(session: Any, questions: list[dict]) -> dict[str, int | float]:
    references = set(active_question_refs(questions))
    state = session.followups if isinstance(session.followups, dict) else {}
    raw_covered = state.get("covered_refs")
    if not isinstance(raw_covered, list):
        raw_covered = []
    covered = set()
    for value in raw_covered:
        try:
            reference = int(value)
        except (TypeError, ValueError):
            continue
        if reference in references:
            covered.add(reference)
    total = len(references)
    return {
        "covered": len(covered),
        "total": total,
        "rate": round(len(covered) * 100 / total, 1) if total else 0.0,
    }
