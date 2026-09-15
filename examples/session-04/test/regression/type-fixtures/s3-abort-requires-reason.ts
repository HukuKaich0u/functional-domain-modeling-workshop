// @ts-nocheck
import type { Requested } from "../../../src/domain/permit/index.js";
import { abort } from "../../../src/domain/permit/index.js";
import { moonbaseFixture } from "../../../../fixtures/moonbase.js";

declare const requested: Requested;

// @ts-expect-error 中止の理由を省略できません。
abort(requested, undefined, moonbaseFixture.abortedAt, "ground-control");
