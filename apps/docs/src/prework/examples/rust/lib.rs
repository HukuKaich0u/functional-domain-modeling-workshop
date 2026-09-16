//! 事前学習の実行・型検査用クレート。
//!
//! 異なる識別子は取り違えられない。
//! ```compile_fail
//! use prework_examples::structural::{read_zone, Segment};
//! read_zone(&Segment("SEG-07".into()));
//! ```
//! 承認済みには承認者が必要。
//! ```compile_fail
//! use prework_examples::states::Approved;
//! let incomplete = Approved { id: "EVA-01".into() };
//! ```
//! 承認済みを申請中として渡せない。
//! ```compile_fail
//! use prework_examples::states::{approve, Approved};
//! let approved = Approved { id: "EVA-01".into(), approved_by: "管制担当".into() };
//! approve(&approved, "管制担当".into());
//! ```
pub mod boundary;
pub mod functional;
pub mod object_oriented;
pub mod procedural;
pub mod rule_data;
pub mod states;
pub mod structural;
pub mod type_operators;

#[cfg(test)]
mod tests {
    use super::*;
    use boundary::{Input, InvalidMinutes, Minutes};
    use procedural::{Reason, Request};

    #[test]
    fn all_paradigms_share_the_same_contract() {
        let policy = object_oriented::policy();
        let object_check = |request: &Request| policy.check(request);
        type Check<'a> = &'a dyn Fn(&Request) -> Vec<Reason>;
        let checks: [Check<'_>; 4] = [
            &procedural::check,
            &object_check,
            &functional::check,
            &rule_data::check,
        ];
        let cases = [
            (true, false, vec![]),
            (false, false, vec![Reason::EquipmentNotChecked]),
            (true, true, vec![Reason::FlareAlertActive]),
            (
                false,
                true,
                vec![Reason::EquipmentNotChecked, Reason::FlareAlertActive],
            ),
        ];
        for check in checks {
            for (equipment_checked, flare_alert, expected) in &cases {
                let request = Request {
                    equipment_checked: *equipment_checked,
                    flare_alert: *flare_alert,
                };
                assert_eq!(check(&request), *expected);
                assert_eq!(check(&request), *expected);
            }
        }
    }

    #[test]
    fn approval_preserves_draft_and_records_approver() {
        let draft = states::Draft {
            id: "EVA-01".into(),
        };
        let approved = states::approve(&draft, "管制担当".into());
        assert_eq!(draft.id, "EVA-01");
        assert_eq!(approved.id, draft.id);
        assert_eq!(states::label(&states::Permit::Draft(draft)), "申請中");
        assert_eq!(
            states::label(&states::Permit::Approved(approved)),
            "承認者: 管制担当"
        );
    }

    #[test]
    fn rejects_invalid_external_values() {
        let invalid = [
            Input::Number(0.0),
            Input::Number(-1.0),
            Input::Number(f64::NAN),
            Input::Number(f64::INFINITY),
            Input::Number(f64::NEG_INFINITY),
            Input::Text("30".into()),
            Input::Bool(true),
            Input::Bool(false),
            Input::Null,
        ];
        for input in invalid {
            assert_eq!(
                boundary::parse_minutes(input),
                Err(InvalidMinutes::InvalidMinutes)
            );
        }
    }

    #[test]
    fn accepts_valid_minutes_and_describes_results() {
        for value in [30.0, 0.5] {
            assert_eq!(
                boundary::parse_minutes(Input::Number(value)),
                Ok(Minutes { value })
            );
        }
        assert_eq!(
            boundary::describe_minutes(Input::Number(30.0)),
            "30分の予定です"
        );
        assert_eq!(
            boundary::describe_minutes(Input::Text("30".into())),
            "作業時間は正の有限な数で入力してください"
        );
    }

    #[test]
    fn reads_identifiers_and_fields() {
        assert_eq!(
            structural::read_zone(&structural::Zone("ZONE-01".into())),
            "ZONE-01"
        );
        assert!(!type_operators::example());
        assert_eq!(
            type_operators::errors().equipment_checked.as_deref(),
            Some("装備点検を完了してください")
        );
    }
}
