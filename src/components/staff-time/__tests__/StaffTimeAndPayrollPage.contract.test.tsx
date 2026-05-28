// Page contract test: säkerställer att Tid & Lön huvudvy är den nya
// WeekFlow-vyn (inte gamla StaffTimeApprovalsPageContent som default).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PAGE = path.resolve(__dirname, "..", "..", "..", "pages", "StaffTimeAndPayrollPage.tsx");

describe("StaffTimeAndPayrollPage default view", () => {
  const src = fs.readFileSync(PAGE, "utf8");

  it("importerar och renderar StaffTimeWeeklyGpsReportContent som huvudvy", () => {
    expect(src).toMatch(/import\s+StaffTimeWeeklyGpsReportContent\s+from/);
    // Måste renderas utanför AdvancedLegacySection (alltså i toppen, inte i en defaultValue-Tabs)
    const advancedStart = src.indexOf("AdvancedLegacySection");
    const mainRender = src.indexOf("<StaffTimeWeeklyGpsReportContent />");
    expect(mainRender).toBeGreaterThan(-1);
    // Renderpunkten ska komma FÖRE Advanced (= som main view).
    const advancedRender = src.indexOf("<AdvancedLegacySection");
    expect(mainRender).toBeLessThan(advancedRender);
  });

  it("StaffTimeApprovalsPageContent ligger ENDAST i AdvancedLegacySection", () => {
    const approvalsUsages = (src.match(/<StaffTimeApprovalsPageContent/g) ?? []).length;
    expect(approvalsUsages).toBe(1);
    // Och måste ligga inne i Advanced-blocket.
    const advancedFnStart = src.indexOf("const AdvancedLegacySection");
    const approvalIdx = src.indexOf("<StaffTimeApprovalsPageContent");
    expect(approvalIdx).toBeGreaterThan(advancedFnStart);
  });

  it("default-tab är INTE 'approvals'", () => {
    expect(src).not.toMatch(/tab.*\?\?\s*["']approvals["']/);
    expect(src).not.toMatch(/\?\s*["']approvals["']\s*:/);
  });
});
