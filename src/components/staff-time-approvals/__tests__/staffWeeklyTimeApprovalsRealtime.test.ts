import { describe, expect, it } from "vitest";
import { matchesWeeklyApprovalsRealtime } from "@/hooks/staff/staffWeeklyTimeApprovalsRealtime";

describe("matchesWeeklyApprovalsRealtime", () => {
  it("matchar rad inom vald vecka och organisation", () => {
    expect(
      matchesWeeklyApprovalsRealtime({
        organizationId: "org-1",
        weekStart: "2026-05-25",
        weekEnd: "2026-05-31",
        staffId: null,
        payload: {
          new: {
            organization_id: "org-1",
            staff_id: "staff-1",
            date: "2026-05-27",
          },
        },
      }),
    ).toBe(true);
  });

  it("ignorerar annan organisation, annan vecka och annan staff-filter", () => {
    expect(
      matchesWeeklyApprovalsRealtime({
        organizationId: "org-1",
        weekStart: "2026-05-25",
        weekEnd: "2026-05-31",
        staffId: null,
        payload: { new: { organization_id: "org-2", staff_id: "staff-1", date: "2026-05-27" } },
      }),
    ).toBe(false);

    expect(
      matchesWeeklyApprovalsRealtime({
        organizationId: "org-1",
        weekStart: "2026-05-25",
        weekEnd: "2026-05-31",
        staffId: null,
        payload: { new: { organization_id: "org-1", staff_id: "staff-1", date: "2026-06-01" } },
      }),
    ).toBe(false);

    expect(
      matchesWeeklyApprovalsRealtime({
        organizationId: "org-1",
        weekStart: "2026-05-25",
        weekEnd: "2026-05-31",
        staffId: "staff-2",
        payload: { new: { organization_id: "org-1", staff_id: "staff-1", date: "2026-05-27" } },
      }),
    ).toBe(false);
  });

  it("klarar old-payload och ISO-datetime", () => {
    expect(
      matchesWeeklyApprovalsRealtime({
        organizationId: "org-1",
        weekStart: "2026-05-25",
        weekEnd: "2026-05-31",
        staffId: "staff-1",
        payload: {
          old: {
            organization_id: "org-1",
            staff_id: "staff-1",
            date: "2026-05-31T18:20:00.000Z",
          },
        },
      }),
    ).toBe(true);
  });
});