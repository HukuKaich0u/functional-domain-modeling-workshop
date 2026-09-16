#[derive(Debug, PartialEq)]
pub struct Request {
    pub equipment_checked: bool,
    pub flare_alert: bool,
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Reason {
    EquipmentNotChecked,
    FlareAlertActive,
}

pub fn check(request: &Request) -> Vec<Reason> {
    let mut reasons = Vec::new();
    if !request.equipment_checked {
        reasons.push(Reason::EquipmentNotChecked);
    }
    if request.flare_alert {
        reasons.push(Reason::FlareAlertActive);
    }
    reasons
}
