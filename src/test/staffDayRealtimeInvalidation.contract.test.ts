/**
 * Contract: alla realtime-prenumerationer för single-pipeline-dagrapporten
 * får ENDAST lyssna på `staff_day_report_cache` och `staff_day_submissions`.
 *
 * Förbud:
 *   - time_reports
 *   - workdays
 *   - location_time_entries
 *   - travel_time_logs
 *   - staff_location_history
 *   - day_attestations
 *   - active_time_registrations
 *
 * Alla rapport-hooks som tidigare öppnade egna kanaler ska gå via
 * useStaffDayRealtimeInvalidation. useMobileStaffDayReport är undantag
 * tills vidare (custom state, ej react-query), men den listar redan
 * exakt samma två tabeller.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
function read(p: string): string { return readFileSync(resolve(ROOT, p), "utf8"); }

const FORBIDDEN_TABLES = [
  "time_reports",
  "workdays",
  "location_time_entries",
  "travel_time_logs",
  "staff_location_history",
  "day_attestations",
  "active_time_registrations",
];

const HOOK_FILES = [
  "src/hooks/staff/useStaffDayRealtimeInvalidation.ts",
  "src/hooks/staffTimeFlow/useStaffTimeWeekMatrix.ts",
  "src/hooks/staffTimeFlow/useStaffTimeWeekFlow.ts",
  "src/hooks/useMobileStaffDayReport.ts",
];

describe("Staff day realtime invalidation — single pipeline", () => {
  it("shared hook listens on cache + submissions only", () => {
    const src = read("src/hooks/staff/useStaffDayRealtimeInvalidation.ts");
    expect(src).toContain("staff_day_report_cache");
    expect(src).toContain("staff_day_submissions");
    for (const t of FORBIDDEN_TABLES) {
      expect(src.includes(t)).toBe(false);
    }
  });

  for (const file of HOOK_FILES) {
    it(`${file} does not subscribe to legacy tables`, () => {
      const src = read(file);
      // Look at postgres_changes config strings only (allow comments/type names).
      const channelMatches = src.match(/table:\s*['"`]([a-z_]+)['"`]/g) ?? [];
      const tables = channelMatches.map((m) => m.match(/['"`]([a-z_]+)['"`]/)![1]);
      for (const t of tables) {
        expect(FORBIDDEN_TABLES, `${file} subscribes to forbidden table ${t}`).not.toContain(t);
      }
    });
  }

  it("matrix + flow hooks use the shared invalidation hook (no inline supabase.channel for these tables)", () => {
    const matrix = read("src/hooks/staffTimeFlow/useStaffTimeWeekMatrix.ts");
    const flow = read("src/hooks/staffTimeFlow/useStaffTimeWeekFlow.ts");
    expect(matrix).toContain("useStaffDayRealtimeInvalidation");
    expect(flow).toContain("useStaffDayRealtimeInvalidation");
    // Inga egna supabase.channel-anrop kvar i dessa två hooks.
    expect(matrix.includes("supabase.channel(")).toBe(false);
    expect(flow.includes("supabase.channel(")).toBe(false);
  });
});
