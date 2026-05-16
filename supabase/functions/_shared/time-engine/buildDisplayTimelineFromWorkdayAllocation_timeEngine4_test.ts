// Time Engine 4 — Gap/unlinked får inte dominera Gantt.
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { buildDisplayTimelineFromWorkdayAllocation } from "./buildDisplayTimelineFromWorkdayAllocation.ts";
import type {
  WorkdayAllocationProposal,
  WorkdayAllocationResult,
  WorkdayAllocationSegment,
} from "./buildWorkdayAllocationFromLocationTruth.ts";

function seg(overrides: Partial<WorkdayAllocationSegment>): WorkdayAllocationSegment {
  return {
    id: "s1",
    allocationType: "project_work",
    targetType: "project",
    targetId: "p1",
    label: "Acme",
    address: "Test 1",
    startAt: "2026-05-15T08:00:00Z",
    endAt: "2026-05-15T09:00:00Z",
    confidence: "high",
    warnings: [],
    outsideWorkday: false,
    sourceLocationTruthSegmentIds: [],
    ...overrides,
  } as WorkdayAllocationSegment;
}

function wda(
  segments: WorkdayAllocationSegment[],
  proposals: WorkdayAllocationProposal[] = [],
): WorkdayAllocationResult {
  return {
    segments,
    proposals,
    diagnostics: { staffId: "x", date: "2026-05-15" } as any,
  };
}

const run = (w: WorkdayAllocationResult) =>
  buildDisplayTimelineFromWorkdayAllocation({
    dayEvidence: null,
    locationTruthV2: null,
    workdayAllocation: w,
  });

Deno.test("TE4: Eduards — lång stabil okopplad adress → work/warning, inte review", () => {
  const r = run(wda([
    seg({
      id: "u1",
      allocationType: "unlinked_work_address",
      targetType: null,
      targetId: null,
      label: null,
      address: "Storgatan 1",
      startAt: "2026-05-15T08:00:00Z",
      endAt: "2026-05-15T16:00:00Z",
      warnings: ["no_project_link"],
    }),
  ]));
  assertEquals(r.blocks.length, 1);
  const b = r.blocks[0];
  assertEquals(b.displayType, "unlinked_address");
  assertEquals(b.severity, "warning");
  assertEquals(b.title, "Arbete på okopplad adress");
  assert(b.warnings.includes("no_project_link"), "no_project_link ska exponeras");
  assert(b.humanWarnings.some((w) => /Saknar projektkoppling/.test(w)));
  assert(b.actions.some((a) => a.actionType === "link_to_project"));
});

Deno.test("TE4: Kristaps — flera långa okopplade adresser → inte gula review-block", () => {
  const r = run(wda([
    seg({ id: "u1", allocationType: "unlinked_work_address", targetType: null, targetId: null, label: null, address: "A", startAt: "2026-05-15T07:00:00Z", endAt: "2026-05-15T10:00:00Z" }),
    seg({ id: "u2", allocationType: "unlinked_work_address", targetType: null, targetId: null, label: null, address: "B", startAt: "2026-05-15T11:00:00Z", endAt: "2026-05-15T14:00:00Z" }),
  ]));
  for (const b of r.blocks.filter((x) => x.displayType === "unlinked_address")) {
    assert(b.severity !== "needs_user_review", `block ${b.id} ska inte vara needs_user_review`);
  }
});

Deno.test("TE4: gap 11–30 min vikts in på närliggande block", () => {
  const r = run(wda(
    [seg({ id: "a", startAt: "2026-05-15T08:00:00Z", endAt: "2026-05-15T09:00:00Z" })],
    [{ proposalType: "uncovered_workday_time", segmentId: "gap", startAt: "2026-05-15T09:00:00Z", endAt: "2026-05-15T09:20:00Z" } as any],
  ));
  assertEquals(r.blocks.filter((b) => b.displayType === "break_or_gap").length, 0);
  const host = r.blocks[0];
  assertEquals(host.metadata.absorbedGapMinutes, 20);
});

Deno.test("TE4: gap 31–90 min → discrete info-block 'Glapp i signal'", () => {
  const r = run(wda(
    [seg({ id: "a", startAt: "2026-05-15T08:00:00Z", endAt: "2026-05-15T09:00:00Z" })],
    [{ proposalType: "uncovered_workday_time", segmentId: "gap", startAt: "2026-05-15T09:00:00Z", endAt: "2026-05-15T10:00:00Z" } as any],
  ));
  const gap = r.blocks.find((b) => b.displayType === "break_or_gap");
  assert(gap, "info gap-block ska finnas");
  assertEquals(gap!.severity, "info");
  assertEquals(gap!.title, "Glapp i signal");
});

Deno.test("TE4: gap >90 min → needs_user_review 'Glapp i dagen'", () => {
  const r = run(wda(
    [seg({ id: "a", startAt: "2026-05-15T08:00:00Z", endAt: "2026-05-15T09:00:00Z" })],
    [{ proposalType: "uncovered_workday_time", segmentId: "gap", startAt: "2026-05-15T09:00:00Z", endAt: "2026-05-15T11:00:00Z" } as any],
  ));
  const gap = r.blocks.find((b) => b.displayType === "break_or_gap");
  assert(gap);
  assertEquals(gap!.severity, "needs_user_review");
  assertEquals(gap!.title, "Glapp i dagen");
});

Deno.test("TE4: unlinked + planning_geo_mismatch → behåller needs_user_review", () => {
  const r = run(wda([
    seg({
      id: "u1",
      allocationType: "unlinked_work_address",
      targetType: null,
      targetId: null,
      label: null,
      address: "Storgatan",
      startAt: "2026-05-15T08:00:00Z",
      endAt: "2026-05-15T12:00:00Z",
      warnings: ["planning_geo_mismatch"],
    }),
  ]));
  assertEquals(r.blocks[0].severity, "needs_user_review");
});
