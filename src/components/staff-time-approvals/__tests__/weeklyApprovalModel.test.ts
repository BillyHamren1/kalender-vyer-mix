import { describe, it, expect } from "vitest";
import {
  buildWeeklyBundles,
  isCleanWeekApproval,
  isWeekFullyApprovable,
  isUsableCacheRow,
  computeCacheMinutes,
  deriveCacheStartEnd,
} from "../weeklyApprovalModel";
import type {
  StaffWeeklyCacheRow,
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
    organization_id: "org-1",
    staff_id: partial.staff_id,
    date: partial.date,
    status: partial.status as any,
    start_time: "08:00",
    end_time: "16:00",
    break_minutes: 30,
    comment: null,
    review_comment: null,
    reviewed_at: null,
    reviewed_by: null,
    user_edits_json: null,
    ai_validation_json: null,
    requested_start_at: null,
    requested_end_at: null,
    submitted_at: "2026-05-19T18:00:00Z",
    updated_at: "2026-05-19T18:00:00Z",
    display_timeline_snapshot_json: null,
    source_summary_json: null,
    ...partial,
  } as StaffWeeklySubmissionRow;
}

function cache(
  partial: Partial<StaffWeeklyCacheRow> & { staff_id: string; date: string },
): StaffWeeklyCacheRow {
  return {
    id: `cache-${partial.staff_id}-${partial.date}`,
    organization_id: "org-1",
    staff_id: partial.staff_id,
    date: partial.date,
    engine_version: "v1",
    summary_json: { workMinutes: 360 },
    report_candidate_blocks_json: [],
    display_blocks_json: [
      { start: "2026-05-18T07:00:00Z", end: "2026-05-18T13:00:00Z", label: "Projekt A" },
    ],
    diagnostics_json: null,
    built_at: "2026-05-18T13:30:00Z",
    stale: false,
    error: null,
    ...partial,
  } as StaffWeeklyCacheRow;
}

describe("buildWeeklyBundles — submission + cache", () => {
  it("submission vinner alltid över cache", () => {
    const [alice] = buildWeeklyBundles(
      [STAFF[0]],
      [sub({ staff_id: "alice", date: "2026-05-18", status: "submitted" })],
      [cache({ staff_id: "alice", date: "2026-05-18" })],
      weekStart,
    );
    const day = alice.days.find((d) => d.date === "2026-05-18")!;
    expect(day.source).toBe("submission");
    expect(day.uiStatus).toBe("pending_admin_attest");
    expect(day.uiStatusLabel).toMatch(/adminattest/i);
    expect(day.cache).not.toBeNull(); // cache finns ändå med
  });

  it("cache utan submission → pending_staff_attest med engine_cache", () => {
    const [alice] = buildWeeklyBundles(
      [STAFF[0]],
      [],
      [cache({ staff_id: "alice", date: "2026-05-18" })],
      weekStart,
    );
    const day = alice.days.find((d) => d.date === "2026-05-18")!;
    expect(day.source).toBe("engine_cache");
    expect(day.uiStatus).toBe("pending_staff_attest");
    expect(day.uiStatusLabel).toMatch(/personalattest/i);
    expect(day.isStaffPending).toBe(true);
    expect(day.isAdminApprovable).toBe(false);
    expect(alice.pendingStaffAttestCount).toBe(1);
    expect(alice.engineProposalCount).toBe(1);
    expect(alice.adminApprovableCount).toBe(0);
    expect(alice.hasTodo).toBe(true);
    expect(alice.actionLabel).toMatch(/personalattest/i);
  });

  it("edited submission → edited_pending_admin_attest", () => {
    const [alice] = buildWeeklyBundles(
      [STAFF[0]],
      [sub({ staff_id: "alice", date: "2026-05-18", status: "edited" })],
      [],
      weekStart,
    );
    const day = alice.days.find((d) => d.date === "2026-05-18")!;
    expect(day.uiStatus).toBe("edited_pending_admin_attest");
    expect(alice.pendingAdminAttestCount).toBe(1);
    expect(alice.adminApprovableCount).toBe(1);
  });

  it("cache med error → engine_error", () => {
    const [alice] = buildWeeklyBundles(
      [STAFF[0]],
      [],
      [cache({ staff_id: "alice", date: "2026-05-18", error: "boom" })],
      weekStart,
    );
    const day = alice.days.find((d) => d.date === "2026-05-18")!;
    expect(day.uiStatus).toBe("engine_error");
    expect(day.isBlocked).toBe(true);
    expect(alice.engineErrorCount).toBe(1);
    expect(alice.hasTodo).toBe(true);
  });

  it("personer utan submission OCH utan användbar cache visas inte", () => {
    const bundles = buildWeeklyBundles(STAFF, [], [], weekStart);
    expect(bundles).toEqual([]);
  });

  it("person syns när bara cache finns", () => {
    const bundles = buildWeeklyBundles(
      STAFF,
      [],
      [cache({ staff_id: "bob", date: "2026-05-19" })],
      weekStart,
    );
    expect(bundles.map((b) => b.staff.id)).toEqual(["bob"]);
  });

  it("isCleanWeekApproval false när pending_staff_attest finns", () => {
    const [alice] = buildWeeklyBundles(
      [STAFF[0]],
      [sub({ staff_id: "alice", date: "2026-05-18", status: "submitted" })],
      [cache({ staff_id: "alice", date: "2026-05-19" })],
      weekStart,
    );
    expect(isWeekFullyApprovable(alice)).toBe(true);
    expect(isCleanWeekApproval(alice)).toBe(false);
  });

  it("allDone ignorerar no_report-dagar", () => {
    const [alice] = buildWeeklyBundles(
      [STAFF[0]],
      [sub({ staff_id: "alice", date: "2026-05-18", status: "approved" })],
      [],
      weekStart,
    );
    expect(alice.allDone).toBe(true);
    expect(alice.actionLabel).toMatch(/godkänd/i);
  });
});

describe("buildWeeklyBundles — prioritetssortering", () => {
  it("sorterar correction > admin-attest > staff-attest > godkänd", () => {
    const submissions = [
      sub({ staff_id: "alice", date: "2026-05-18", status: "submitted" }), // → admin-attest
      sub({ staff_id: "bob", date: "2026-05-18", status: "approved" }),     // → godkänd
      sub({ staff_id: "bob", date: "2026-05-19", status: "approved" }),
      sub({ staff_id: "cilla", date: "2026-05-18", status: "correction_requested" }), // högsta prio
    ];
    const dave: StaffWeeklyStaffMember = { id: "dave", name: "Dave", email: null, avatar_url: null };
    const cacheRows = [cache({ staff_id: "dave", date: "2026-05-19" })]; // staff-attest
    const bundles = buildWeeklyBundles([...STAFF, dave], submissions, cacheRows, weekStart);
    expect(bundles.map((b) => b.staff.id)).toEqual(["cilla", "alice", "dave", "bob"]);
  });
});

describe("helpers", () => {
  it("isUsableCacheRow true för display_blocks", () => {
    expect(
      isUsableCacheRow(cache({ staff_id: "x", date: "2026-05-18" })),
    ).toBe(true);
  });

  it("isUsableCacheRow false vid error", () => {
    expect(
      isUsableCacheRow(cache({ staff_id: "x", date: "2026-05-18", error: "x" })),
    ).toBe(false);
  });

  it("isUsableCacheRow false när allt är tomt", () => {
    expect(
      isUsableCacheRow(
        cache({
          staff_id: "x",
          date: "2026-05-18",
          summary_json: {},
          display_blocks_json: [],
          report_candidate_blocks_json: [],
        }),
      ),
    ).toBe(false);
  });

  it("computeCacheMinutes prioriterar payableMinutes", () => {
    const c = cache({
      staff_id: "x",
      date: "2026-05-18",
      summary_json: { payableMinutes: 200, workMinutes: 300 },
    });
    expect(computeCacheMinutes(c)).toBe(200);
  });

  it("computeCacheMinutes faller tillbaka till durationMinutes-summering", () => {
    const c = cache({
      staff_id: "x",
      date: "2026-05-18",
      summary_json: {},
      display_blocks_json: [
        { durationMinutes: 60 },
        { durationMinutes: 30 },
      ],
    });
    expect(computeCacheMinutes(c)).toBe(90);
  });

  it("deriveCacheStartEnd formatterar ISO till HH:mm", () => {
    const c = cache({ staff_id: "x", date: "2026-05-18" });
    const { startLabel, endLabel } = deriveCacheStartEnd(c);
    expect(startLabel).toBe("07:00");
    expect(endLabel).toBe("13:00");
  });
});
