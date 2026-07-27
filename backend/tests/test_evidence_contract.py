import os
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.get_user_role import UserRole
from app.routes.evidence import (
    EvidenceValidation,
    _can_delete,
    _safe_filename,
    _validate_metadata,
)


class EvidenceContractTests(unittest.TestCase):
    def test_filename_is_reduced_to_a_safe_basename(self):
        self.assertEqual(
            _safe_filename(r"C:\fakepath\politique SSI.pdf"), "politique SSI.pdf"
        )
        self.assertEqual(_safe_filename("../../preuves/rapport.pdf"), "rapport.pdf")
        self.assertEqual(_safe_filename("\x00\n"), "document")

    def test_allowed_document_metadata_is_accepted(self):
        _validate_metadata("rapport.pdf", "application/pdf")
        _validate_metadata("inventaire.xlsx", "application/octet-stream")

    def test_disallowed_document_metadata_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            _validate_metadata("script.html", "text/html")
        self.assertEqual(raised.exception.status_code, 415)

    def test_validation_contract_only_accepts_a_final_decision(self):
        accepted = EvidenceValidation(status="validated", comment="Document vérifié")
        self.assertEqual(accepted.status, "validated")
        with self.assertRaises(ValidationError):
            EvidenceValidation.model_validate({"status": "pending"})
        with self.assertRaises(ValidationError):
            EvidenceValidation.model_validate({"status": "rejected", "unknown": True})

    def test_pending_evidence_deletion_is_limited_to_authorized_people(self):
        audit = SimpleNamespace(chef="Chef")
        evidence = SimpleNamespace(status="pending", uploaded_by="Alice")
        self.assertTrue(_can_delete(evidence, UserRole.AUDITOR, "Alice", audit))
        self.assertTrue(_can_delete(evidence, UserRole.AUDITOR, "Chef", audit))
        self.assertTrue(_can_delete(evidence, UserRole.ADMIN, "Bob", audit))
        self.assertFalse(_can_delete(evidence, UserRole.AUDITOR, "Bob", audit))
        evidence.status = "validated"
        self.assertFalse(_can_delete(evidence, UserRole.ADMIN, "Bob", audit))


if __name__ == "__main__":
    unittest.main()
