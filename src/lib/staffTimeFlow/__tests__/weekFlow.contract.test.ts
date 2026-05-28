import { describe, it, expect } from "vitest";
import { buildWeekFlow, mapDbStatusToFlow } from "../weekFlow";
import type { StaffGpsDaySummary } from "@/hooks/staff/useStaffGpsWeekSummary";
import type { StaffDaySubmissionRow } from "@/hooks/staff/useStaffDaySubmissions";

const WEEK = [
  new Date("2026-05-25T00:00:00Z"),
  new Date("2026-05-26T00:00:00Z"),
  new Date("2026-05-27T00:00:00Z"),
];

function gpsDay(date: string, opts: Partial<StaffGpsDaySummary> = {}): StaffGpsDaySummary {
  return {
    date,
    pingsCount: 50,
    firstIso: `${date}T06:00:00Z`,
    lastIso: `${date}T18:00:00Z`,
    durationMin: 600,
    windowMin: 720,
    workMin: 480,
    privateMin: 0,
    travelMin: 60,
    unknownMin: 0,
    gapMin: 0,
    idleMin: 0,
    visitsCount: 2,
    placeNames: ["Lager A"],
    places: [{ name: "Lager A", minutes: 480 }],
    segments: [
      {
        type: "work",
        label: "Lager A",
        start: `${date}T06:00:00Z`,
        end: `${date}T14:00:00Z`,
        minutes: 480,
      } as any,
      {
        type: "travel",
        label: "Resa",
        start: `${date}T14:00:00Z`,
        end: `${date}T15:00:00Z`,
        minutes: 60,
        fromLabel: "Lager A",
        toLabel: "Kund B",
      } as any,
    ],
    isLoading: false,
    ...opts,
  };
}

function sub(
  date: string,
  status: string,
  opts: Partial<StaffDaySubmissionRow> = {},
): StaffDaySubmissionRow {
  return {
    id: `sub-${date}-${status}`,
    organization_id: "org-1",
    staff_id: "staff-1",
    date,
    status,
    start_time: "06:00:00",
    end_time: "18:00:00",
    requested_start_at: `${date}T06:00:00Z`,
    requested_end_at: `${date}T18:00:00Z`,
    break_minutes: 30,
    comment: null,
    review_comment: null,
    reviewed_at: null,
    reviewed_by: null,
    submitted_at: `${date}T18:05:00Z`,
    updated_at: `${date}T18:05:00Z`,
    ...opts,
  };
}

describe("mapDbStatusToFlow", () => {
  it("approved + payroll_approved → approved", () => {
    expect(mapDbStatusToFlow("approved")).toBe("approved");
    expect(mapDbStatusToFlow("payroll_approved")).toBe("approved");
  });
  it("submitted/edited/needs_control → submitted_waiting_approval", () => {
    for (const s of ["submitted", "edited", "needs_control", "needs_user_attention", "ai_flagged"]) {
      expect(mapDbStatusToFlow(s)).toBe("submitted_waiting_approval");
    }
  });
  it("correction_requested → correction_requested", () => {
    expect(mapDbStatusToFlow("correction_requested")).toBe("correction_requested");
  });
});

describe("buildWeekFlow", () => {
  const baseInput = {
    staffId: "staff-1",
    weekDates: WEEK,
    gpsSummaries: WEEK.map((d) => gpsDay(d.toISOString().slice(0, 10))),
    submissions: [],
    snapshotsById: {},
  };

  it("ingen submission → gps_proposal med rader från GPS", () => {
    const flow = buildWeekFlow({ ...baseInput, viewer: "admin" });
    expect(flow.days).toHaveLength(3);
    for (const d of flow.days) {
      expect(d.status).toBe("gps_proposal");
      expect(d.source).toBe("gps_proposal");
      expect(d.rows.length).toBeGreaterThan(0);
      expect(d.canApprove).toBe(false);
    }
  });

  it("submitted → submitted_waiting_approval, admin får approve-knappar", () => {
    const date = "2026-05-26";
    const flow = buildWeekFlow({
      ...baseInput,
      submissions: [sub(date, "submitted")],
      snapshotsById: {
        [`sub-${date}-submitted`]: [
          { id: "row-1", type: "work", label: "Lager", start: `${date}T06:00:00Z`, end: `${date}T14:00:00Z`, minutes: 480 },
        ],
      },
      viewer: "admin",
    });
    const day = flow.days.find((d) => d.date === date)!;
    expect(day.status).toBe("submitted_waiting_approval");
    expect(day.source).toBe("submission_snapshot");
    expect(day.canApprove).toBe(true);
    expect(day.canRequestCorrection).toBe(true);
    expect(day.canSubmit).toBe(false);
    expect(day.rows[0]?.label).toBe("Lager");
  });

  it("approved → låst, inga knappar", () => {
    const date = "2026-05-26";
    const flow = buildWeekFlow({
      ...baseInput,
      submissions: [sub(date, "approved", { reviewed_at: "2026-05-27T08:00:00Z", reviewed_by: "admin-1" })],
      snapshotsById: {},
      viewer: "admin",
    });
    const day = flow.days.find((d) => d.date === date)!;
    expect(day.status).toBe("approved");
    expect(day.canApprove).toBe(false);
    expect(day.canRequestCorrection).toBe(false);
    expect(day.canSubmit).toBe(false);
    expect(day.approvedAt).toBe("2026-05-27T08:00:00Z");
    expect(day.approvedBy).toBe("admin-1");
  });

  it("payroll_approved mappas till approved (låst)", () => {
    const date = "2026-05-26";
    const flow = buildWeekFlow({
      ...baseInput,
      submissions: [sub(date, "payroll_approved")],
      viewer: "staff",
    });
    const day = flow.days.find((d) => d.date === date)!;
    expect(day.status).toBe("approved");
    expect(day.canSubmit).toBe(false);
  });

  it("correction_requested: app får canSubmit=true, admin får inga knappar", () => {
    const date = "2026-05-26";
    const staffFlow = buildWeekFlow({
      ...baseInput,
      submissions: [sub(date, "correction_requested", { review_comment: "Fyll i rast" })],
      viewer: "staff",
    });
    const adminFlow = buildWeekFlow({
      ...baseInput,
      submissions: [sub(date, "correction_requested", { review_comment: "Fyll i rast" })],
      viewer: "admin",
    });
    const sDay = staffFlow.days.find((d) => d.date === date)!;
    const aDay = adminFlow.days.find((d) => d.date === date)!;
    expect(sDay.canSubmit).toBe(true);
    expect(aDay.canApprove).toBe(false);
    expect(aDay.canRequestCorrection).toBe(false);
    expect(sDay.reviewComment).toBe("Fyll i rast");
  });

  it("viewer staff får aldrig canApprove; viewer admin får aldrig canSubmit", () => {
    const date = "2026-05-26";
    for (const status of ["submitted", "approved", "correction_requested", "edited"]) {
      const s = buildWeekFlow({
        ...baseInput,
        submissions: [sub(date, status)],
        viewer: "staff",
      });
      const a = buildWeekFlow({
        ...baseInput,
        submissions: [sub(date, status)],
        viewer: "admin",
      });
      expect(s.days.every((d) => d.canApprove === false)).toBe(true);
      expect(a.days.every((d) => d.canSubmit === false)).toBe(true);
    }
  });

  it("dagar utan submission visas alltid (filtreras inte bort)", () => {
    const flow = buildWeekFlow({
      ...baseInput,
      submissions: [sub("2026-05-26", "submitted")],
      viewer: "admin",
    });
    expect(flow.days).toHaveLength(3);
    expect(flow.days.filter((d) => d.status === "gps_proposal")).toHaveLength(2);
  });

  it("samma input → samma output oavsett viewer (förutom rättigheter)", () => {
    const a = buildWeekFlow({ ...baseInput, viewer: "admin" });
    const s = buildWeekFlow({ ...baseInput, viewer: "staff" });
    expect(a.days.map((d) => d.totalMinutes)).toEqual(s.days.map((d) => d.totalMinutes));
    expect(a.days.map((d) => d.rows.length)).toEqual(s.days.map((d) => d.rows.length));
    expect(a.days.map((d) => d.status)).toEqual(s.days.map((d) => d.status));
  });

  it("submission utan snapshot: faller tillbaka till requested_start/end", () => {
    const date = "2026-05-26";
    const flow = buildWeekFlow({
      ...baseInput,
      submissions: [sub(date, "submitted")],
      snapshotsById: {}, // ingen snapshot
      viewer: "admin",
    });
    const day = flow.days.find((d) => d.date === date)!;
    expect(day.startTime).toBeTruthy();
    expect(day.endTime).toBeTruthy();
    expect(day.totalMinutes).toBeGreaterThan(0);
  });
});
