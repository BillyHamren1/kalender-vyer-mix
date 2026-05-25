import { describe, it, expect } from "vitest";
import {
  buildWeeklyBundles,
  isCleanWeekApproval,
  isWeekFullyApprovable,
} from "../weeklyApprovalModel";
import type {
  StaffWeeklyStaffMember,
  StaffWeeklySubmissionRow,
} from "@/hooks/staff/useStaffWeeklyTimeApprovals";

const weekStart = new Date("2026-05-18T00:00:00Z"); // Mån

const STAFF: StaffWeeklyStaffMember[] = [
  { id: "alice", name: "Alice Andersson", email: null, avatar_url: null },
  { id: "bob", name: "Bob Bengtsson", email: null, avatar_url: null },
  { id: "cilla", name: "Cilla Carlsson", email: null, avatar_url: null },
];

function sub(
  partial: Partial<StaffWeeklySubmissionRow> & { staff_id: string; date: string; status: string },
): StaffWeeklySubmissionRow {
  return {
    id: `${partial.staff_id}-${partial.date}`,
    staff_id: partial.staff_id,
    date: partial.date,
    status: partial.status as any,
    start_time: "08:00",
    end_time: "16:00",
    break_minutes: 30,
    comment: null,
    user_edits_json: null,
    ai_validation_json: null,
    requested_start_at: null,
    requested_end_at: null,
    submitted_at: "2026-05-19T18:00:00Z",
    ...partial,
  } as StaffWeeklySubmissionRow;
}

describe("buildWeeklyBundles — prioritetssortering", () => {
  it("sorterar correction_requested först, sedan needs_user_attention, sedan godkända", () => {
    const submissions = [
      sub({ staff_id: "alice", date: "2026-05-18", status: "submitted" }),
      sub({ staff_id: "bob", date: "2026-05-18", status: "approved" }),
      sub({ staff_id: "bob", date: "2026-05-19", status: "approved" }),
      sub({ staff_id: "cilla", date: "2026-05-18", status: "correction_requested" }),
    ];
    const bundles = buildWeeklyBundles(STAFF, submissions, weekStart);
    expect(bundles.map((b) => b.staff.id)).toEqual(["cilla", "alice", "bob"]);
    expect(bundles[0].actionLabel).toMatch(/komplettering/i);
    expect(bundles[2].actionLabel).toMatch(/godkänd/i);
  });

  it("räknar approvable, correction, attention separat", () => {
    const submissions = [
      sub({ staff_id: "alice", date: "2026-05-18", status: "submitted" }),
      sub({ staff_id: "alice", date: "2026-05-19", status: "correction_requested" }),
      sub({ staff_id: "alice", date: "2026-05-20", status: "needs_user_attention" }),
      sub({ staff_id: "alice", date: "2026-05-21", status: "approved" }),
    ];
    const [alice] = buildWeeklyBundles([STAFF[0]], submissions, weekStart);
    expect(alice.approvableCount).toBe(2); // submitted + needs_user_attention
    expect(alice.correctionRequestedCount).toBe(1);
    expect(alice.needsUserAttentionCount).toBe(1);
    expect(alice.approvedCount).toBe(1);
    expect(alice.priorityRank).toBe(1); // correction
    expect(isWeekFullyApprovable(alice)).toBe(true);
    expect(isCleanWeekApproval(alice)).toBe(false); // blockerad av correction
  });

  it("isCleanWeekApproval = true när alla väntande dagar är direkt godkännbara", () => {
    const submissions = [
      sub({ staff_id: "alice", date: "2026-05-18", status: "submitted" }),
      sub({ staff_id: "alice", date: "2026-05-19", status: "edited" }),
      sub({ staff_id: "alice", date: "2026-05-20", status: "approved" }),
    ];
    const [alice] = buildWeeklyBundles([STAFF[0]], submissions, weekStart);
    expect(isCleanWeekApproval(alice)).toBe(true);
    expect(alice.actionLabel).toMatch(/väntar/i);
  });

  it("dagar utan submission räknas inte som missing", () => {
    const submissions = [sub({ staff_id: "alice", date: "2026-05-18", status: "approved" })];
    const [alice] = buildWeeklyBundles([STAFF[0]], submissions, weekStart);
    expect(alice.missingCount).toBe(0);
    expect(alice.days.filter((d) => d.status === "no_report")).toHaveLength(6);
  });
});
