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
    // Får inte ha tomläges-texten kvar
    expect(src).not.toMatch(/Välj personal i listan ovan/);
  });

  it("Matrisens kolumner är Namn + Mån–Sön + Åtgärd", () => {
    const src = read("src/components/staff-time/StaffTimeWeekMatrix.tsx");
    expect(src).toMatch(/\["Mån",\s*"Tis",\s*"Ons",\s*"Tor",\s*"Fre",\s*"Lör",\s*"Sön"\]/);
    expect(src).toMatch(/>Namn</);
    expect(src).toMatch(/>Åtgärd</);
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
    expect(src).toMatch(/>Klar</);
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

  it("Matris-hooken använder mapDbStatusToFlow (delad statusmappning, inte egen)", () => {
    const src = read("src/hooks/staffTimeFlow/useStaffTimeWeekMatrix.ts");
    expect(src).toMatch(/import\s+\{[^}]*mapDbStatusToFlow[^}]*\}\s+from\s+["']@\/lib\/staffTimeFlow\/weekFlow["']/);
    // Får inte mappa status själv
    expect(src).not.toMatch(/status ===\s*["']approved["']\s*\?/);
  });

  it("Matris-hooken rör INGA legacy tidskällor", () => {
    const src = read("src/hooks/staffTimeFlow/useStaffTimeWeekMatrix.ts");
    const forbidden = ["time_reports", "workdays", "location_time_entries", "travel_time_logs", "day_attestations", "staff_day_report_cache"];
    for (const t of forbidden) {
      const re = new RegExp(`from\\(\\s*["'\`]${t}["'\`]`);
      expect(src).not.toMatch(re);
    }
  });

  it("Matris-hooken läser staff_members + staff_day_submissions för veckan", () => {
    const src = read("src/hooks/staffTimeFlow/useStaffTimeWeekMatrix.ts");
    expect(src).toMatch(/from\(\s*"staff_members"/);
    expect(src).toMatch(/from\(\s*"staff_day_submissions"/);
    expect(src).toMatch(/\.gte\("date"/);
    expect(src).toMatch(/\.lte\("date"/);
  });

  it("Dag-detalj-sheeten återanvänder WeekFlowDayCard (samma som /m/report)", () => {
    const src = read("src/components/staff-time/StaffTimeMatrixDayDetailSheet.tsx");
    expect(src).toMatch(/WeekFlowDayCard/);
    expect(src).toMatch(/useStaffTimeWeekFlow/);
    expect(src).toMatch(/viewer:\s*"admin"/);
  });

  it("App-vägen (WeekFlowMobilePanel) använder fortfarande samma WeekFlow", () => {
    const src = read("src/components/mobile-app/time/WeekFlowMobilePanel.tsx");
    expect(src).toMatch(/useStaffTimeWeekFlow/);
    expect(src).toMatch(/WeekFlowDayCard/);
  });
});
