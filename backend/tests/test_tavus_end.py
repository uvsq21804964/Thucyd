import os
import unittest
from unittest.mock import Mock, patch

import httpx

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.interviews.tavus import TavusAPIError, end_tavus_conversation
from app.settings import settings


class TavusEndConversationTests(unittest.TestCase):
    def test_ends_conversation_with_server_api_key(self):
        response = Mock()
        response.is_error = False

        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch("app.interviews.tavus.httpx.post", return_value=response) as post,
        ):
            end_tavus_conversation("c-test")

        args, kwargs = post.call_args
        self.assertTrue(args[0].endswith("/c-test/end"))
        self.assertEqual(kwargs["headers"]["x-api-key"], "server-secret")

    def test_network_failure_is_safe(self):
        request = httpx.Request(
            "POST", "https://tavusapi.com/v2/conversations/c-test/end"
        )
        with (
            patch.object(settings, "TAVUS_API_KEY", "server-secret"),
            patch(
                "app.interviews.tavus.httpx.post",
                side_effect=httpx.ConnectError("offline", request=request),
            ),
            self.assertRaises(TavusAPIError) as caught,
        ):
            end_tavus_conversation("c-test")

        self.assertEqual(caught.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
