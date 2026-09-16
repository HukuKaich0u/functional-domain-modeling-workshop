// 外部入力のうち、この例で扱う形をenumで表す。JSONパーサーではない。
pub enum Input {
    Number(f64),
    Text(String),
    Bool(bool),
    Null,
}

#[derive(Debug, PartialEq)]
pub struct Minutes {
    pub value: f64,
}

#[derive(Debug, PartialEq)]
pub enum InvalidMinutes {
    InvalidMinutes,
}

pub fn parse_minutes(input: Input) -> Result<Minutes, InvalidMinutes> {
    match input {
        Input::Number(value) if value.is_finite() && value > 0.0 => Ok(Minutes { value }),
        _ => Err(InvalidMinutes::InvalidMinutes),
    }
}

pub fn describe_minutes(input: Input) -> String {
    match parse_minutes(input) {
        Ok(minutes) => format!("{}分の予定です", minutes.value),
        Err(_) => "作業時間は正の有限な数で入力してください".into(),
    }
}
