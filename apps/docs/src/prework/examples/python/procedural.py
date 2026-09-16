from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Request:
    equipment_checked: bool
    flare_alert: bool


Reason = Literal["EquipmentNotChecked", "FlareAlertActive"]


def check(request: Request) -> list[Reason]:
    reasons: list[Reason] = []
    if not request.equipment_checked:
        reasons.append("EquipmentNotChecked")
    if request.flare_alert:
        reasons.append("FlareAlertActive")
    return reasons
