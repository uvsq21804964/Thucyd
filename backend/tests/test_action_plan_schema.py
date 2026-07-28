import os
import unittest
from datetime import date

from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost/test")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-admin-password")

from app.routes.action_plan import (
    ActionItem,
    ActionPlanPayload,
    _gap_profile,
    _serialize_saved_item,
)


class ActionPlanSchemaTests(unittest.TestCase):
    def test_accepts_useful_action_fields(self):
        plan = ActionPlanPayload.model_validate(
            {
                "items": [
                    {
                        "title": "Formaliser la procédure",
                        "priority": "high",
                        "owner": "RSSI",
                        "estimated_cost": 2500,
                        "human_days": 4.5,
                        "resources": "RSSI et prestataire",
                        "status": "todo",
                    }
                ],
            }
        )
        self.assertEqual(plan.items[0].estimated_cost, 2500)
        self.assertEqual(plan.items[0].human_days, 4.5)
        self.assertEqual(plan.items[0].validation_status, "pending")

    def test_rejects_negative_cost(self):
        with self.assertRaises(ValidationError):
            ActionPlanPayload.model_validate(
                {"items": [{"title": "Action", "estimated_cost": -1}]}
            )

    def test_rejects_unknown_validation_status(self):
        with self.assertRaises(ValidationError):
            ActionPlanPayload.model_validate(
                {"items": [{"title": "Action", "validation_status": "automatic"}]}
            )

    def test_rejects_unknown_execution_status(self):
        with self.assertRaises(ValidationError):
            ActionPlanPayload.model_validate(
                {"items": [{"title": "Action", "status": "blocked"}]}
            )

    def test_new_item_cannot_spoof_generation_or_validation(self):
        incoming = ActionItem(
            title="Action manuelle",
            source="rules",
            validation_status="validated",
            validated_by="Utilisateur forge",
        )

        serialized = _serialize_saved_item(incoming, None)

        self.assertEqual(serialized["source"], "human")
        self.assertEqual(serialized["validation_status"], "pending")
        self.assertIsNone(serialized["validated_by"])
    def test_gap_profile_proposes_owner_cost_and_deadline(self):
        proposal = _gap_profile(
            {
                "ref": 7,
                "catégorie": "Technique",
                "chantier": "Sauvegardes",
                "question": "Les restaurations sont-elles testées ?",
                "comment": "Aucun test récent n'est disponible.",
                "note numérique": 1,
            },
            date(2026, 1, 1),
        )

        self.assertEqual(proposal["question_ref"], 7)
        self.assertEqual(proposal["priority"], "critical")
        self.assertEqual(proposal["owner"], "DSI / Équipe IT")
        self.assertGreater(proposal["estimated_cost"], 0)
        self.assertEqual(proposal["due_date"], "2026-01-31")
        self.assertEqual(proposal["source"], "rules")
        self.assertEqual(proposal["validation_status"], "pending")

    def test_material_edit_resets_human_validation(self):
        stored = ActionItem(
            title="Formaliser la procédure",
            owner="RSSI",
            due_date=date(2026, 12, 1),
            estimated_cost=2500,
            validation_status="validated",
            validation_comment="Budget confirmé",
            validated_by="Alice",
        ).model_dump(mode="json")
        incoming = ActionItem.model_validate({**stored, "estimated_cost": 3000})

        serialized = _serialize_saved_item(incoming, stored)

        self.assertEqual(serialized["validation_status"], "pending")
        self.assertIsNone(serialized["validated_by"])
        self.assertEqual(serialized["validation_comment"], "")

    def test_progress_update_preserves_human_validation(self):
        stored = ActionItem(
            title="Formaliser la procédure",
            owner="RSSI",
            due_date=date(2026, 12, 1),
            validation_status="validated",
            validated_by="Alice",
        ).model_dump(mode="json")
        incoming = ActionItem.model_validate({**stored, "status": "in_progress"})

        serialized = _serialize_saved_item(incoming, stored)

        self.assertEqual(serialized["validation_status"], "validated")
        self.assertEqual(serialized["validated_by"], "Alice")


if __name__ == "__main__":
    unittest.main()
