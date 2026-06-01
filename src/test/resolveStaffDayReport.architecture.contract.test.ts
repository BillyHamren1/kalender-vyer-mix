// Architectural guard — vakar att den gemensamma resolvern aldrig läser
// raw GPS eller legacy-tidstabeller.
//
// Resolvern är ENDA platsen som väljer källa (submission > cache > empty)
// för hela systemet. Den får ALDRIG bygga egen dag från staff_location_history
// — det skulle skapa en parallell sanning.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(
  process.cwd(),
  "supabase/functions/_shared/staff-day-report/resolveStaffDayReport.ts",
);

describe("resolveStaffDayReport — architecture contract", () => {
  const src = readFileSync(SRC, "utf-8");

  it("läser ENDAST staff_day_submissions och staff_day_report_cache", () => {
    const fromMatches = [...src.matchAll(/\.from\(["'`]([a-z_]+)["'`]\)/g)].map((m) => m[1]);
    const allowed = new Set(["staff_day_submissions", "staff_day_report_cache"]);
    for (const t of fromMatches) {
      expect(allowed.has(t), `Förbjuden tabell-läsning i resolvern: ${t}`).toBe(true);
    }
  });

  it("nämner INTE staff_location_history", () => {
    expect(src).not.toMatch(/staff_location_history/);
  });

  it("nämner INTE legacy-tidstabeller", () => {
    expect(src).not.toMatch(/\btime_reports\b/);
    expect(src).not.toMatch(/\bworkdays\b/);
    expect(src).not.toMatch(/\blocation_time_entries\b/);
    expect(src).not.toMatch(/\btravel_time_logs\b/);
    expect(src).not.toMatch(/\bday_attestations\b/);
    expect(src).not.toMatch(/\bactive_time_registrations\b/);
  });

  it("exporterar single + batch resolver med tydlig prioritet i kommentaren", () => {
    expect(src).toMatch(/export\s+async\s+function\s+resolveStaffDayReport\b/);
    expect(src).toMatch(/export\s+async\s+function\s+resolveStaffDayReportsBatch\b/);
    expect(src).toMatch(/Submission vinner ALLTID över cache/);
  });
});
