import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

import gzip
import json
import unittest
from datetime import datetime

from app.AuditDao.audit import Audit
from app.AuditDao.openaudits import OpenAudits
from app.routes.GestionAudit import _build_audit_results


class AuditDomainTests(unittest.TestCase):
    def question(self, ref=1, mark=None):
        return {
            "ref": ref,
            "catégorie": "Réseau",
            "chantier": "Protection",
            "question": "Une question",
            "aide à la notation": [],
            "note numérique": mark,
            "comment": "",
        }

    def audit(self, questions=None, auditors=None):
        return Audit("audit-id", "Ornisec", questions or [self.question()], datetime(2026, 1, 2), "chef", list_auditeurs=auditors)

    def test_auditor_lists_are_not_shared_between_instances(self):
        first = self.audit()
        second = self.audit()
        first.list_auditeurs.append("alice")
        self.assertEqual(second.list_auditeurs, [])

    def test_completion_and_score(self):
        item = self.audit([self.question(1, 2), self.question(2, 4)])
        self.assertTrue(item.finis())
        self.assertEqual(item.incomplete(), {"incomplete": 0, "total question": 2})
        self.assertEqual(item.CyberScore(), 3)

    def test_incomplete_audit_has_no_numeric_score(self):
        item = self.audit()
        self.assertFalse(item.finis())
        self.assertIn("question 1", item.CyberScore())

    def test_answer_is_updated_atomically(self):
        item = self.audit()
        self.assertTrue(item.set_answer(1, 3, "Preuve vérifiée"))
        self.assertEqual(item.fiche[0]["note numérique"], 3)
        self.assertEqual(item.fiche[0]["comment"], "Preuve vérifiée")

    def test_setters_report_unknown_question(self):
        item = self.audit()
        self.assertFalse(item.set_mark(999, 2))
        self.assertFalse(item.set_comment(999, "absente"))

    def test_explicit_status_requires_closure(self):
        item = Audit(
            "audit-id",
            "Ornisec",
            [self.question(1, 4)],
            datetime(2026, 1, 2),
            "chef",
            audit_status="in_progress",
        )
        self.assertTrue(item.questionnaire_complete())
        self.assertFalse(item.finis())
        item.confirmer_terminer()
        self.assertTrue(item.finis())
        self.assertIsNotNone(item.datefin)

    def test_result_summary_groups_scores_by_category(self):
        questions = [self.question(1, 2), self.question(2, 4), self.question(3, None)]
        questions[2]["catégorie"] = "Organisation"
        summary = _build_audit_results(self.audit(questions))
        self.assertEqual(summary["score"], 3)
        self.assertEqual(summary["answered"], 2)
        self.assertEqual(summary["categories"][0]["score"], 3)
        self.assertIsNone(summary["categories"][1]["score"])

    def test_completion_ignores_inactive_conditional_questions(self):
        questions = [self.question(1, None), self.question(2, None)]
        questions[1]["display_if"] = {
            "question_ref": 1,
            "operator": "lte",
            "value": 2,
        }
        item = self.audit(questions)
        self.assertEqual(item.incomplete(), {"incomplete": 1, "total question": 1})
        item.set_mark(1, 1)
        self.assertEqual(item.incomplete(), {"incomplete": 1, "total question": 2})
        item.set_mark(1, 4)
        self.assertEqual(item.incomplete(), {"incomplete": 0, "total question": 1})
    def test_embedded_questionnaire_keys_are_normalized(self):
        with gzip.open("app/fiche/audit_book.json.gz", "rt", encoding="utf-8") as source:
            questions = OpenAudits._normalize_questions(json.load(source))
        self.assertIn("catégorie", questions[0])
        self.assertIn("note numérique", questions[0])
        self.assertIn("aide à la notation", questions[0])


if __name__ == "__main__":
    unittest.main()
