/**
 * Kontrakttester för enhetligt WeekFlow-flöde (admin Tid & Lön ↔ /m/report).
 * Statiska grep-tester — körs i Vitest utan att rendera React.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("WeekFlow unified flow contract", () => {
  it("MobileTimeV2Page renders WeekFlowMobilePanel as default (legacy queue behind flag)", () => {
    const src = read("src/features/mobile-time-v2/MobileTimeV2Page.tsx");
    expect(src).toMatch(/WeekFlowMobilePanel/);
    // Legacy får finnas men endast bakom env-flag
    expect(src).toMatch(/VITE_LEGACY_TIME_QUEUE/);
    // Default-renderingen får inte vara MobileTimeReportQueue direkt
    expect(src).toMatch(/return\s*\(\s*<div[\s\S]*<WeekFlowMobilePanel/);
  });

  it("WeekFlowMobilePanel använder samma useStaffTimeWeekFlow + WeekFlowDayCard som admin", () => {
    const src = read("src/components/mobile-app/time/WeekFlowMobilePanel.tsx");
    expect(src).toMatch(/useStaffTimeWeekFlow/);
    expect(src).toMatch(/WeekFlowDayCard/);
  });

  it("WeekFlowMobilePanel navigerar INTE till /m/day-review", () => {
    const src = read("src/components/mobile-app/time/WeekFlowMobilePanel.tsx");
    expect(src).not.toMatch(/\/m\/day-review/);
  });

  it("WeekFlowMobilePanel öppnar dag i DayReviewSheet (samma V2-api som queue)", () => {
    const src = read("src/components/mobile-app/time/WeekFlowMobilePanel.tsx");
    expect(src).toMatch(/DayReviewSheet/);
    const sheet = read("src/features/mobile-time-v2/DayReviewSheet.tsx");
    expect(sheet).toMatch(/getMobileGpsDayView/);
    expect(sheet).toMatch(/submitMobileGpsDayV2/);
  });

  it("Admin 'Öppna GPS' länkar till /staff-management/gps-satellite-map", () => {
    const src = read("src/components/staff-time/StaffTimeWeeklyGpsReportContent.tsx");
    expect(src).toMatch(/\/staff-management\/gps-satellite-map\?staffId=/);
    expect(src).not.toMatch(/\/staff-management\/time\?staff=/);
  });

  it("WeekFlowDayCard använder formatStockholmHm för radtider (inte slice 11,16)", () => {
    const src = read("src/components/staff-time/week-flow/WeekFlowDayCard.tsx");
    expect(src).toMatch(/formatStockholmHm\(r\.startIso\)/);
    expect(src).toMatch(/formatStockholmHm\(r\.endIso\)/);
    expect(src).not.toMatch(/r\.startIso\.slice\(11/);
    expect(src).not.toMatch(/r\.endIso\.slice\(11/);
  });

  it("WeekFlowHeader visar mån–sön (addDays 6), inte mån–mån (addWeeks 1)", () => {
    const src = read("src/components/staff-time/week-flow/WeekFlowHeader.tsx");
    expect(src).toMatch(/addDays\(weekStart,\s*6\)/);
    expect(src).not.toMatch(/addWeeks\(weekStart,\s*1\),\s*"d MMM"/);
  });

  it("update-staff-day-submission-status rör ALDRIG legacy tidskällor", () => {
    const src = read("supabase/functions/update-staff-day-submission-status/index.ts");
    const forbidden = [
      "time_reports",
      "workdays",
      "location_time_entries",
      "travel_time_logs",
      "day_attestations",
    ];
    for (const t of forbidden) {
      // Tillåt kommentar-omnämnanden ("Vi rör ALDRIG..."), men inte from('X')/.from("X")
      const re = new RegExp(`from\\(\\s*['"\`]${t}['"\`]`);
      expect(src).not.toMatch(re);
    }
  });
});

describe("WeekFlow status mapping", () => {
  it("mappar DB-status korrekt → WeekFlow-status", async () => {
    const { mapDbStatusToFlow } = await import("@/lib/staffTimeFlow/weekFlow");
    for (const s of ["submitted", "edited", "needs_control", "needs_user_attention", "ai_flagged"]) {
      expect(mapDbStatusToFlow(s)).toBe("submitted_waiting_approval");
    }
    expect(mapDbStatusToFlow("approved")).toBe("approved");
    expect(mapDbStatusToFlow("payroll_approved")).toBe("approved");
    expect(mapDbStatusToFlow("correction_requested")).toBe("correction_requested");
  });
});
