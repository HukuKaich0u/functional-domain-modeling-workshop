// @ts-nocheck
import type { ApproveInput, Closed } from "../../../src/domain/permit/index.js";
import { approve } from "../../../src/domain/permit/index.js";
import { moonbaseFixture } from "../../../../fixtures/moonbase.js";

declare const closed: Closed;
declare const input: ApproveInput;

// @ts-expect-error 完了した作業許可を承認できません。
approve(closed, input, moonbaseFixture.approvedAt);
