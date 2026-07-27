import os
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.interviews.ai import (
    AnswerUpdate,
    InterviewDecision,
    InterviewPlan,
    InterviewUpdates,
    make_decision,
    select_candidates,
)
from app.interviews.turn_engine import (
    _closing_prompt,
    _detect_command,
    _is_close_confirmation,
    _is_ready_to_start,
    _last_user_text,
    _marking_criterion,
    _merge_result,
    _next_uncovered_index,
    _recent_dialogue,
    _safe_transition,
    _validated_decision,
)
from app.routes.interviews import ChatMessage


def question(reference, text, mark=None, comment="", marking_guide=None):
    return {
        "ref": reference,
        "catégorie": "Gouvernance",
        "chantier": "Sécurité",
        "question": text,
        "comment": comment,
        "note numérique": mark,
        "aide à la notation": marking_guide or [],
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

    def test_spoken_plan_and_scoring_are_combined_from_parallel_tasks(self):
        questions = [question(1, "Question précédente"), question(2, "Question courante")]
        plan = InterviewPlan(
            action="next_question",
            question_ref=2,
            reason="Réponse suffisante",
            spoken_text="Merci pour cette précision.",
        )
        extracted = InterviewUpdates(
            updates=[
                AnswerUpdate(
                    question_ref=2,
                    answer_summary="Une procédure est documentée.",
                    confidence=0.9,
                )
            ]
        )
        with (
            patch("app.interviews.ai._client", return_value=object()),
            patch("app.interviews.ai._make_plan", return_value=plan) as make_plan,
            patch("app.interviews.ai._extract_updates", return_value=extracted) as extract,
        ):
            decision = make_decision(
                current_question=questions[1],
                candidates=questions,
                transcript="Nous avons une procédure.",
                followups_used=0,
                recent_dialogue=[],
            )

        self.assertEqual(decision.question_ref, 2)
        self.assertEqual(decision.updates[0].question_ref, 2)
        self.assertEqual(make_plan.call_args.args[1]["current_question"]["ref"], 2)
        self.assertEqual(extract.call_args.args[1]["current_question_ref"], 2)

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
        validated = _validated_decision(decision, current, [current])
        self.assertEqual(validated.updates, [])

    def test_tavus_analysis_is_removed_from_transcript_and_history(self):
        messages = [
            ChatMessage(role="assistant", content="Qui pilote la sécurité ?"),
            ChatMessage(
                role="user",
                content=(
                    "<user_audio_analysis>The emotions are neutral.</user_audio_analysis> "
                    "On a uniquement un DSI."
                ),
            ),
        ]
        self.assertEqual(_last_user_text(messages), "On a uniquement un DSI.")
        self.assertEqual(
            _recent_dialogue(messages)[-1]["content"],
            "On a uniquement un DSI.",
        )

    def test_transition_rejects_metadata_and_questions(self):
        self.assertEqual(
            _safe_transition(
                "<user_audio_analysis>neutral</user_audio_analysis> Et ensuite ?"
            ),
            "Merci pour ces éléments. Passons au point suivant.",
        )

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

    def test_marking_guide_requires_an_exact_criterion_and_rationale(self):
        guided = question(
            1,
            "Une politique est-elle formalisée ?",
            marking_guide=["0 : Aucune politique", "2 : Politique en cours", "4 : Politique validée"],
        )
        unsupported = InterviewDecision(
            action="next_question",
            question_ref=1,
            reason="Réponse suffisante",
            spoken_text="Merci pour cette précision.",
            updates=[
                AnswerUpdate(
                    question_ref=1,
                    answer_summary="Une politique est en cours de rédaction.",
                    suggested_mark=3,
                    mark_rationale="La politique est partiellement formalisée.",
                    confidence=0.9,
                )
            ],
        )
        validated = _validated_decision(unsupported, guided, [guided])
        self.assertIsNone(validated.updates[0].suggested_mark)

        supported = unsupported.model_copy(
            update={
                "updates": [
                    unsupported.updates[0].model_copy(
                        update={
                            "suggested_mark": 2,
                            "mark_rationale": "Le document est encore en cours de rédaction.",
                        }
                    )
                ]
            }
        )
        validated = _validated_decision(supported, guided, [guided])
        self.assertEqual(validated.updates[0].suggested_mark, 2)
        self.assertIn("2 : Politique en cours", validated.updates[0].mark_rationale)
        _merge_result(guided, validated.updates[0])
        self.assertEqual(guided["note numérique"], 2)

    def test_marking_criterion_accepts_decimal_comma(self):
        self.assertEqual(
            _marking_criterion(["2,5 : Déploiement partiel"], 2.5),
            "2,5 : Déploiement partiel",
        )

    def test_metadata_is_never_saved_in_question_comment(self):
        target = question(1, "Question")
        _merge_result(
            target,
            AnswerUpdate(
                question_ref=1,
                answer_summary=(
                    "<user_audio_analysis>The emotions are neutral.</user_audio_analysis> "
                    "L'organisation indique que seul le DSI assume cette responsabilité."
                ),
                confidence=0.9,
            ),
        )
        self.assertEqual(
            target["comment"],
            "L'organisation indique que seul le DSI assume cette responsabilité.",
        )

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

    def test_interview_controls_are_detected(self):
        self.assertEqual(_detect_command("[THUCYD_COMMAND:repeat]"), "repeat")
        self.assertEqual(_detect_command("Pouvez-vous reformuler la question ?"), "rephrase")
        self.assertEqual(_detect_command("Pause"), "pause")
        self.assertEqual(
            _detect_command("Je voudrais corriger ma dernière réponse"),
            "correct_previous",
        )

    def test_introduction_waits_until_the_participant_is_ready(self):
        self.assertFalse(_is_ready_to_start("Pas encore, une minute."))
        self.assertTrue(_is_ready_to_start("Oui, allons-y."))

    def test_closing_requires_an_explicit_confirmation(self):
        self.assertFalse(_is_close_confirmation("Je voudrais ajouter un détail."))
        self.assertTrue(_is_close_confirmation("Oui, vous pouvez clôturer l'entretien."))

    def test_closing_prompt_contains_progress_and_summary(self):
        questions = [
            question(1, "Question 1", comment="Une politique est documentée."),
            question(2, "Question 2", comment="Des revues sont organisées."),
        ]
        prompt = _closing_prompt(questions, covered_count=2, total=2)
        self.assertIn("2 points sur 2", prompt)
        self.assertIn("Une politique est documentée", prompt)
        self.assertTrue(prompt.endswith("?"))

    def test_next_question_skips_already_covered_references(self):
        self.assertEqual(_next_uncovered_index([1, 2, 3, 4], 0, {1, 2, 3}), 3)
        self.assertIsNone(_next_uncovered_index([1, 2], 0, {1, 2}))
        self.assertEqual(
            _next_uncovered_index([1, 2, 3], 0, {1}, {1, 3}),
            2,
        )
        self.assertIsNone(_next_uncovered_index([1, 2], 0, {1}, {1}))


if __name__ == "__main__":
    unittest.main()
