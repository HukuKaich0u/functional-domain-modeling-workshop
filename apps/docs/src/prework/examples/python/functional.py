from collections.abc import Callable
from procedural import Reason, Request

Rule = Callable[[Request], list[Reason]]


def equipment_rule(request: Request) -> list[Reason]:
    return [] if request.equipment_checked else ["EquipmentNotChecked"]


def flare_rule(request: Request) -> list[Reason]:
    return ["FlareAlertActive"] if request.flare_alert else []


def combine(rules: tuple[Rule, ...]) -> Rule:
    def combined(request: Request) -> list[Reason]:
        return [reason for rule in rules for reason in rule(request)]
    return combined


check = combine((equipment_rule, flare_rule))
