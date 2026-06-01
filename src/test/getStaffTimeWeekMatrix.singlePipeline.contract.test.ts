// Architectural guard — vakar att get-staff-time-week-matrix INTE bygger
// egen dag från raw GPS, utan går via den gemensamma resolvern.
//
// Reglerna kommer från användarens "En solid dataväg":
//   - Time Engine är ensam ägare av staff_location_history.
//   - Submission > cache > empty är ENBART resolverns ansvar.
//   - Tid & Lön + Attest måste visa samma dag → måste gå genom samma resolver.
//
// Filen får aldrig regression:a tillbaka till canonical GPS-build i adminvy.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(
  process.cwd(),
  "supabase/functions/get-staff-time-week-matrix/index.ts",
);

describe("get-staff-time-week-matrix — single-pipeline contract", () => {
  const src = readFileSync(SRC, "utf-8");

  it("läser INTE staff_location_history", () => {
    expect(src).not.toMatch(/staff_location_history/);
  });

  it("importerar INTE buildCanonicalStaffDayGpsResult", () => {
    expect(src).not.toMatch(/buildCanonicalStaffDayGpsResult/);
  });

  it("läser INTE förbjudna legacy-tabeller för tidrapport", () => {
    expect(src).not.toMatch(/\bfrom\(['"`]time_reports['"`]\)/);
    expect(src).not.toMatch(/\bfrom\(['"`]workdays['"`]\)/);
    expect(src).not.toMatch(/\bfrom\(['"`]location_time_entries['"`]\)/);
    expect(src).not.toMatch(/\bfrom\(['"`]travel_time_logs['"`]\)/);
    expect(src).not.toMatch(/\bfrom\(['"`]day_attestations['"`]\)/);
    expect(src).not.toMatch(/\bfrom\(['"`]active_time_registrations['"`]\)/);
  });

  it("går genom den gemensamma resolvern (resolveStaffDayReportsBatch)", () => {
    expect(src).toMatch(/resolveStaffDayReportsBatch/);
    expect(src).toMatch(/_shared\/staff-day-report\/resolveStaffDayReport/);
  });
});
