// Architectural guard — vakar att get-staff-time-week-matrix INTE bygger
// egen dag från raw GPS, utan går via den gemensamma resolvern.
//
// Reglerna kommer från användarens "En solid dataväg":
//   - Time Engine är ensam ägare av staff_location_history.
//   - Submission > cache > empty är ENBART resolverns ansvar.
//   - Tid & Lön + Attest måste visa samma dag → måste gå genom samma resolver.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(
  process.cwd(),
  "supabase/functions/get-staff-time-week-matrix/index.ts",
);

function stripComments(src: string): string {
  // Ta bort /* ... */ och // ... så vi bara matchar mot riktig kod.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("get-staff-time-week-matrix — single-pipeline contract", () => {
  const code = stripComments(readFileSync(SRC, "utf-8"));

  it("läser INTE staff_location_history i kod", () => {
    expect(code).not.toMatch(/staff_location_history/);
  });

  it("importerar/anropar INTE buildCanonicalStaffDayGpsResult i kod", () => {
    expect(code).not.toMatch(/buildCanonicalStaffDayGpsResult/);
  });

  it("läser INTE förbjudna legacy-tabeller för tidrapport", () => {
    expect(code).not.toMatch(/\.from\(["'`]time_reports["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]workdays["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]location_time_entries["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]travel_time_logs["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]day_attestations["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]active_time_registrations["'`]\)/);
  });

  it("går genom den gemensamma resolvern (resolveStaffDayReportsBatch)", () => {
    expect(code).toMatch(/resolveStaffDayReportsBatch/);
    expect(code).toMatch(/_shared\/staff-day-report\/resolveStaffDayReport/);
  });
});
