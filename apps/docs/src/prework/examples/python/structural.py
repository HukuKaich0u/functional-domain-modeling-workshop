from dataclasses import dataclass

ZoneId = str
SegmentId = str
segment_id: SegmentId = "SEG-07"
mistaken_zone_id: ZoneId = segment_id  # 別名だけでは区別できない。


@dataclass(frozen=True)
class Zone:
    value: str


@dataclass(frozen=True)
class Segment:
    value: str


def read_zone(zone: Zone) -> str:
    return zone.value


# read_zone(Segment("SEG-07")) は静的型検査でエラーになる。
# Pythonの実行時には、注釈だけでこの呼び出しを拒否しない。
