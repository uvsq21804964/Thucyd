import os
import unittest
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.questionnaires.versioning import (
    pristine_questions,
    questionnaire_checksum,
    questions_for_audit,
)


def template():
    return [
        {
            "ref": 1,
            "catégorie": "Gouvernance",
            "chantier": "Organisation",
            "question": "Un responsable est-il désigné ?",
            "comment": None,
            "note numérique": None,
            "aide à la notation": ["0 : Non", "4 : Oui"],
        },
        {
            "ref": 2,
            "catégorie": "Gouvernance",
            "chantier": "Organisation",
            "question": "Une feuille de route est-elle formalisée ?",
            "comment": None,
            "note numérique": None,
            "aide à la notation": [],
            "display_if": {"question_ref": 1, "operator": "lte", "value": 2},
        },
    ]


class QuestionnaireVersioningTests(unittest.TestCase):
    def test_checksum_ignores_audit_answers(self):
        answered = template()
        answered[0]["comment"] = "Un DSI est désigné."
        answered[0]["note numérique"] = 3

        self.assertEqual(
            questionnaire_checksum(template()),
            questionnaire_checksum(answered),
        )

    def test_checksum_changes_when_referential_changes(self):
        changed = template()
        changed[0]["question"] = "Le RSSI est-il formellement désigné ?"

        self.assertNotEqual(
            questionnaire_checksum(template()),
            questionnaire_checksum(changed),
        )

    def test_pristine_snapshot_preserves_conditions_and_clears_answers(self):
        answered = template()
        answered[0]["comment"] = "Réponse"
        answered[0]["note numérique"] = 4

        snapshot = pristine_questions(answered)

        self.assertIsNone(snapshot[0]["comment"])
        self.assertIsNone(snapshot[0]["note numérique"])
        self.assertEqual(snapshot[1]["display_if"]["question_ref"], 1)

    def test_audit_copy_does_not_mutate_immutable_version(self):
        version = SimpleNamespace(questions=template())

        audit_questions = questions_for_audit(version)
        audit_questions[0]["comment"] = "Réponse enregistrée"
        audit_questions[0]["note numérique"] = 4

        self.assertIsNone(version.questions[0]["comment"])
        self.assertIsNone(version.questions[0]["note numérique"])
        self.assertEqual(audit_questions[0]["comment"], "Réponse enregistrée")


if __name__ == "__main__":
    unittest.main()
