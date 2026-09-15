// @ts-nocheck
import type { Outside } from "../../../src/domain/permit/index.js";
import { egress } from "../../../src/domain/permit/index.js";
import { moonbaseFixture } from "../../../../fixtures/moonbase.js";

declare const outside: Outside;

// @ts-expect-error 作業中の許可を再度出発させられません。
egress(outside, moonbaseFixture.egressAt);
