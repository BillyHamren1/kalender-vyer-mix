/**
 * Kontrakttester för admin-veckomatrisen i Tid & Lön.
 * Statiska grep-tester (ingen React-rendering) — håller default-vyn ärlig.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("StaffTimeWeekMatrix (admin veckomatris)", () => {
  it("StaffTimeWeeklyGpsReportContent renderar StaffTimeWeekMatrix som default", () => {
    const src = read("src/components/staff-time/StaffTimeWeeklyGpsReportContent.tsx");
    expect(src).toMatch(/<StaffTimeWeekMatrix\s*\/?>/);
    expect(src).not.toMatch(/Välj personal i listan ovan/);
  });

  it("Matrisens kolumner är Namn + Mån–Sön + Åtgärd", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrix.tsx");
    expect(src).toMatch(/\["Mån",\s*"Tis",\s*"Ons",\s*"Tor",\s*"Fre",\s*"Lör",\s*"Sön"\]/);
    expect(src).toMatch(/>\s*Namn\s*</);
    expect(src).toMatch(/>\s*Åtgärd\s*</);
  });

  it("Matrisen renderar en rad per person via StaffTimeWeekMatrixRow", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrix.tsx");
    expect(src).toMatch(/matrix\.rows\.map/);
    expect(src).toMatch(/StaffTimeWeekMatrixRow/);
  });

  it("Cellen visar status-labels (GPS / Väntar / Komplettera / Attesterad / –)", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrixCell.tsx");
    for (const label of ["GPS", "Väntar", "Komplettera", "Attesterad"]) {
      expect(src).toContain(`"${label}"`);
    }
  });

  it("Cellen renderar cell.rows som primärt innehåll (samma reportRows som GPS-satelliten)", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrixCell.tsx");
    expect(src).toMatch(/WeekFlowReportRowsMini/);
    expect(src).toMatch(/rows=\{cell\.rows\}/);
  });

  it("Cellen visar normal/övertid och restid som sekundär summering (inte huvudvy)", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrixCell.tsx");
    expect(src).toMatch(/cell\.normalMinutes/);
    expect(src).toMatch(/cell\.overtimeMinutes/);
    expect(src).toMatch(/cell\.travelMinutes/);
    expect(src).toMatch(/\bN /);
    expect(src).toMatch(/Ö /);
    expect(src).toMatch(/Resa /);
  });

  it("WeekFlowReportRowsMini-helpern finns och renderar work/travel-rader", () => {
    const src = read("src/components/staff-time/week-flow/WeekFlowReportRowsMini.tsx");
    expect(src).toMatch(/"work"/);
    expect(src).toMatch(/r\.kind === "travel"/);
    expect(src).toMatch(/Resa \$\{r\.fromLabel/);
  });

  it("Matrisen använder breda dagkolumner (minst 240px) och horisontell scroll", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrix.tsx");
    expect(src).toMatch(/overflow-x-auto/);
    expect(src).toMatch(/repeat\(7,\s*minmax\(240px/);
    expect(src).toMatch(/minmax\(120px,\s*140px\)/);
    expect(src).toMatch(/minmax\(90px,\s*110px\)/);
  });

  it("submitted_waiting_approval ger Godkänn-knapp med antal", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrixRow.tsx");
    expect(src).toMatch(/pendingSubmissionIds/);
    expect(src).toMatch(/Godkänn \{pendingCount\}/);
  });

  it("gps_proposal / tom rad ger Granska-knapp", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrixRow.tsx");
    expect(src).toMatch(/Granska/);
  });

  it("approved → Klar, correction_requested → Väntar komplettering", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrixRow.tsx");
    expect(src).toMatch(/\bKlar\b/);
    expect(src).toMatch(/Väntar komplettering/);
  });

  it("Granska öppnar /staff-management/gps-satellite-map med staffId + date", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrixRow.tsx");
    expect(src).toMatch(/\/staff-management\/gps-satellite-map\?staffId=\$\{encodeURIComponent\(row\.staffId\)\}&date=\$\{encodeURIComponent\(date\)\}/);
  });

  it("Godkänn-knappen anropar update-staff-day-submission-status via useApproveStaffDay", () => {
    const row = read("src/components/staff-time/StaffTimeWeekMatrixRow.tsx");
    expect(row).toMatch(/useApproveStaffDay/);
    const hook = read("src/hooks/staff/useApproveStaffDay.ts");
    expect(hook).toMatch(/update-staff-day-submission-status/);
  });

  it("Matris-hooken anropar get-staff-time-week-matrix (bygger INTE bara från submissions)", () => {
    const src = read("src/hooks/staffTimeFlow/useStaffTimeWeekMatrix.ts");
    expect(src).toMatch(/supabase\.functions\.invoke\(\s*["']get-staff-time-week-matrix["']/);
    // Får inte längre läsa staff_day_submissions direkt i hooken.
    expect(src).not.toMatch(/from\(\s*["']staff_day_submissions["']\s*\)\s*\n?[\s\S]{0,200}\.select/);
  });

  it("Matris-hooken rör INGA legacy tidskällor", () => {
    const src = read("src/hooks/staffTimeFlow/useStaffTimeWeekMatrix.ts");
    const forbidden = ["time_reports", "workdays", "location_time_entries", "travel_time_logs", "day_attestations", "staff_day_report_cache"];
    for (const t of forbidden) {
      const re = new RegExp(`from\\(\\s*["'\`]${t}["'\`]`);
      expect(src).not.toMatch(re);
    }
  });

  it("Edge function get-staff-time-week-matrix går genom resolveStaffDayReportsBatch (INTE canonical GPS-builder)", () => {
    const src = read("supabase/functions/get-staff-time-week-matrix/index.ts");
    expect(src).toMatch(/resolveStaffDayReportsBatch/);
    expect(src).toMatch(/from\(\s*["']staff_members["']/);
    // Får INTE bygga från raw GPS
    expect(src).not.toMatch(/buildCanonicalStaffDayGpsResult/);
    expect(src).not.toMatch(/from\(\s*["']staff_location_history["']/);
    expect(src).not.toMatch(/from\(\s*["']staff_day_submissions["']/);
  });

  it("Edge function rör INGA legacy tidskällor och skriver inte", () => {
    const src = read("supabase/functions/get-staff-time-week-matrix/index.ts");
    const forbidden = ["time_reports", "workdays", "location_time_entries", "travel_time_logs", "day_attestations"];
    for (const t of forbidden) {
      const re = new RegExp(`from\\(\\s*["'\`]${t}["'\`]`);
      expect(src).not.toMatch(re);
    }
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.delete\(/);
  });

  it("Edge function dual-auth (admin JWT eller mobile token = self)", () => {
    const src = read("supabase/functions/get-staff-time-week-matrix/index.ts");
    expect(src).toMatch(/authenticateStaffRequest/);
    expect(src).toMatch(/isAdminJwt/);
    expect(src).toMatch(/isMobileSelf/);
  });

  it("Mobilens veckovy använder useStaffSelfWeekMatrix mot samma endpoint", () => {
    const hook = read("src/hooks/staffTimeFlow/useStaffSelfWeekMatrix.ts");
    expect(hook).toMatch(/get-staff-time-week-matrix/);
    expect(hook).toMatch(/callStaffSnapshotFunction/);
    expect(hook).not.toMatch(/useStaffGpsWeekSummary/);
    expect(hook).not.toMatch(/buildCanonicalStaffDayGpsResult/);
  });

});
