pub struct Draft {
    pub id: String,
}

pub struct Approved {
    pub id: String,
    pub approved_by: String,
}

pub enum Permit {
    Draft(Draft),
    Approved(Approved),
}

// 状態の形だけを学ぶ例。業務の承認条件は省略する。
// 比較しやすいように借用し、元のDraftを残す。
pub fn approve(draft: &Draft, approved_by: String) -> Approved {
    Approved {
        id: draft.id.clone(),
        approved_by,
    }
}

pub fn label(permit: &Permit) -> String {
    match permit {
        Permit::Draft(_) => "申請中".into(),
        Permit::Approved(approved) => format!("承認者: {}", approved.approved_by),
    }
}
