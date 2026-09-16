use crate::procedural::Request;
use crate::rule_data::{read_field, Field};

// Mapped Typesの直訳ではなく、対応する項目を明示する。
#[derive(Default)]
pub struct FieldErrors {
    pub equipment_checked: Option<String>,
    pub flare_alert: Option<String>,
}

pub fn errors() -> FieldErrors {
    FieldErrors {
        equipment_checked: Some("装備点検を完了してください".into()),
        ..FieldErrors::default()
    }
}

pub fn example() -> bool {
    let request = Request {
        equipment_checked: true,
        flare_alert: false,
    };
    read_field(&request, Field::FlareAlert)
}

// FieldとFieldErrorsは項目追加時に手動で同期する。
// 存在しないenumのvariantやstructのフィールドはコンパイルエラー。
