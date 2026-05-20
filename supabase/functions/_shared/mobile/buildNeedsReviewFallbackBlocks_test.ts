import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildNeedsReviewFallbackBlocks } from "./buildNeedsReviewFallbackBlocks.ts";

Deno.test("returns empty result when candidates is not an array", () => {
  const r = buildNeedsReviewFallbackBlocks(null);
  assertEquals(r.blocks.length, 0);
  assertEquals(r.candidateCount, 0);
});

Deno.test("drops signal_gap and missing-time candidates, keeps unknown_place + transport as needs_review", () => {
  const candidates = [
    {
      id: "a",
      kind: "signal_gap",
      startAt: "2026-05-20T08:00:00Z",
      endAt: "2026-05-20T08:30:00Z",
      durationMinutes: 30,
    },
    {
      id: "b",
      kind: "transport",
      startAt: "2026-05-20T09:00:00Z",
      endAt: "2026-05-20T09:20:00Z",
      durationMinutes: 20,
      targetLabel: "Resa",
    },
    {
      id: "c",
      kind: "unknown_place",
      startAt: "2026-05-20T10:00:00Z",
      endAt: "2026-05-20T11:00:00Z",
      durationMinutes: 60,
      targetLabel: "Okänd plats Arlanda",
    },
    {
      id: "no-times",
      kind: "transport",
    },
  ];
  const r = buildNeedsReviewFallbackBlocks(candidates);
  assertEquals(r.candidateCount, 4);
  assertEquals(r.droppedCount, 2);
  assertEquals(r.blocks.length, 2);
  for (const b of r.blocks) {
    assertEquals(b.kind, "needs_review");
    assertEquals(b.reviewState, "needs_review");
    assertEquals(b._provisionalFromCandidates, true);
  }
  assertEquals(r.blocks[0].id, "b");
  assertEquals(r.blocks[1].displayLabel, "Okänd plats Arlanda");
});

Deno.test("preserves start/end/duration and origin kind", () => {
  const r = buildNeedsReviewFallbackBlocks([
    {
      id: "x",
      kind: "unknown_place",
      startAt: "2026-05-20T06:00:00Z",
      endAt: "2026-05-20T07:30:00Z",
      durationMinutes: 90,
    },
  ]);
  assertEquals(r.blocks.length, 1);
  assertEquals(r.blocks[0].startAt, "2026-05-20T06:00:00Z");
  assertEquals(r.blocks[0].endAt, "2026-05-20T07:30:00Z");
  assertEquals(r.blocks[0].durationMinutes, 90);
  assertEquals(r.blocks[0]._originKind, "unknown_place");
});
