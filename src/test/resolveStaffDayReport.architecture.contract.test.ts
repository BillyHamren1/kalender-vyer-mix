// Architectural guard — vakar att den gemensamma resolvern aldrig läser
// raw GPS eller legacy-tidstabeller i KOD (kommentarer ignoreras).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(
  process.cwd(),
  "supabase/functions/_shared/staff-day-report/resolveStaffDayReport.ts",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("resolveStaffDayReport — architecture contract", () => {
  const raw = readFileSync(SRC, "utf-8");
  const code = stripComments(raw);

  it("läser ENDAST staff_day_submissions och staff_day_report_cache", () => {
    const fromMatches = [...code.matchAll(/\.from\(["'`]([a-z_]+)["'`]\)/g)].map((m) => m[1]);
    const allowed = new Set(["staff_day_submissions", "staff_day_report_cache"]);
    for (const t of fromMatches) {
      expect(allowed.has(t), `Förbjuden tabell-läsning i resolvern: ${t}`).toBe(true);
    }
  });

  it("rör INTE staff_location_history i kod", () => {
    expect(code).not.toMatch(/staff_location_history/);
  });

  it("läser INTE legacy-tidstabeller", () => {
    expect(code).not.toMatch(/\.from\(["'`]time_reports["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]workdays["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]location_time_entries["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]travel_time_logs["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]day_attestations["'`]\)/);
    expect(code).not.toMatch(/\.from\(["'`]active_time_registrations["'`]\)/);
  });

  it("exporterar single + batch resolver med tydlig prioritet i docstring", () => {
    expect(code).toMatch(/export\s+async\s+function\s+resolveStaffDayReport\b/);
    expect(code).toMatch(/export\s+async\s+function\s+resolveStaffDayReportsBatch\b/);
    expect(raw).toMatch(/Submission vinner ALLTID över cache/);
  });
});
