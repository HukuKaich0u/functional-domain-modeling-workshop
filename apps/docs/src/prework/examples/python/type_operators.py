from typing import TypedDict
from procedural import Request
from rule_data import Field, read_field


# Mapped Typesの直訳ではなく、対応する項目を明示する。
class FieldErrors(TypedDict, total=False):
    equipment_checked: str
    flare_alert: str


errors: FieldErrors = {"equipment_checked": "装備点検を完了してください"}


def example() -> bool:
    field: Field = "flare_alert"
    return read_field(Request(True, False), field)


# Field = Literal[...] とFieldErrorsは項目追加時に手動で同期する。
# 存在しないキーの指定は静的型検査で検出する。
