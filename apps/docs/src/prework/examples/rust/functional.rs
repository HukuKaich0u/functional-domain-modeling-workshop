use crate::procedural::{Reason, Request};

pub type Rule = fn(&Request) -> Vec<Reason>;

fn equipment_rule(request: &Request) -> Vec<Reason> {
    if request.equipment_checked {
        vec![]
    } else {
        vec![Reason::EquipmentNotChecked]
    }
}

fn flare_rule(request: &Request) -> Vec<Reason> {
    if request.flare_alert {
        vec![Reason::FlareAlertActive]
    } else {
        vec![]
    }
}

pub fn combine(rules: Vec<Rule>) -> impl Fn(&Request) -> Vec<Reason> {
    move |request| rules.iter().flat_map(|rule| rule(request)).collect()
}

pub fn check(request: &Request) -> Vec<Reason> {
    combine(vec![equipment_rule, flare_rule])(request)
}
