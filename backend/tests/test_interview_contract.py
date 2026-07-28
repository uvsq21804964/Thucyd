import asyncio
import json
import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.interviews.tokens import create_session_token, extract_session_claims, tavus_context
from app.routes.interviews import (
    ChatMessage,
    _latest_capture,
    _opening_greeting,
    _review_summary,
    _resume_greeting,
    _session_response,
    _stream_response,
)


class InterviewContractTests(unittest.TestCase):
    def test_signed_context_round_trip(self):
        session_id = uuid4()
        audit_id = uuid4()
        token = create_session_token(session_id, audit_id)
        messages = [
            ChatMessage(role="system", content=tavus_context(token)),
            ChatMessage(role="user", content="Voici ma réponse."),
        ]
        self.assertEqual(extract_session_claims(messages), (session_id, audit_id))

    def test_missing_context_is_rejected(self):
        with self.assertRaises(HTTPException):
            extract_session_claims([ChatMessage(role="user", content="Bonjour")])

    def test_multimodal_message_text_is_normalized(self):
        message = ChatMessage(
            role="user",
            content=[{"type": "text", "text": "Première partie"}, {"text": "seconde partie"}],
        )
        self.assertEqual(message.text_content(), "Première partie seconde partie")

    def test_opening_greeting_explains_the_interview_before_questioning(self):
        greeting = _opening_greeting("ACME", 20)
        self.assertIn("ACME", greeting)
        self.assertIn("20 questions", greeting)
        self.assertIn("enregistr", greeting)
        self.assertTrue(greeting.endswith("?"))

    def test_resume_greeting_repeats_the_last_saved_prompt(self):
        interview = SimpleNamespace(
            followups={"stage": "interview"},
            question_refs=[1, 2],
            current_index=1,
        )
        audit = SimpleNamespace(
            company_name="ACME",
            fiche=[
                {"ref": 1, "question": "Première question ?"},
                {"ref": 2, "question": "Deuxième question ?"},
            ],
        )
        turns = [
            SimpleNamespace(
                assistant_text="Pouvez-vous préciser le résultat obtenu ?"
            )
        ]

        greeting = _resume_greeting(interview, audit, turns)

        self.assertIn("reprenons exactement", greeting)
        self.assertTrue(greeting.endswith("résultat obtenu ?"))

    def test_resume_greeting_falls_back_to_current_question(self):
        interview = SimpleNamespace(
            followups={"stage": "interview"},
            question_refs=[1, 2],
            current_index=1,
        )
        audit = SimpleNamespace(
            company_name="ACME",
            fiche=[
                {"ref": 1, "question": "Première question ?"},
                {"ref": 2, "question": "Deuxième question ?"},
            ],
        )

        greeting = _resume_greeting(interview, audit, [])

        self.assertTrue(greeting.endswith("Deuxième question ?"))

    def test_session_response_identifies_a_resumed_session(self):
        interview = SimpleNamespace(id=uuid4())
        response = _session_response(
            interview,
            uuid4(),
            "Reprenons.",
            {"conversation_id": "c-resume"},
            reused=False,
            resumed=True,
        )
        self.assertTrue(response["resumed"])
        self.assertFalse(response["reused"])

    def test_latest_capture_only_exposes_recent_recorded_elements(self):
        recorded_at = datetime.now(timezone.utc)
        turns = [
            SimpleNamespace(created_at=recorded_at, decision={"updates": []}),
            SimpleNamespace(
                created_at=recorded_at,
                decision={
                    "updates": [
                        {
                            "question_ref": 7,
                            "answer_summary": "Une procédure est documentée.",
                            "evidence": ["PROC-SSI-01", "Compte rendu annuel", "Ignorée"],
                            "suggested_mark": 4,
                            "mark_rationale": "4 : Politique validée — Le document est approuvé.",
                            "confidence": 0.9,
                        },
                        {
                            "question_ref": 8,
                            "answer_summary": "Le contrôle reste à confirmer.",
                            "evidence": [],
                            "suggested_mark": 2,
                            "confidence": 0.5,
                        },
                    ]
                },
            ),
        ]
        capture = _latest_capture(turns)
        self.assertEqual(capture["recorded_at"], recorded_at)
        self.assertEqual(capture["items"][0]["question_ref"], 7)
        self.assertEqual(capture["items"][0]["evidence"], ["PROC-SSI-01", "Compte rendu annuel"])
        self.assertEqual(capture["items"][0]["mark"], 4)
        self.assertIn("Politique validée", capture["items"][0]["mark_rationale"])
        self.assertIsNone(capture["items"][1]["mark"])

    def test_review_summary_identifies_points_to_validate(self):
        turns = [
            SimpleNamespace(
                decision={
                    "updates": [
                        {
                            "question_ref": 1,
                            "answer_summary": "Une politique est documentée.",
                            "evidence": ["POL-01"],
                            "suggested_mark": 4,
                            "mark_rationale": "4 : politique validée et diffusée.",
                            "confidence": 0.92,
                        },
                        {
                            "question_ref": 2,
                            "answer_summary": "Le contrôle reste informel.",
                            "evidence": [],
                            "suggested_mark": None,
                            "mark_rationale": None,
                            "confidence": 0.55,
                        },
                    ]
                }
            )
        ]
        questions = [
            {
                "ref": 1,
                "catégorie": "Gouvernance",
                "chantier": "Politiques",
                "question": "La politique est-elle formalisée ?",
                "comment": "Une politique est documentée. Preuves mentionnées : POL-01",
                "note numérique": 4,
                "aide à la notation": ["0 : non", "4 : oui"],
            },
            {
                "ref": 2,
                "catégorie": "Gouvernance",
                "chantier": "Contrôles",
                "question": "Le contrôle est-il revu ?",
                "comment": "Le contrôle reste informel.",
                "note numérique": None,
                "aide à la notation": ["0 : jamais", "4 : annuellement"],
            },
            {
                "ref": 3,
                "catégorie": "Technique",
                "chantier": "Sauvegardes",
                "question": "Les restaurations sont-elles testées ?",
                "comment": "",
                "note numérique": None,
                "aide à la notation": [],
            },
        ]

        review = _review_summary(questions, turns, [1, 2, 3])

        self.assertEqual(
            review["counts"],
            {
                "ready": 1,
                "attention": 1,
                "unanswered": 1,
                "without_evidence": 1,
                "total": 3,
            },
        )
        self.assertEqual(review["items"][0]["evidence"], ["POL-01"])
        self.assertIn("confiance", review["items"][1]["reasons"][0])
        self.assertIn("notation", review["items"][1]["reasons"][1])

    def test_review_summary_uses_validated_document_evidence(self):
        questions = [{
            "ref": 1,
            "catégorie": "Gouvernance",
            "chantier": "Politiques",
            "question": "La politique est-elle formalisée ?",
            "comment": "La politique est formalisée.",
            "note numérique": 4,
            "aide à la notation": ["4 : oui"],
        }]

        pending = _review_summary(
            questions, [], [1],
            {1: [{"filename": "politique.pdf", "status": "pending"}]},
        )["items"][0]
        self.assertEqual(pending["status"], "attention")
        self.assertTrue(pending["without_evidence"])
        self.assertIn("valider", pending["reasons"][0])

        validated = _review_summary(
            questions, [], [1],
            {1: [{"filename": "politique.pdf", "status": "validated"}]},
        )["items"][0]
        self.assertEqual(validated["status"], "ready")
        self.assertFalse(validated["without_evidence"])
        self.assertEqual(validated["evidence"], ["Document : politique.pdf"])
    def test_review_summary_discards_stale_ai_metadata_after_manual_edit(self):
        turns = [
            SimpleNamespace(
                decision={
                    "updates": [
                        {
                            "question_ref": 1,
                            "answer_summary": "Ancienne synthèse.",
                            "evidence": ["ANCIENNE-PREUVE"],
                            "suggested_mark": 2,
                            "mark_rationale": "Ancienne justification.",
                            "confidence": 0.4,
                        }
                    ]
                }
            )
        ]
        questions = [
            {
                "ref": 1,
                "catégorie": "Gouvernance",
                "chantier": "Politiques",
                "question": "La politique est-elle formalisée ?",
                "comment": "Synthèse corrigée manuellement.",
                "note numérique": 4,
                "aide à la notation": ["0 : non", "4 : oui"],
            }
        ]

        item = _review_summary(questions, turns, [1])["items"][0]

        self.assertEqual(item["summary"], "Synthèse corrigée manuellement.")
        self.assertIsNone(item["confidence"])
        self.assertIsNone(item["mark_rationale"])
        self.assertEqual(item["evidence"], [])
        self.assertEqual(item["status"], "ready")

    def test_sse_stream_is_openai_compatible(self):
        async def collect():
            return [chunk async for chunk in _stream_response("Question suivante ?", "test-model")]

        chunks = asyncio.run(collect())
        self.assertEqual(chunks[-1], "data: [DONE]\n\n")
        payloads = [
            json.loads(chunk.removeprefix("data: ").strip())
            for chunk in chunks[:-1]
        ]
        spoken = "".join(
            payload["choices"][0]["delta"].get("content", "")
            for payload in payloads
        )
        self.assertEqual(spoken, "Question suivante ?")
        self.assertEqual(payloads[-1]["choices"][0]["finish_reason"], "stop")


if __name__ == "__main__":
    unittest.main()
