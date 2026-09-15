// @ts-nocheck
import type { Outside } from "../../../src/domain/permit/index.js";
import { close, returnToBase } from "../../../src/domain/permit/index.js";
import { moonbaseFixture } from "../../../../fixtures/moonbase.js";

declare const outside: Outside;

const returned = returnToBase(
  outside,
  { kind: "Planned" },
  moonbaseFixture.returnedAt,
);
close(
  returned,
  { lockoutRemovedAt: moonbaseFixture.lockoutRemovedAt },
  moonbaseFixture.closedAt,
);

// @ts-expect-error 帰還の記録がない作業許可を完了にできません。
close(outside, { lockoutRemovedAt: moonbaseFixture.lockoutRemovedAt }, moonbaseFixture.closedAt);
