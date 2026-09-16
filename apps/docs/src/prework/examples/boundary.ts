export type Result<T, E> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>;

type Minutes = Readonly<{ kind: "Minutes"; value: number }>;
type InvalidMinutes = "InvalidMinutes";

export function parseMinutes(input: unknown): Result<Minutes, InvalidMinutes> {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    return { ok: false, error: "InvalidMinutes" };
  }
  return { ok: true, value: { kind: "Minutes", value: input } };
}

export function describeMinutes(input: unknown): string {
  const result = parseMinutes(input);
  if (!result.ok) return "作業時間は正の有限な数で入力してください";
  return `${result.value.value}分の予定です`;
}

// describeMinutes(30)   => "30分の予定です"
// describeMinutes("30") => "作業時間は正の有限な数で入力してください"
