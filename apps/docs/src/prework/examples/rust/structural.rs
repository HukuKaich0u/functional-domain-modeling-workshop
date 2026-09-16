pub type ZoneId = String;
pub type SegmentId = String;

pub fn mistaken_zone_id(segment: SegmentId) -> ZoneId {
    segment // 別名だけでは区別できない。
}

// 同じフィールドを持っていても別のstructは別の型。
pub struct Zone(pub String);
pub struct Segment(pub String);

pub fn read_zone(zone: &Zone) -> &str {
    &zone.0
}

// read_zone(&Segment("SEG-07".into())) はコンパイルエラー。
