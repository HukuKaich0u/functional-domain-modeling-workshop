from dataclasses import dataclass
from typing import assert_never


@dataclass(frozen=True)
class Draft:
    id: str


@dataclass(frozen=True)
class Approved:
    id: str
    approved_by: str


Permit = Draft | Approved


# 状態の形だけを学ぶ例。業務の承認条件は省略する。
def approve(draft: Draft, approved_by: str) -> Approved:
    return Approved(draft.id, approved_by)


def label(permit: Permit) -> str:
    if isinstance(permit, Draft):
        return "申請中"
    if isinstance(permit, Approved):
        return f"承認者: {permit.approved_by}"
    assert_never(permit)
