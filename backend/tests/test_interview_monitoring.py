import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.interviews.monitoring import (
    aggregate_latency,
    session_coverage,
    session_duration_seconds,
)


class InterviewMonitoringTests(unittest.TestCase):
    def test_latency_is_averaged_by_stage_and_ignores_legacy_turns(self):
        turns = [
            SimpleNamespace(
                decision={
                    "timings": {
                        "context_ms": 10,
                        "preparation_ms": 20,
                        "ai_ms": 1000,
                        "validation_ms": 4,
                        "persistence_ms": 16,
                        "total_ms": 1050,
                    }
                }
            ),
            SimpleNamespace(
                decision={
                    "timings": {
                        "context_ms": 30,
                        "preparation_ms": 40,
                        "ai_ms": 2000,
                        "validation_ms": 6,
                        "persistence_ms": 24,
                        "total_ms": 2100,
                    }
                }
            ),
            SimpleNamespace(decision={"action": "next_question"}),
        ]

        result = aggregate_latency(turns)

        self.assertEqual(result["sampled_turns"], 2)
        self.assertEqual(result["total_turns"], 3)
        self.assertEqual(result["average_total_ms"], 1575)
        stages = {item["key"]: item for item in result["stages"]}
        self.assertEqual(stages["context"]["average_ms"], 20)
        self.assertEqual(stages["ai"]["average_ms"], 1500)
        self.assertEqual(stages["persistence"]["samples"], 2)

    def test_session_duration_uses_the_last_recorded_turn(self):
        started_at = datetime(2026, 7, 28, 10, 0, tzinfo=timezone.utc)
        session = SimpleNamespace(created_at=started_at)
        turns = [
            SimpleNamespace(created_at=started_at + timedelta(seconds=30)),
            SimpleNamespace(created_at=started_at + timedelta(minutes=4, seconds=5)),
        ]

        self.assertEqual(session_duration_seconds(session, turns), 245)

    def test_coverage_only_counts_active_known_references(self):
        session = SimpleNamespace(followups={"covered_refs": [1, "2", 99, "bad"]})
        questions = [
            {"ref": 1, "note numérique": 2},
            {"ref": 2, "note numérique": 3},
            {
                "ref": 3,
                "note numérique": None,
                "display_if": {"question_ref": 1, "operator": "gt", "value": 3},
            },
        ]

        result = session_coverage(session, questions)

        self.assertEqual(result, {"covered": 2, "total": 2, "rate": 100.0})

    def test_empty_latency_has_explicit_no_data_values(self):
        result = aggregate_latency([])

        self.assertIsNone(result["average_total_ms"])
        self.assertTrue(all(item["average_ms"] is None for item in result["stages"]))


if __name__ == "__main__":
    unittest.main()
