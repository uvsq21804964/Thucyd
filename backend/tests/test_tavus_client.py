import os
import unittest
from unittest.mock import Mock, patch

import httpx

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.interviews.tavus import (
    TavusAPIError,
    create_tavus_conversation,
    get_tavus_conversation_status,
)
from app.settings import settings


class TavusClientTests(unittest.TestCase):
    def test_creates_private_conversation_with_audit_context(self):
        response = Mock()
        response.is_error = False
        response.json.return_value = {
            "conversation_id": "c-test",
            "conversation_url": "https://tavus.daily.co/c-test",
            "status": "active",
            "meeting_token": "signed-meeting-token",
        }

        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch.object(settings, "TAVUS_PERSONA_ID", "p-test"),
            patch.object(settings, "TAVUS_REPLICA_ID", "r-test"),
            patch.object(settings, "TAVUS_REQUIRE_AUTH", True),
            patch("app.interviews.tavus.httpx.post", return_value=response) as post,
        ):
            result = create_tavus_conversation(
                conversation_name="Audit ORNISEC - Exemple",
                conversational_context="<ornisec_session>signed</ornisec_session>",
                custom_greeting="Première question ?",
            )

        self.assertEqual(result.conversation_id, "c-test")
        _, kwargs = post.call_args
        self.assertEqual(kwargs["headers"]["x-api-key"], "server-secret")
        self.assertEqual(kwargs["json"]["persona_id"], "p-test")
        self.assertEqual(kwargs["json"]["replica_id"], "r-test")
        self.assertTrue(kwargs["json"]["require_auth"])
        self.assertEqual(kwargs["json"]["max_participants"], 2)
        self.assertEqual(kwargs["json"]["properties"]["language"], "french")
        self.assertIn("<ornisec_session>", kwargs["json"]["conversational_context"])

    def test_missing_persona_is_rejected_before_network_call(self):
        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch.object(settings, "TAVUS_PERSONA_ID", None),
            patch("app.interviews.tavus.httpx.post") as post,
            self.assertRaises(TavusAPIError) as caught,
        ):
            create_tavus_conversation(
                conversation_name="Audit",
                conversational_context="context",
                custom_greeting="Bonjour",
            )

        self.assertEqual(caught.exception.status_code, 503)
        post.assert_not_called()

    def test_upstream_error_is_mapped_without_exposing_credentials(self):
        response = Mock()
        response.is_error = True
        response.json.return_value = {"message": "Persona inconnue"}

        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch.object(settings, "TAVUS_PERSONA_ID", "p-test"),
            patch("app.interviews.tavus.httpx.post", return_value=response),
            self.assertRaises(TavusAPIError) as caught,
        ):
            create_tavus_conversation(
                conversation_name="Audit",
                conversational_context="context",
                custom_greeting="Bonjour",
            )

        self.assertEqual(caught.exception.status_code, 502)
        self.assertEqual(caught.exception.detail, "Persona inconnue")
        self.assertNotIn("server-secret", caught.exception.detail)

    def test_network_error_is_mapped_to_bad_gateway(self):
        request = httpx.Request("POST", "https://tavusapi.com/v2/conversations")
        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch.object(settings, "TAVUS_PERSONA_ID", "p-test"),
            patch(
                "app.interviews.tavus.httpx.post",
                side_effect=httpx.ConnectError("offline", request=request),
            ),
            self.assertRaises(TavusAPIError) as caught,
        ):
            create_tavus_conversation(
                conversation_name="Audit",
                conversational_context="context",
                custom_greeting="Bonjour",
            )

        self.assertEqual(caught.exception.status_code, 502)


    def test_concurrency_limit_is_mapped_to_conflict_with_helpful_message(self):
        response = Mock()
        response.is_error = True
        response.json.return_value = {
            "message": "User has reached maximum concurrent conversations"
        }

        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch.object(settings, "TAVUS_PERSONA_ID", "p-test"),
            patch("app.interviews.tavus.httpx.post", return_value=response),
            self.assertRaises(TavusAPIError) as caught,
        ):
            create_tavus_conversation(
                conversation_name="Audit",
                conversational_context="context",
                custom_greeting="Bonjour",
            )

        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("limite de conversations Tavus", caught.exception.detail)

    def test_missing_credits_is_mapped_to_payment_required(self):
        response = Mock()
        response.is_error = True
        response.json.return_value = {
            "message": "The user is out of conversational credits."
        }

        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch.object(settings, "TAVUS_PERSONA_ID", "p-test"),
            patch("app.interviews.tavus.httpx.post", return_value=response),
            self.assertRaises(TavusAPIError) as caught,
        ):
            create_tavus_conversation(
                conversation_name="Audit",
                conversational_context="context",
                custom_greeting="Bonjour",
            )

        self.assertEqual(caught.exception.status_code, 402)
        self.assertIn("crédits conversationnels", caught.exception.detail)

    def test_gets_conversation_status(self):
        response = Mock()
        response.status_code = 200
        response.is_error = False
        response.json.return_value = {"status": "active"}

        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch("app.interviews.tavus.httpx.get", return_value=response) as get,
        ):
            status = get_tavus_conversation_status("c-test")

        self.assertEqual(status, "active")
        self.assertIn("/c-test", get.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
