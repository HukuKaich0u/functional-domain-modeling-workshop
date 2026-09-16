from dataclasses import dataclass
from typing import Literal
from procedural import Reason, Request

Field = Literal["equipment_checked", "flare_alert"]


@dataclass(frozen=True)
class RuleData:
    field: Field
    expected: bool
    reason: Reason


rules = (
    RuleData("equipment_checked", True, "EquipmentNotChecked"),
    RuleData("flare_alert", False, "FlareAlertActive"),
)


def read_field(request: Request, field: Field) -> bool:
    return request.equipment_checked if field == "equipment_checked" else request.flare_alert


def check(request: Request) -> list[Reason]:
    return [rule.reason for rule in rules
            if read_field(request, rule.field) != rule.expected]
