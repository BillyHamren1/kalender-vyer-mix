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

describe("WeekFlow mobile auth contract", () => {
  it("WeekFlowMobilePanel använder useMobileAuth + effectiveStaffId (INTE useCurrentStaffId)", () => {
    const src = read("src/components/mobile-app/time/WeekFlowMobilePanel.tsx");
    expect(src).toMatch(/useMobileAuth/);
    expect(src).toMatch(/effectiveStaffId/);
    expect(src).not.toMatch(/useCurrentStaffId/);
  });

  it("useStaffTimeWeekFlow har separat staff-path som inte kräver organizationId", () => {
    const src = read("src/hooks/staffTimeFlow/useStaffTimeWeekFlow.ts");
    // Måste branchas på viewer
    expect(src).toMatch(/viewer === "staff"/);
    // Staff-path går via dual-auth edge function
    expect(src).toMatch(/callStaffSnapshotFunction/);
    expect(src).toMatch(/get-staff-time-flow-submissions/);
    // Realtime får inte aktiveras för staff-viewer
    expect(src).toMatch(/if \(viewer !== "admin"\) return/);
  });

  it("staffSnapshotApi exponerar get-staff-time-flow-submissions", () => {
    const src = read("src/services/staffSnapshotApi.ts");
    expect(src).toMatch(/'get-staff-time-flow-submissions'/);
  });

  it("get-staff-time-flow-submissions edge function finns och använder dual-auth", () => {
    const src = read("supabase/functions/get-staff-time-flow-submissions/index.ts");
    expect(src).toMatch(/authenticateStaffRequest/);
    expect(src).toMatch(/authorizeStaffAccess/);
    expect(src).toMatch(/from\(\s*['"]staff_day_submissions['"]/);
  });

  it("get-staff-time-flow-submissions rör INGA legacy tidskällor och skriver inte", () => {
    const src = read("supabase/functions/get-staff-time-flow-submissions/index.ts");
    const forbiddenTables = [
      "time_reports",
      "workdays",
      "location_time_entries",
      "travel_time_logs",
      "day_attestations",
      "staff_day_report_cache",
    ];
    for (const t of forbiddenTables) {
      const re = new RegExp(`from\\(\\s*['"\`]${t}['"\`]`);
      expect(src).not.toMatch(re);
    }
    // Inga skrivningar
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.delete\(/);
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

describe("StaffTimeAndPayrollPage rent flöde (inga legacy-vyer)", () => {
  const src = read("src/pages/StaffTimeAndPayrollPage.tsx");

  it("renderar StaffTimeWeeklyGpsReportContent", () => {
    expect(src).toMatch(/<StaffTimeWeeklyGpsReportContent\s*\/>/);
  });

  it("importerar/renderar INTE StaffTimeApprovalsPageContent", () => {
    expect(src).not.toMatch(/StaffTimeApprovalsPageContent/);
  });

  it("importerar/renderar INTE StaffTimeReportsContent", () => {
    expect(src).not.toMatch(/StaffTimeReportsContent/);
  });

  it("importerar/renderar INTE PayrollMonthReportPageContent", () => {
    expect(src).not.toMatch(/PayrollMonthReportPageContent/);
  });

  it("importerar/renderar INTE StaffPayrollPeriodsContent", () => {
    expect(src).not.toMatch(/StaffPayrollPeriodsContent/);
  });

  it("har ingen Tabs-huvudstruktur", () => {
    expect(src).not.toMatch(/from\s+["']@\/components\/ui\/tabs["']/);
  });
});

describe("WeekFlow normal/övertid kontrakt", () => {
  it("WeekFlowDay-typ innehåller normalMinutes och overtimeMinutes", () => {
    const src = read("src/lib/staffTimeFlow/types.ts");
    expect(src).toMatch(/normalMinutes:\s*number/);
    expect(src).toMatch(/overtimeMinutes:\s*number/);
  });

  it("weekFlow.ts använder calculateWorkTimeBuckets för båda källor (snapshot + gps)", () => {
    const src = read("src/lib/staffTimeFlow/weekFlow.ts");
    expect(src).toMatch(/calculateWorkTimeBuckets/);
    // Båda grenarna (submission + gps_proposal) ska sätta normalMinutes/overtimeMinutes
    const occurrences = (src.match(/normalMinutes:\s*buckets\.normalMinutes/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("WeekFlowDayCard visar 'N' (normal) och 'Ö' (övertid) — admin OCH app delar denna komponent", () => {
    const src = read("src/components/staff-time/week-flow/WeekFlowDayCard.tsx");
    expect(src).toMatch(/day\.normalMinutes/);
    expect(src).toMatch(/day\.overtimeMinutes/);
    expect(src).toMatch(/\bN\s/);
    expect(src).toMatch(/Ö\s/);
  });

  it("submit-mobile-gps-day-v2 sparar normalMinutes/overtimeMinutes i source_summary_json", () => {
    const src = read("supabase/functions/submit-mobile-gps-day-v2/index.ts");
    expect(src).toMatch(/normalMinutes:\s*workTimeBuckets\.normalMinutes/);
    expect(src).toMatch(/overtimeMinutes:\s*workTimeBuckets\.overtimeMinutes/);
  });

  it("normal/övertid räknas INTE från legacy-tabeller (time_reports/workdays/LTE/travel_time_logs)", () => {
    const src = read("src/lib/staffTimeFlow/workTimeBuckets.ts");
    expect(src).not.toMatch(/time_reports/);
    expect(src).not.toMatch(/workdays/);
    expect(src).not.toMatch(/location_time_entries/);
    expect(src).not.toMatch(/travel_time_logs/);
  });
});
