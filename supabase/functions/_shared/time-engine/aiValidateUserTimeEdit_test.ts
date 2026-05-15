// Lager 5.4 — Tester för aiValidateUserTimeEdit (deterministisk fallback)
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aiValidateUserTimeEdit,
  deterministicValidateUserEdits,
  type AiValidateUserTimeEditInput,
} from "./aiValidateUserTimeEdit.ts";
import type { DisplayBlockShape, UserEdit } from "./applyUserEditsToDisplayTimeline.ts";

const block = (over: Partial<DisplayBlockShape> = {}): DisplayBlockShape => ({
  blockId: "blk-A",
  startAtIso: "2026-05-15T08:00:00.000Z",
  endAtIso: "2026-05-15T17:00:00.000Z",
  allocationType: "project_work",
  targetType: "project",
  targetId: "kaggeholm",
  label: "Kaggeholm",
  warnings: [],
  humanWarnings: [],
  ...over,
});

const edit = (over: Partial<UserEdit>): UserEdit => ({
  editId: "e-" + Math.random().toString(36).slice(2),
  sourceDisplayBlockId: "blk-A",
  editType: "change_block_end",
  previousValue: "2026-05-15T17:00:00.000Z",
  newValue: "2026-05-15T16:52:00.000Z",
  userReason: null,
  createdAt: "2026-05-15T18:00:00.000Z",
  ...over,
});

const baseInput = (over: Partial<AiValidateUserTimeEditInput> = {}): AiValidateUserTimeEditInput => ({
  originalDisplayTimeline: [block()],
  dayEvidenceSummary: {
    activeWorkdayWindow: { startAtIso: "2026-05-15T08:00:00.000Z", endAtIso: "2026-05-15T17:48:00.000Z" },
  },
  locationTruthV2Summary: {
    segments: [{
      startAtIso: "2026-05-15T08:00:00.000Z",
      endAtIso: "2026-05-15T17:00:00.000Z",
      targetType: "project",
      targetId: "kaggeholm",
      label: "Kaggeholm",
      finalType: "known_site",
    }],
  },
  userEdits: [],
  userNote: null,
  ...over,
});

Deno.test("liten justering 17:48 → 17:40 -> accepted", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({
    userEdits: [edit({
      editType: "change_workday_end",
      sourceDisplayBlockId: null,
      previousValue: "2026-05-15T17:48:00.000Z",
      newValue: "2026-05-15T17:40:00.000Z",
    })],
  }));
  assertEquals(r.validationStatus, "accepted");
  assertEquals(r.source, "deterministic_fallback");
});

Deno.test("flyttar 6h projekttid till annat projekt utan GPS-stöd -> flagged", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({
    userEdits: [edit({
      editType: "link_block_to_project",
      newValue: { targetType: "project", targetId: "annat-projekt", label: "Annat" },
    })],
  }));
  assert(r.warnings.some((w) => w.code === "project_link_without_gps_support"));
  assertEquals(r.validationStatus, "needs_user_confirmation");
});

Deno.test("samma omflyttning men med tillräcklig kommentar -> accepted_with_warning", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({
    userNote: "Bytte projekt eftersom kunden ville ha tid på det andra projektet hela dagen.",
    userEdits: [edit({
      editType: "link_block_to_project",
      newValue: { targetType: "project", targetId: "annat-projekt", label: "Annat" },
    })],
  }));
  assertEquals(r.validationStatus, "accepted_with_warning");
});

Deno.test("stor tidsändring (>4h) -> flagged_conflicts_with_evidence", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({
    userEdits: [edit({
      editType: "change_block_end",
      previousValue: "2026-05-15T17:00:00.000Z",
      newValue: "2026-05-15T22:00:00.000Z",
    })],
  }));
  assertEquals(r.validationStatus, "flagged_conflicts_with_evidence");
  assert(r.warnings.some((w) => w.code === "huge_time_shift"));
});

Deno.test("edits skapar överlapp -> flagged", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({
    originalDisplayTimeline: [
      block({ blockId: "blk-A", startAtIso: "2026-05-15T08:00:00.000Z", endAtIso: "2026-05-15T12:00:00.000Z" }),
      block({ blockId: "blk-B", startAtIso: "2026-05-15T13:00:00.000Z", endAtIso: "2026-05-15T17:00:00.000Z" }),
    ],
    userEdits: [edit({
      sourceDisplayBlockId: "blk-A",
      editType: "change_block_end",
      previousValue: "2026-05-15T12:00:00.000Z",
      newValue: "2026-05-15T14:00:00.000Z",
    })],
  }));
  assert(r.warnings.some((w) => w.code === "edits_create_overlap"));
  assertEquals(r.validationStatus, "flagged_conflicts_with_evidence");
});

Deno.test("okopplad adress kopplas till projekt -> warning, men tillräcklig kommentar -> accepted_with_warning", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({
    originalDisplayTimeline: [block({
      blockId: "blk-A",
      allocationType: "unlinked_work_address",
      targetType: null, targetId: null, label: "Okänd adress",
      startAtIso: "2026-05-15T09:00:00.000Z",
      endAtIso: "2026-05-15T11:30:00.000Z", // 150 min >= 60
    })],
    locationTruthV2Summary: { segments: [] }, // ingen GPS-koppling
    userNote: "Kopplade adressen till projektet — vi var där hela förmiddagen.",
    userEdits: [edit({
      editType: "link_address_to_project",
      newValue: { targetType: "project", targetId: "proj-x", label: "Proj X" },
    })],
  }));
  assertEquals(r.validationStatus, "accepted_with_warning");
});

Deno.test("ingen edit -> accepted med hög konfidens-fallback", async () => {
  const r = deterministicValidateUserEdits(baseInput());
  assertEquals(r.validationStatus, "accepted");
  assertEquals(r.diagnostics.editCount, 0);
  assertEquals(r.source, "deterministic_fallback");
});

Deno.test("ai-klient injekteras -> source='ai_model'", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({ userEdits: [edit({})] }), {
    validate: () => Promise.resolve({
      validationStatus: "accepted",
      confidence: 0.95,
      summary: "AI sade ok",
      warnings: [],
      source: "deterministic_fallback", // ska skrivas över
      diagnostics: { editCount: 1, flaggedCount: 0, overlapDetected: false, largeShiftCount: 0, needsExplanation: false },
    }),
  });
  assertEquals(r.source, "ai_model");
  assertEquals(r.summary, "AI sade ok");
});

Deno.test("ai-klient kastar -> deterministisk fallback", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({ userEdits: [edit({})] }), {
    validate: () => { throw new Error("boom"); },
  });
  assertEquals(r.source, "deterministic_fallback");
});

Deno.test("tidsförflyttning 60–240 min utan kommentar -> needs_user_confirmation", async () => {
  const r = await aiValidateUserTimeEdit(baseInput({
    userEdits: [edit({
      editType: "change_block_end",
      previousValue: "2026-05-15T17:00:00.000Z",
      newValue: "2026-05-15T19:00:00.000Z",
    })],
  }));
  assertEquals(r.validationStatus, "needs_user_confirmation");
  assert(r.requiredUserExplanation && r.requiredUserExplanation.length > 0);
});
