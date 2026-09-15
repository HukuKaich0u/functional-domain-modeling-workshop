import { randomUUID } from "node:crypto";

import type { PermitRepository } from "../adaptor/secondary/sqlite/permitRepository.js";
import {
  updateStatus,
  type EvaPermit,
} from "../domain/permit/permit.js";

type Input = Readonly<{
  permitId: string;
  segmentId: string;
  crewDose: readonly number[];
}>;

export const approveEva =
  (repository: PermitRepository) =>
  (input: Input): EvaPermit => {
    const current = repository.find(input.permitId);

    if (current === undefined) {
      throw new Error(`Permit not found: ${input.permitId}`);
    }

    const occurredAt = new Date().toISOString();
    const updated = updateStatus(current, "approved", {
      segmentId: input.segmentId,
      crewDose: input.crewDose,
      approvedAt: occurredAt,
      approvedBy: "base-commander",
    });

    repository.save(updated);
    repository.appendWorkLog({
      eventId: randomUUID(),
      eventName: "eva.approved",
      occurredAt,
      permit: updated,
    });

    return updated;
  };
