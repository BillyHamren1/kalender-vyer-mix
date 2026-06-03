/**
 * Tests för CSV-export och weeks-stats i lönerapporten.
 */
import { describe, it, expect } from "vitest";
import {
  buildPayrollCsv,
  countWeekStats,
  rowWeekStatus,
} from "@/lib/staff-payroll/payrollCsvExport";
import type {
  StaffTimeMatrix,
  StaffTimeMatrixRow,
  StaffTimeMatrixCell,
} from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";

function emptyCell(date: string): StaffTimeMatrixCell {
  return {
    date,
    status: "empty",
    source: "empty",
    startTime: null,
    endTime: null,
    workMinutes: 0,
    travelMinutes: 0,
    totalMinutes: 0,
    normalMinutes: 0,
    overtimeMinutes: 0,
    submissionId: null,
    reviewComment: null,
    pingCount: 0,
    gpsAvailable: false,
    rows: [],
  };
}

function buildRow(): StaffTimeMatrixRow {
  const dayMon: StaffTimeMatrixCell = {
    date: "2026-06-01",
    status: "approved",
    source: "submission_snapshot",
    startTime: "07:00",
    endTime: "16:00",
    workMinutes: 510,
    travelMinutes: 30,
    totalMinutes: 540,
    normalMinutes: 480,
    overtimeMinutes: 30,
    submissionId: "sub-1",
    reviewComment: null,
    pingCount: 100,
    gpsAvailable: true,
    rows: [
      {
        kind: "work",
        label: "Projekt Globen",
        startIso: "2026-06-01T07:00:00+02:00",
        endIso: "2026-06-01T12:00:00+02:00",
        minutes: 300,
        fromLabel: null,
        toLabel: null,
      },
      {
        kind: "travel",
        label: "Resa",
        startIso: "2026-06-01T12:00:00+02:00",
        endIso: "2026-06-01T12:30:00+02:00",
        minutes: 30,
        fromLabel: "Globen",
        toLabel: "Solna Arena",
      },
      {
        kind: "work",
        label: "Projekt Solna Arena",
        startIso: "2026-06-01T12:30:00+02:00",
        endIso: "2026-06-01T16:00:00+02:00",
        minutes: 210,
        fromLabel: null,
        toLabel: null,
      },
    ],
  };
  const dayTue: StaffTimeMatrixCell = {
    date: "2026-06-02",
    status: "submitted_waiting_approval",
    source: "submission_snapshot",
    startTime: "07:00",
    endTime: "16:00",
    workMinutes: 540,
    travelMinutes: 0,
    totalMinutes: 540,
    normalMinutes: 480,
    overtimeMinutes: 60,
    submissionId: "sub-2",
    reviewComment: null,
    pingCount: 80,
    gpsAvailable: true,
    rows: [
      {
        kind: "work",
        label: "Projekt Solna Arena",
        startIso: "2026-06-02T07:00:00+02:00",
        endIso: "2026-06-02T16:00:00+02:00",
        minutes: 540,
        fromLabel: null,
        toLabel: null,
      },
    ],
  };
  return {
    staffId: "staff-1",
    staffName: "Anna Andersson",
    pendingSubmissionIds: ["sub-2"],
    days: [
      dayMon,
      dayTue,
      emptyCell("2026-06-03"),
      emptyCell("2026-06-04"),
      emptyCell("2026-06-05"),
      emptyCell("2026-06-06"),
      emptyCell("2026-06-07"),
    ],
  };
}

describe("payrollCsvExport", () => {
  const row = buildRow();
  const matrix: StaffTimeMatrix = {
    weekStart: "2026-06-01",
    weekEnd: "2026-06-07",
    rows: [row],
  };

  it("räknar veckostatistik korrekt", () => {
    const s = countWeekStats(row);
    expect(s.normal).toBe(960);
    expect(s.overtime).toBe(90);
    expect(s.travel).toBe(30);
    expect(s.total).toBe(1080);
    expect(s.reportedDays).toBe(2);
  });

  it("bestämmer veckostatus (väntar attest pga 1 pending)", () => {
    const status = rowWeekStatus(row);
    expect(status.tone).toBe("pending");
    expect(status.label).toContain("Väntar attest");
  });

  it("bygger CSV med en rad per block + header", () => {
    const csv = buildPayrollCsv(matrix);
    const lines = csv.split("\n");
    // header + 3 block (mån) + 1 block (tis) = 5
    expect(lines.length).toBe(5);
    expect(lines[0]).toContain("datum");
    expect(lines[0]).toContain("anställd");
    expect(lines[0]).toContain("status");
    // Måndagens första block
    expect(lines[1]).toContain("2026-06-01");
    expect(lines[1]).toContain("Anna Andersson");
    expect(lines[1]).toContain("Projekt Globen");
    expect(lines[1]).toContain("Attesterad");
    // Travel-blocket
    expect(lines[2]).toContain("travel");
    // Tisdag
    expect(lines[4]).toContain("2026-06-02");
    expect(lines[4]).toContain("Väntar attest");
  });

  it("status approved när alla rapporterade dagar är approved och inga pending", () => {
    const r: StaffTimeMatrixRow = {
      ...row,
      pendingSubmissionIds: [],
      days: row.days.map((d, i) =>
        i < 2 ? { ...d, status: "approved" as const } : d,
      ),
    };
    expect(rowWeekStatus(r).tone).toBe("approved");
  });

  it("status warn när komplettering begärd", () => {
    const r: StaffTimeMatrixRow = {
      ...row,
      days: row.days.map((d, i) =>
        i === 0 ? { ...d, status: "correction_requested" as const } : d,
      ),
    };
    expect(rowWeekStatus(r).tone).toBe("warn");
  });
});
