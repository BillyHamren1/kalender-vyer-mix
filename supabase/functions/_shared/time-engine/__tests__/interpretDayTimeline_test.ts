import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  interpretDayTimeline,
  dayTimelineBlockKey,
  type DayTimelineBlock,
} from "../interpretDayTimeline.ts";
import type { GpsTimelineSegment } from "../buildGpsDayTimeline.ts";

const STAFF = "11111111-1111-1111-1111-111111111111";
const ORG = "22222222-2222-2222-2222-222222222222";
const DATE = "2026-05-13";
const PROJ_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJ_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const WH = "cccccccc-cccc-cccc-cccc-cccccccccccc";

let _id = 0;
function nextId() { return `seg-${++_id}`; }

interface SegOpts {
  start: string;
  end: string;
  type: GpsTimelineSegment["type"];
  kind?: GpsTimelineSegment["kind"];
  targetId?: string | null;
  targetType?: GpsTimelineSegment["matchedTargetType"];
  label?: string | null;
}

function seg(o: SegOpts): GpsTimelineSegment {
  const start = new Date(o.start).getTime();
  const end = new Date(o.end).getTime();
  return {
    id: nextId(),
    startTs: o.start,
    endTs: o.end,
    durationMin: (end - start) / 60_000,
    kind: o.kind ?? (o.type === "transport" ? "travel" : o.type === "gps_gap" ? "gps_gap" : "stay"),
    type: o.type,
    label: o.label ?? "x",
    matchedTargetId: o.targetId ?? null,
    matchedTargetType: o.targetType ?? null,
    matchedTargetName: o.label ?? null,
    centerLat: null, centerLng: null, startLat: null, startLng: null, endLat: null, endLng: null,
    pingCount: 5,
    distanceMeters: 0,
    avgKmh: 0,
    confidence: 0.9,
    reason: "matched_valid_target",
  };
}

Deno.test("merges contiguous same-project segments with small gap", () => {
  _id = 0;
  const out = interpretDayTimeline({
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [
      seg({ start: "2026-05-13T08:00:00Z", end: "2026-05-13T10:00:00Z", type: "known_site", targetId: PROJ_A, targetType: "project", label: "A" }),
      // 3 min gap → merge
      seg({ start: "2026-05-13T10:03:00Z", end: "2026-05-13T11:00:00Z", type: "known_site", targetId: PROJ_A, targetType: "project", label: "A" }),
    ],
  });
  assertEquals(out.blocks.length, 1);
  assertEquals(out.blocks[0].kind, "project");
  assertEquals(out.blocks[0].reason, "merged_contiguous_same_target");
  assertEquals(out.blocks[0].targetRefId, PROJ_A);
});

Deno.test("short travel detour <30min between same project → reclassed as project", () => {
  _id = 0;
  const out = interpretDayTimeline({
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [
      seg({ start: "2026-05-13T09:00:00Z", end: "2026-05-13T10:30:00Z", type: "known_site", targetId: PROJ_A, targetType: "project", label: "A" }),
      seg({ start: "2026-05-13T10:30:00Z", end: "2026-05-13T10:45:00Z", type: "transport", label: "Resa" }),
      seg({ start: "2026-05-13T10:45:00Z", end: "2026-05-13T12:00:00Z", type: "known_site", targetId: PROJ_A, targetType: "project", label: "A" }),
    ],
  });
  // After detour reclass + merge: one project block
  assertEquals(out.blocks.length, 1);
  assertEquals(out.blocks[0].kind, "project");
  assertEquals(out.blocks[0].targetRefId, PROJ_A);
  assert(out.blocks[0].reinterpreted);
});

Deno.test("travel between two DIFFERENT projects stays as travel", () => {
  _id = 0;
  const out = interpretDayTimeline({
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [
      seg({ start: "2026-05-13T08:00:00Z", end: "2026-05-13T10:00:00Z", type: "known_site", targetId: PROJ_A, targetType: "project", label: "A" }),
      seg({ start: "2026-05-13T10:00:00Z", end: "2026-05-13T10:20:00Z", type: "transport", label: "Resa" }),
      seg({ start: "2026-05-13T10:20:00Z", end: "2026-05-13T12:00:00Z", type: "known_site", targetId: PROJ_B, targetType: "project", label: "B" }),
    ],
  });
  assertEquals(out.blocks.length, 3);
  assertEquals(out.blocks[1].kind, "travel");
  assertEquals(out.blocks[2].kind, "project");
  assertEquals(out.blocks[2].targetRefId, PROJ_B);
});

Deno.test("warehouse never absorbs short detour", () => {
  _id = 0;
  const out = interpretDayTimeline({
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [
      seg({ start: "2026-05-13T08:00:00Z", end: "2026-05-13T09:00:00Z", type: "known_site", targetId: WH, targetType: "warehouse", label: "Lager" }),
      seg({ start: "2026-05-13T09:00:00Z", end: "2026-05-13T09:10:00Z", type: "transport", label: "Resa" }),
      seg({ start: "2026-05-13T09:10:00Z", end: "2026-05-13T10:00:00Z", type: "known_site", targetId: WH, targetType: "warehouse", label: "Lager" }),
    ],
  });
  // No detour-rule for warehouse → stays as 3 blocks (gap > 5min so no merge either)
  assertEquals(out.blocks.length, 3);
  assertEquals(out.blocks[1].kind, "travel");
});

Deno.test("unknown_place stays unknown — no guessing", () => {
  _id = 0;
  const out = interpretDayTimeline({
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [
      seg({ start: "2026-05-13T13:00:00Z", end: "2026-05-13T14:00:00Z", type: "unknown_place", label: "Okänd" }),
    ],
  });
  assertEquals(out.blocks[0].kind, "unknown");
});

Deno.test("gps_gap never becomes travel", () => {
  _id = 0;
  const out = interpretDayTimeline({
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [
      seg({ start: "2026-05-13T12:00:00Z", end: "2026-05-13T12:30:00Z", type: "gps_gap", kind: "gps_gap" }),
    ],
  });
  assertEquals(out.blocks[0].kind, "gps_gap");
});

Deno.test("manual override wins over heuristic", () => {
  _id = 0;
  const out = interpretDayTimeline({
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [
      seg({ start: "2026-05-13T08:00:00Z", end: "2026-05-13T09:00:00Z", type: "unknown_place", label: "Okänd" }),
    ],
    overrides: [{
      startedAt: "2026-05-13T08:00:00Z",
      endedAt: "2026-05-13T09:00:00Z",
      kind: "project",
      targetKind: "project",
      targetRefId: PROJ_A,
      targetLabel: "A",
    }],
  });
  assertEquals(out.blocks[0].kind, "project");
  assertEquals(out.blocks[0].reason, "manual_override");
  assertEquals(out.blocks[0].targetRefId, PROJ_A);
});

Deno.test("blockKey is stable + unique per block", () => {
  _id = 0;
  const out = interpretDayTimeline({
    staffId: STAFF, organizationId: ORG, date: DATE,
    segments: [
      seg({ start: "2026-05-13T08:00:00Z", end: "2026-05-13T09:00:00Z", type: "known_site", targetId: PROJ_A, targetType: "project", label: "A" }),
      seg({ start: "2026-05-13T10:00:00Z", end: "2026-05-13T11:00:00Z", type: "known_site", targetId: PROJ_B, targetType: "project", label: "B" }),
    ],
  });
  const keys = out.blocks.map((b) => dayTimelineBlockKey(STAFF, DATE, b));
  assertEquals(new Set(keys).size, keys.length);
});

Deno.test("idempotent: same input → same output", () => {
  _id = 0;
  const segs = [
    seg({ start: "2026-05-13T08:00:00Z", end: "2026-05-13T09:00:00Z", type: "known_site", targetId: PROJ_A, targetType: "project", label: "A" }),
    seg({ start: "2026-05-13T09:05:00Z", end: "2026-05-13T10:00:00Z", type: "known_site", targetId: PROJ_A, targetType: "project", label: "A" }),
  ];
  const a = interpretDayTimeline({ staffId: STAFF, organizationId: ORG, date: DATE, segments: segs });
  const b = interpretDayTimeline({ staffId: STAFF, organizationId: ORG, date: DATE, segments: segs });
  assertEquals(
    a.blocks.map((x) => ({ ...x, index: x.index })),
    b.blocks.map((x) => ({ ...x, index: x.index })),
  );
});
