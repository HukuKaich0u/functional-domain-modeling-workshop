use crate::procedural::{Reason, Request};

pub trait Rule {
    fn check(&self, request: &Request) -> Vec<Reason>;
}

pub struct EquipmentRule;
impl Rule for EquipmentRule {
    fn check(&self, request: &Request) -> Vec<Reason> {
        if request.equipment_checked {
            vec![]
        } else {
            vec![Reason::EquipmentNotChecked]
        }
    }
}

pub struct FlareRule;
impl Rule for FlareRule {
    fn check(&self, request: &Request) -> Vec<Reason> {
        if request.flare_alert {
            vec![Reason::FlareAlertActive]
        } else {
            vec![]
        }
    }
}

pub struct ApprovalPolicy {
    pub rules: Vec<Box<dyn Rule>>,
}

impl ApprovalPolicy {
    pub fn check(&self, request: &Request) -> Vec<Reason> {
        self.rules
            .iter()
            .flat_map(|rule| rule.check(request))
            .collect()
    }
}

pub fn policy() -> ApprovalPolicy {
    ApprovalPolicy {
        rules: vec![Box::new(EquipmentRule), Box::new(FlareRule)],
    }
}
