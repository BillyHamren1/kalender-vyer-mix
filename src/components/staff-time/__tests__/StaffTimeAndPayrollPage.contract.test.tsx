// Page contract test: Tid & Lön huvudvy ska vara ett enda enkelt flöde
// (StaffTimeWeeklyGpsReportContent). Inga legacy-tabbar, ingen Advanced-meny.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PAGE = path.resolve(__dirname, "..", "..", "..", "pages", "StaffTimeAndPayrollPage.tsx");

describe("StaffTimeAndPayrollPage default view", () => {
  const src = fs.readFileSync(PAGE, "utf8");

  it("importerar och renderar StaffTimeWeeklyGpsReportContent som huvudvy", () => {
    expect(src).toMatch(/import\s+StaffTimeWeeklyGpsReportContent\s+from/);
    expect(src).toMatch(/<StaffTimeWeeklyGpsReportContent\s*\/>/);
  });

  it("renderar INTE legacy-vyer i huvudsidan", () => {
    expect(src).not.toMatch(/StaffTimeApprovalsPageContent/);
    expect(src).not.toMatch(/PayrollMonthReportPageContent/);
    expect(src).not.toMatch(/StaffTimeReportsContent/);
    expect(src).not.toMatch(/StaffPayrollPeriodsContent/);
    expect(src).not.toMatch(/TimePayrollOverview/);
    expect(src).not.toMatch(/AdvancedLegacySection/);
    expect(src).not.toMatch(/PayrollSubTabs/);
  });

  it("har ingen Tabs-huvudstruktur och ingen Avancerat-toggle", () => {
    expect(src).not.toMatch(/from\s+["']@\/components\/ui\/tabs["']/);
    expect(src).not.toMatch(/advancedOpen/);
    expect(src).not.toMatch(/Avancerat/);
  });
});
