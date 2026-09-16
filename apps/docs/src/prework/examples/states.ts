type Draft = Readonly<{ status: "Draft"; id: string }>;
type Approved = Readonly<{
  status: "Approved";
  id: string;
  approvedBy: string;
}>;
export type Permit = Draft | Approved;

// ここでは状態の形だけを学ぶ。業務の承認条件は省略。
export function approve(draft: Draft, approvedBy: string): Approved {
  return { status: "Approved", id: draft.id, approvedBy };
}

export function label(permit: Permit): string {
  switch (permit.status) {
    case "Draft": return "申請中";
    case "Approved": return `承認者: ${permit.approvedBy}`;
    default: {
      const unreachable: never = permit;
      return unreachable;
    }
  }
}

export function typeExamples() {
  // @ts-expect-error: 承認済みには approvedBy が必要。
  const incomplete: Permit = { status: "Approved", id: "EVA-01" };
  const approved = approve({ status: "Draft", id: "EVA-01" }, "管制担当");
  // @ts-expect-error: Approved を Draft として再承認できない。
  approve(approved, "管制担当");
  return incomplete;
}
