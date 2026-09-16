type ApprovalInput = {
  equipmentChecked: boolean;
  flareAlert: boolean;
};

// keyof はキーの Union を作る。
type Field = keyof ApprovalInput;
// "equipmentChecked" | "flareAlert"

// Mapped Type は、キーごとのプロパティを組み立てる。
type FieldErrors<T> = {
  readonly [K in keyof T]?: string;
};

export const errors: FieldErrors<ApprovalInput> = {
  equipmentChecked: "装備点検を完了してください",
};

export function readField<T, K extends keyof T>(value: T, key: K): T[K] {
  return value[key];
}

export function typeExamples() {
  // @ts-expect-error: 存在しないキーは指定できない。
  const field: Field = "workerName";
  return field;
}
