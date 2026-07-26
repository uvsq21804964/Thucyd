import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

import unittest
from datetime import timedelta
from fastapi import HTTPException
from starlette.requests import Request
from app.oauth2 import AuthJWT
from app.outils import hash_password, verify_password


def request_with_cookie(token: str | None = None) -> Request:
    headers = [] if token is None else [(b"cookie", f"access_token={token}".encode())]
    return Request({"type": "http", "headers": headers})


class AuthenticationTests(unittest.TestCase):
    def test_password_round_trip(self):
        hashed = hash_password("correct-horse-battery-staple")
        self.assertTrue(verify_password("correct-horse-battery-staple", hashed))
        self.assertFalse(verify_password("wrong-password", hashed))

    def test_access_token_round_trip(self):
        issuer = AuthJWT(request_with_cookie())
        token = issuer.create_access_token("user-id", timedelta(minutes=1))
        verifier = AuthJWT(request_with_cookie(token))
        verifier.jwt_required()
        self.assertEqual(verifier.get_jwt_subject(), "user-id")

    def test_missing_token_is_rejected(self):
        with self.assertRaises(HTTPException) as context:
            AuthJWT(request_with_cookie()).jwt_required()
        self.assertEqual(context.exception.status_code, 401)

    def test_refresh_token_cannot_authenticate(self):
        issuer = AuthJWT(request_with_cookie())
        token = issuer.create_refresh_token("user-id", timedelta(minutes=1))
        with self.assertRaises(HTTPException):
            AuthJWT(request_with_cookie(token)).jwt_required()


if __name__ == "__main__":
    unittest.main()