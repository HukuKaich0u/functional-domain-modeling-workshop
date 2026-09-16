"""mypy --strictで、意図した誤りを拒否することも検証する。"""
from typing import TYPE_CHECKING
from states import Approved, approve
from structural import Segment, read_zone
from type_operators import FieldErrors

if TYPE_CHECKING:
    # strictのwarn_unused_ignoresにより、誤りが通るようになれば検査に失敗する。
    read_zone(Segment("SEG-07"))  # type: ignore[arg-type]
    Approved("EVA-01")  # type: ignore[call-arg]
    approve(Approved("EVA-01", "管制担当"), "管制担当")  # type: ignore[arg-type]
    invalid_errors: FieldErrors = {"worker_name": "不正な項目"}  # type: ignore[typeddict-unknown-key]
