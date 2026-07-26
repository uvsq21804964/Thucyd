import os
import unittest

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.interviews.ai import AnswerUpdate, InterviewDecision, select_candidates
from app.interviews.turn_engine import (
    _merge_result,
    _next_uncovered_index,
    _validated_decision,
)


def question(reference, text, mark=None, comment=""):
    return {
        "ref": reference,
        "catégorie": "Gouvernance",
        "chantier": "Sécurité",
        "question": text,
        "comment": comment,
        "note numérique": mark,
        "aide à la notation": [],
    }


class InterviewDecisionTests(unittest.TestCase):
    def test_candidate_selection_finds_related_distant_questions(self):
        questions = [
            question(1, "Le responsable sécurité est-il nommé ?"),
            question(2, "Une politique existe-t-elle ?"),
            question(3, "Les sauvegardes sont-elles testées ?"),
            question(4, "Les fournisseurs sont-ils évalués ?"),
            question(5, "Comment gérez-vous les incidents de sécurité ?"),
        ]
        selected = select_candidates(questions, 0, "Nous avons une procédure de gestion des incidents")
        self.assertIn(5, {item["ref"] for item in selected})

    def test_unknown_question_updates_are_removed(self):
        current = question(1, "Question courante")
        decision = InterviewDecision(
            action="next_question",
            question_ref=1,
            reason="Réponse suffisante",
            spoken_text="Question suivante ?",
            updates=[
                AnswerUpdate(
                    question_ref=999,
                    answer_summary="Hors périmètre",
                    confidence=1,
                )
            ],
        )
        validated = _validated_decision(decision, current, [current], "Réponse réelle")
        self.assertEqual([update.question_ref for update in validated.updates], [1])

    def test_multiple_question_results_are_merged_live(self):
        first = question(1, "Question 1")
        second = question(2, "Question 2")
        updates = [
            AnswerUpdate(
                question_ref=1,
                answer_summary="Une procédure est documentée.",
                evidence=["Document SSI-01"],
                suggested_mark=3,
                confidence=0.9,
            ),
            AnswerUpdate(
                question_ref=2,
                answer_summary="Une revue annuelle est réalisée.",
                suggested_mark=2,
                confidence=0.8,
            ),
        ]
        for target, update in zip([first, second], updates):
            _merge_result(target, update)
        self.assertEqual(first["note numérique"], 3)
        self.assertIn("Document SSI-01", first["comment"])
        self.assertEqual(second["note numérique"], 2)

    def test_low_confidence_mark_is_not_committed(self):
        target = question(1, "Question")
        _merge_result(
            target,
            AnswerUpdate(
                question_ref=1,
                answer_summary="Réponse ambiguë",
                suggested_mark=4,
                confidence=0.4,
            ),
        )
        self.assertIsNone(target["note numérique"])
        self.assertEqual(target["comment"], "Réponse ambiguë")

    def test_next_question_skips_already_covered_references(self):
        self.assertEqual(_next_uncovered_index([1, 2, 3, 4], 0, {1, 2, 3}), 3)
        self.assertIsNone(_next_uncovered_index([1, 2], 0, {1, 2}))


if __name__ == "__main__":
    unittest.main()
