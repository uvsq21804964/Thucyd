import os
import unittest

from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.schemas import audits


def question(ref=1):
    return {
        "ref": ref,
        "catégorie": "Gouvernance",
        "chantier": "Organisation",
        "question": "Un responsable est-il désigné ?",
        "comment": None,
        "note numérique": None,
        "aide à la notation": ["0 : Non", "4 : Oui"],
    }


class QuestionnaireSchemaTests(unittest.TestCase):
    def payload(self, questionnaire):
        return {
            "company_name": "Ornisec",
            "chef_auditeurs": "Alice",
            "list_auditeurs": ["Alice"],
            "description": "Audit personnalisé",
            "questionnaire": questionnaire,
        }

    def test_accepts_exact_questionnaire_format(self):
        payload = audits.model_validate(self.payload([question()]))
        serialized = payload.questionnaire[0].model_dump(by_alias=True)
        self.assertEqual(serialized["catégorie"], "Gouvernance")
        self.assertIsNone(serialized["note numérique"])

    def test_rejects_duplicate_references(self):
        with self.assertRaises(ValidationError):
            audits.model_validate(self.payload([question(1), question(1)]))

    def test_rejects_answers_in_new_questionnaire(self):
        answered = question()
        answered["note numérique"] = 4
        with self.assertRaises(ValidationError):
            audits.model_validate(self.payload([answered]))

    def test_rejects_unknown_keys(self):
        invalid = {**question(), "clé inattendue": True}
        with self.assertRaises(ValidationError):
            audits.model_validate(self.payload([invalid]))


if __name__ == "__main__":
    unittest.main()
