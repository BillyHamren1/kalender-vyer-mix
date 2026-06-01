// Architectural guard — get-mobile-staff-day-report MÅSTE gå genom den
// centrala resolvern (`resolveStaffDayReport`) och får inte återinföra
// live-engine-anrop, raw-GPS-läsning eller legacy-tabeller.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(
  process.cwd(),
  "supabase/functions/get-mobile-staff-day-report/index.ts",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("get-mobile-staff-day-report — single-pipeline contract", () => {
  const code = stripComments(readFileSync(SRC, "utf-8"));

  it("läser INTE staff_location_history i kod", () => {
    expect(code).not.toMatch(/staff_location_history/);
  });

  it("anropar INTE get-staff-presence-day (live engine)", () => {
    expect(code).not.toMatch(/get-staff-presence-day/);
  });

  it("läser INTE förbjudna legacy-tabeller för tidrapport", () => {
    expect(code).not.toMatch(/\.from\(["'`]time_reports["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]workdays["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]location_time_entries["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]travel_time_logs["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]day_attestations["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]active_time_registrations["'`]\)/);
  });

  it("går genom den gemensamma resolvern (resolveStaffDayReport)", () => {
    expect(code).toMatch(/resolveStaffDayReport\s*\(/);
    expect(code).toMatch(/_shared\/staff-day-report\/resolveStaffDayReport/);
  });

  it("läser inte staff_day_report_cache eller staff_day_submissions direkt", () => {
    // All DB-access ska gå genom resolvern.
    expect(code).not.toMatch(/\.from\(["'`]staff_day_report_cache["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]staff_day_submissions["'`]\)/);
  });
});
