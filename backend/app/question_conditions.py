from typing import Any

NUMERIC_MARK = "note numérique"
DISPLAY_IF = "display_if"


def condition_matches(condition: dict[str, Any], mark: float | None) -> bool:
    operator = condition.get("operator")
    value = condition.get("value")
    if operator == "answered":
        return mark is not None
    if operator == "unanswered":
        return mark is None
    if mark is None:
        return False
    if operator == "eq":
        return mark == value
    if operator == "neq":
        return mark != value
    if operator == "lt":
        return mark < value
    if operator == "lte":
        return mark <= value
    if operator == "gt":
        return mark > value
    if operator == "gte":
        return mark >= value
    if operator == "in":
        return mark in value
    if operator == "not_in":
        return mark not in value
    return False


def active_questions(questions: list[dict]) -> list[dict]:
    by_ref = {int(question["ref"]): question for question in questions}
    active_refs: set[int] = set()
    result = []
    for question in questions:
        reference = int(question["ref"])
        condition = question.get(DISPLAY_IF)
        if not condition:
            is_active = True
        else:
            source_ref = int(condition["question_ref"])
            source = by_ref.get(source_ref)
            is_active = (
                source is not None
                and source_ref in active_refs
                and condition_matches(condition, source.get(NUMERIC_MARK))
            )
        if is_active:
            active_refs.add(reference)
            result.append(question)
    return result


def active_question_refs(questions: list[dict]) -> list[int]:
    return [int(question["ref"]) for question in active_questions(questions)]