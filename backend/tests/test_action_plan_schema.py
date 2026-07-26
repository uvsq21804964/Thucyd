import os
import unittest

from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.routes.action_plan import ActionPlanPayload


class ActionPlanSchemaTests(unittest.TestCase):
    def test_accepts_useful_action_fields(self):
        plan = ActionPlanPayload.model_validate({
            "items": [{
                "title": "Formaliser la procédure",
                "priority": "high",
                "owner": "RSSI",
                "estimated_cost": 2500,
                "human_days": 4.5,
                "resources": "RSSI et prestataire",
                "status": "todo",
            }],
        })
        self.assertEqual(plan.items[0].estimated_cost, 2500)
        self.assertEqual(plan.items[0].human_days, 4.5)

    def test_rejects_negative_cost(self):
        with self.assertRaises(ValidationError):
            ActionPlanPayload.model_validate({"items": [{"title": "Action", "estimated_cost": -1}]})

    def test_rejects_unknown_status(self):
        with self.assertRaises(ValidationError):
            ActionPlanPayload.model_validate({"items": [{"title": "Action", "status": "blocked"}]})


if __name__ == "__main__":
    unittest.main()
