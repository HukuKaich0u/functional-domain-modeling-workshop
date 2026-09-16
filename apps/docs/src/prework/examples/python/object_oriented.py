from typing import Protocol
from procedural import Reason, Request


class Rule(Protocol):
    def check(self, request: Request) -> list[Reason]: ...


class EquipmentRule:
    def check(self, request: Request) -> list[Reason]:
        return [] if request.equipment_checked else ["EquipmentNotChecked"]


class FlareRule:
    def check(self, request: Request) -> list[Reason]:
        return ["FlareAlertActive"] if request.flare_alert else []


class ApprovalPolicy:
    def __init__(self, rules: tuple[Rule, ...]) -> None:
        self.rules = rules

    def check(self, request: Request) -> list[Reason]:
        return [reason for rule in self.rules for reason in rule.check(request)]


policy = ApprovalPolicy((EquipmentRule(), FlareRule()))
