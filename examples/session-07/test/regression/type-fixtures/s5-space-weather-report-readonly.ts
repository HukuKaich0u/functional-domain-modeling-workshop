import { SpaceWeatherReport } from "../../../src/boundary/spaceWeatherReport.js";
import { moonbaseFixture } from "../../../../fixtures/moonbase.js";

const report = SpaceWeatherReport.parse({
  issuedAt: moonbaseFixture.requestedAt,
  alertLevel: "none",
  stations: ["ground-control"],
})._unsafeUnwrap();

// @ts-expect-error 宇宙天気の報告は変更できません。
report.alertLevel = "S1";

// @ts-expect-error 観測局の一覧は変更できません。
report.stations.push("relay");
