use crate::procedural::{Reason, Request};

#[derive(Clone, Copy)]
pub enum Field {
    EquipmentChecked,
    FlareAlert,
}

pub struct RuleData {
    pub field: Field,
    pub expected: bool,
    pub reason: Reason,
}

pub const RULES: [RuleData; 2] = [
    RuleData {
        field: Field::EquipmentChecked,
        expected: true,
        reason: Reason::EquipmentNotChecked,
    },
    RuleData {
        field: Field::FlareAlert,
        expected: false,
        reason: Reason::FlareAlertActive,
    },
];

pub fn read_field(request: &Request, field: Field) -> bool {
    match field {
        Field::EquipmentChecked => request.equipment_checked,
        Field::FlareAlert => request.flare_alert,
    }
}

pub fn check(request: &Request) -> Vec<Reason> {
    RULES
        .iter()
        .filter(|rule| read_field(request, rule.field) != rule.expected)
        .map(|rule| rule.reason)
        .collect()
}
