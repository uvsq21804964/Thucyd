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
from app.routes.interviews import ChatMessage, _latest_capture, _opening_greeting, _stream_response


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
