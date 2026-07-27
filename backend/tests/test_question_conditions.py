import unittest

from app.question_conditions import active_question_refs, condition_matches


def question(ref, mark=None, display_if=None):
    item = {
        "ref": ref,
        "catégorie": "Gouvernance",
        "chantier": "Organisation",
        "question": f"Question {ref}",
        "comment": "",
        "note numérique": mark,
        "aide à la notation": [],
    }
    if display_if is not None:
        item["display_if"] = display_if
    return item


class QuestionConditionTests(unittest.TestCase):
    def test_numeric_operators(self):
        cases = [
            ({"operator": "eq", "value": 2}, 2, True),
            ({"operator": "neq", "value": 2}, 3, True),
            ({"operator": "lt", "value": 2}, 1, True),
            ({"operator": "lte", "value": 2}, 2, True),
            ({"operator": "gt", "value": 2}, 3, True),
            ({"operator": "gte", "value": 2}, 2, True),
            ({"operator": "in", "value": [1, 2]}, 2, True),
            ({"operator": "not_in", "value": [1, 2]}, 4, True),
        ]
        for condition, mark, expected in cases:
            with self.subTest(condition=condition):
                self.assertEqual(condition_matches(condition, mark), expected)
                self.assertFalse(condition_matches(condition, None))

    def test_answered_and_unanswered_operators(self):
        self.assertTrue(condition_matches({"operator": "answered"}, 0))
        self.assertFalse(condition_matches({"operator": "answered"}, None))
        self.assertTrue(condition_matches({"operator": "unanswered"}, None))
        self.assertFalse(condition_matches({"operator": "unanswered"}, 0))

    def test_question_appears_only_when_source_answer_matches(self):
        questions = [
            question(1),
            question(2, display_if={"question_ref": 1, "operator": "lte", "value": 2}),
            question(3),
        ]
        self.assertEqual(active_question_refs(questions), [1, 3])
        questions[0]["note numérique"] = 1
        self.assertEqual(active_question_refs(questions), [1, 2, 3])
        questions[0]["note numérique"] = 4
        self.assertEqual(active_question_refs(questions), [1, 3])

    def test_condition_chain_requires_every_parent_to_be_active(self):
        questions = [
            question(1, 4),
            question(2, 0, {"question_ref": 1, "operator": "lte", "value": 2}),
            question(3, None, {"question_ref": 2, "operator": "eq", "value": 0}),
        ]
        self.assertEqual(active_question_refs(questions), [1])


if __name__ == "__main__":
    unittest.main()