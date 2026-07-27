import asyncio
import json
import os
import unittest
from uuid import uuid4

from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.interviews.tokens import create_session_token, extract_session_claims, tavus_context
from app.routes.interviews import ChatMessage, _opening_greeting, _stream_response


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
