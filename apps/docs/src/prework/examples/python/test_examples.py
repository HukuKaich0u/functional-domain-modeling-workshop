import unittest

import functional
import object_oriented
import procedural
import rule_data
from boundary import Err, Minutes, Ok, describe_minutes, parse_minutes
from states import Approved, Draft, approve, label
from structural import Zone, read_zone
from type_operators import errors, example


class PreworkExamples(unittest.TestCase):
    def test_all_paradigms_share_the_same_contract(self) -> None:
        checks = (procedural.check, object_oriented.policy.check,
                  functional.check, rule_data.check)
        cases: tuple[tuple[bool, bool, list[procedural.Reason]], ...] = (
            (True, False, []),
            (False, False, ["EquipmentNotChecked"]),
            (True, True, ["FlareAlertActive"]),
            (False, True, ["EquipmentNotChecked", "FlareAlertActive"]),
        )
        for check in checks:
            for equipment, flare, expected in cases:
                with self.subTest(check=check, equipment=equipment, flare=flare):
                    request = procedural.Request(equipment, flare)
                    self.assertEqual(check(request), expected)
                    self.assertEqual(check(request), expected)
                    self.assertEqual(request, procedural.Request(equipment, flare))

    def test_approval_preserves_draft_and_requires_approver(self) -> None:
        draft = Draft("EVA-01")
        approved = approve(draft, "管制担当")
        self.assertEqual(approved, Approved("EVA-01", "管制担当"))
        self.assertEqual(label(draft), "申請中")
        self.assertEqual(label(approved), "承認者: 管制担当")
        self.assertEqual(draft, Draft("EVA-01"))

    def test_invalid_external_values_are_rejected(self) -> None:
        invalid: tuple[object, ...] = (
            0, -1, "30", float("nan"), float("inf"),
            float("-inf"), None, {}, True, False, 10 ** 400,
        )
        for value in invalid:
            with self.subTest(value=value):
                self.assertEqual(parse_minutes(value), Err("InvalidMinutes"))

    def test_valid_minutes_and_error_messages(self) -> None:
        for value in (30, 0.5):
            self.assertEqual(parse_minutes(value), Ok(Minutes(float(value))))
        self.assertEqual(describe_minutes(30), "30分の予定です")
        self.assertEqual(describe_minutes("30"), "作業時間は正の有限な数で入力してください")

    def test_identifier_and_field_access(self) -> None:
        self.assertEqual(read_zone(Zone("ZONE-01")), "ZONE-01")
        self.assertFalse(example())
        self.assertEqual(errors["equipment_checked"], "装備点検を完了してください")


if __name__ == "__main__":
    unittest.main()
