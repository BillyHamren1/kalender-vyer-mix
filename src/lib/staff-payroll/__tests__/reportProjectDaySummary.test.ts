import { describe, it, expect } from "vitest";
import { buildReportProjectDaySummary } from "../reportProjectDaySummary";
import { resolveTravelAllocation } from "../travelAllocation";
import type { StaffTimeMatrixRow, StaffTimeMatrixCell } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";

function cell(date: string, rows: StaffTimeMatrixCell["rows"]): StaffTimeMatrixCell {
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const work = rows.filter((r) => r.kind === "work").reduce((s, r) => s + r.minutes, 0);
  const travel = rows.filter((r) => r.kind === "travel").reduce((s, r) => s + r.minutes, 0);
  return {
    date,
    status: "gps_proposal",
    source: "gps_proposal",
    startTime: null,
    endTime: null,
    workMinutes: work,
    travelMinutes: travel,
    totalMinutes: total,
    normalMinutes: work,
    overtimeMinutes: 0,
    submissionId: null,
    reviewComment: null,
    pingCount: 0,
    gpsAvailable: true,
    rows,
  };
}

describe("travelAllocation", () => {
  it("links travel toLabel to matching work row", () => {
    const c = cell("2026-06-03", [
      { kind: "work", label: "Westers Catering", startIso: null, endIso: null, minutes: 395, fromLabel: null, toLabel: null },
      { kind: "travel", label: "Resa", startIso: null, endIso: null, minutes: 82, fromLabel: "FA Warehouse", toLabel: "Westers Catering" },
    ]);
    const alloc = resolveTravelAllocation(c, c.rows[1]);
    expect(alloc.kind).toBe("linked");
    expect(alloc.label).toBe("Westers Catering");
  });

  it("falls back to fromLabel when toLabel doesn't match", () => {
    const c = cell("2026-06-03", [
      { kind: "work", label: "Westers Catering", startIso: null, endIso: null, minutes: 395, fromLabel: null, toLabel: null },
      { kind: "travel", label: "Resa", startIso: null, endIso: null, minutes: 41, fromLabel: "Westers Catering", toLabel: "FA Warehouse" },
    ]);
    const alloc = resolveTravelAllocation(c, c.rows[1]);
    expect(alloc.kind).toBe("linked");
    expect(alloc.label).toBe("Westers Catering");
  });

  it("returns unknown when nothing matches", () => {
    const c = cell("2026-06-03", [
      { kind: "travel", label: "Resa", startIso: null, endIso: null, minutes: 30, fromLabel: "X", toLabel: "Y" },
    ]);
    const alloc = resolveTravelAllocation(c, c.rows[0]);
    expect(alloc.kind).toBe("unknown");
  });
});

describe("buildReportProjectDaySummary", () => {
  it("groups travel into linked project and unknown bucket", () => {
    const row: StaffTimeMatrixRow = {
      staffId: "s1",
      staffName: "Armands",
      pendingSubmissionIds: [],
      days: [
        cell("2026-06-03", [
          { kind: "work", label: "FA Warehouse", startIso: null, endIso: null, minutes: 155, fromLabel: null, toLabel: null },
          { kind: "work", label: "Westers Catering", startIso: null, endIso: null, minutes: 313, fromLabel: null, toLabel: null },
          { kind: "travel", label: "Resa", startIso: null, endIso: null, minutes: 82, fromLabel: "FA Warehouse", toLabel: "Westers Catering" },
          { kind: "travel", label: "Resa", startIso: null, endIso: null, minutes: 30, fromLabel: "Okänt", toLabel: "Okänt2" },
        ]),
      ],
    };
    const summary = buildReportProjectDaySummary(row);
    expect(summary).toHaveLength(1);
    const projects = summary[0].projects;
    const wester = projects.find((p) => p.label === "Westers Catering")!;
    expect(wester.workMinutes).toBe(313);
    expect(wester.travelMinutes).toBe(82);
    expect(wester.totalMinutes).toBe(395);
    const unlinked = projects.find((p) => p.unlinked);
    expect(unlinked?.travelMinutes).toBe(30);
  });
});
