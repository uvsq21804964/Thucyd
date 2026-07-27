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

    def test_accepts_a_condition_referencing_an_earlier_question(self):
        conditional = question(2)
        conditional["display_if"] = {
            "question_ref": 1,
            "operator": "lte",
            "value": 2,
        }
        payload = audits.model_validate(self.payload([question(1), conditional]))
        self.assertEqual(payload.questionnaire[1].display_if.question_ref, 1)
        self.assertEqual(payload.questionnaire[1].display_if.operator, "lte")

    def test_accepts_answered_condition_without_value(self):
        conditional = question(2)
        conditional["display_if"] = {"question_ref": 1, "operator": "answered"}
        payload = audits.model_validate(self.payload([question(1), conditional]))
        self.assertIsNone(payload.questionnaire[1].display_if.value)

    def test_rejects_condition_referencing_a_later_question(self):
        first = question(1)
        first["display_if"] = {"question_ref": 2, "operator": "eq", "value": 0}
        with self.assertRaises(ValidationError):
            audits.model_validate(self.payload([first, question(2)]))

    def test_rejects_condition_with_invalid_value_shape(self):
        conditional = question(2)
        conditional["display_if"] = {"question_ref": 1, "operator": "in", "value": 2}
        with self.assertRaises(ValidationError):
            audits.model_validate(self.payload([question(1), conditional]))
    def test_rejects_unknown_keys(self):
        invalid = {**question(), "clé inattendue": True}
        with self.assertRaises(ValidationError):
            audits.model_validate(self.payload([invalid]))


if __name__ == "__main__":
    unittest.main()
