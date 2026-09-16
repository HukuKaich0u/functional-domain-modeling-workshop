from dataclasses import dataclass
from math import isfinite
from typing import Generic, Literal, TypeVar

T = TypeVar("T")
E = TypeVar("E")


@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T


@dataclass(frozen=True)
class Err(Generic[E]):
    error: E


Result = Ok[T] | Err[E]


@dataclass(frozen=True)
class Minutes:
    value: float


InvalidMinutes = Literal["InvalidMinutes"]


def parse_minutes(value: object) -> Result[Minutes, InvalidMinutes]:
    # boolはintのサブクラスだが、作業時間としては受け入れない。
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return Err("InvalidMinutes")
    try:
        number = float(value)
    except OverflowError:
        return Err("InvalidMinutes")
    if not isfinite(number) or number <= 0:
        return Err("InvalidMinutes")
    return Ok(Minutes(number))


def describe_minutes(value: object) -> str:
    result = parse_minutes(value)
    if isinstance(result, Err):
        return "作業時間は正の有限な数で入力してください"
    return f"{result.value.value:g}分の予定です"
