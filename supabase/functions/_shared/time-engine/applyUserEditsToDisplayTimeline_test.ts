// Lager 5.3 — Tester för applyUserEditsToDisplayTimeline
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyUserEditsToDisplayTimeline,
  type DisplayBlockShape,
  type UserEdit,
} from "./applyUserEditsToDisplayTimeline.ts";

const baseBlock = (over: Partial<DisplayBlockShape> = {}): DisplayBlockShape => ({
  blockId: "blk-1",
  startAtIso: "2026-05-15T08:00:00.000Z",
  endAtIso: "2026-05-15T12:00:00.000Z",
  allocationType: "project_work",
  targetType: "project",
  targetId: "proj-1",
  label: "Projekt A",
  warnings: [],
  humanWarnings: [],
  ...over,
});

const edit = (over: Partial<UserEdit>): UserEdit => ({
  editId: "e-" + Math.random().toString(36).slice(2),
  sourceDisplayBlockId: "blk-1",
  editType: "add_block_comment",
  previousValue: null,
  newValue: "ok",
  userReason: null,
  createdAt: "2026-05-15T13:00:00.000Z",
  ...over,
});

Deno.test("liten tidsändring (<=10 min) -> severity ok, status edited_by_user", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock()],
    [edit({ editType: "change_block_start", previousValue: "2026-05-15T08:00:00.000Z", newValue: "2026-05-15T08:05:00.000Z" })],
  );
  assertEquals(r.appliedEdits[0].severity, "ok");
  assertEquals(r.editedBlocks[0].startAtIso, "2026-05-15T08:05:00.000Z");
  assertEquals(r.suggestedSubmissionStatus, "edited_by_user");
});

Deno.test("stor tidsändring (>4h) -> conflicts_evidence + status ai_flagged", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock()],
    [edit({ editType: "change_block_end", previousValue: "2026-05-15T12:00:00.000Z", newValue: "2026-05-15T20:00:00.000Z" })],
  );
  assertEquals(r.appliedEdits[0].severity, "conflicts_evidence");
  assertEquals(r.suggestedSubmissionStatus, "ai_flagged");
});

Deno.test("link_block_to_project utan target -> rejected", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock({ targetType: null, targetId: null, allocationType: "unlinked_work_address" })],
    [edit({ editType: "link_block_to_project", newValue: {} })],
  );
  assertEquals(r.appliedEdits[0].severity, "major");
  assertEquals(r.diagnostics.rejectedCount, 1);
});

Deno.test("link_block_to_project med target -> sätter target", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock({ targetType: null, targetId: null, allocationType: "unlinked_work_address" })],
    [edit({
      editType: "link_block_to_project",
      newValue: { targetType: "project", targetId: "proj-99", label: "Nytt projekt" },
    })],
  );
  assertEquals(r.editedBlocks[0].targetId, "proj-99");
  assertEquals(r.editedBlocks[0].label, "Nytt projekt");
  assertEquals(r.suggestedSubmissionStatus, "edited_by_user");
});

Deno.test("mark_supplier_as_pickup på icke-supplier-block -> rejected", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock()],
    [edit({ editType: "mark_supplier_as_pickup", newValue: true })],
  );
  assertEquals(r.appliedEdits[0].severity, "major");
});

Deno.test("mark_supplier_as_dropoff på supplier-block -> supplierIntent=dropoff", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock({ allocationType: "supplier_visit" })],
    [edit({ editType: "mark_supplier_as_dropoff", newValue: true })],
  );
  assertEquals((r.editedBlocks[0] as Record<string, unknown>).supplierIntent, "dropoff");
});

Deno.test("change_workday_end registreras som day-level edit", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock()],
    [edit({
      editType: "change_workday_end",
      sourceDisplayBlockId: null,
      previousValue: "2026-05-15T17:00:00.000Z",
      newValue: "2026-05-15T17:30:00.000Z",
    })],
  );
  assertEquals(r.dayLevelEdits.length, 1);
  assertEquals(r.dayLevelEdits[0].severity, "minor");
});

Deno.test("okänt block-id -> block_not_found", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock()],
    [edit({ sourceDisplayBlockId: "nope", editType: "change_block_start", newValue: "2026-05-15T08:01:00.000Z" })],
  );
  assertEquals(r.appliedEdits[0].reasonCode, "block_not_found");
});

Deno.test("tom kommentar -> rejected men inte major", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock()],
    [edit({ editType: "add_block_comment", newValue: "   " })],
  );
  assertEquals(r.appliedEdits[0].reasonCode, "empty_comment");
  assertEquals(r.appliedEdits[0].severity, "minor");
});

Deno.test("kommentar på block lagras i userComments", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock()],
    [edit({ editType: "add_block_comment", newValue: "Var hos kund hela förmiddagen" })],
  );
  const comments = (r.editedBlocks[0] as Record<string, unknown>).userComments as string[];
  assertEquals(comments, ["Var hos kund hela förmiddagen"]);
  assertEquals(r.appliedEdits[0].severity, "ok");
});

Deno.test("ren read-only: indata-blocken muteras inte", () => {
  const input = [baseBlock()];
  const snapshot = JSON.stringify(input);
  applyUserEditsToDisplayTimeline(input, [
    edit({ editType: "change_block_start", newValue: "2026-05-15T09:00:00.000Z" }),
  ]);
  assertEquals(JSON.stringify(input), snapshot);
});

Deno.test("ej stödd editType -> unsupported_edit_type", () => {
  const r = applyUserEditsToDisplayTimeline(
    [baseBlock()],
    // @ts-expect-error: testar runtime-fall
    [edit({ editType: "delete_block", newValue: null })],
  );
  assertEquals(r.appliedEdits[0].reasonCode, "unsupported_edit_type");
});
