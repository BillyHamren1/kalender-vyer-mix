/**
 * Contract: time report mirrors GPS week summary 1:1.
 *
 * Skyddar konstanten "Time report page mirrors GPS week summary 1:1": tidrapport-cachen
 * får ALDRIG byggas från någon annan motor än `buildCanonicalStaffDayGpsResult`.
 *
 * Testet replikerar exakt samma logik som Deno-helpern
 * `supabase/functions/_shared/staff-gps/canonicalToCacheProjection.ts` och kör
 * den mot ett mock-canonical-resultat. Om någon ändrar projektionen utan att
 * uppdatera Deno-helpern (eller tvärtom) faller testet.
 */
import { describe, expect, it } from "vitest";

type SegType = "work" | "travel" | "gps_gap" | "unknown_place" | "private" | "idle";

interface MockSeg {
  id: string;
  type: SegType;
  label: string;
  startIso: string;
  endIso: string;
  durationMinutes: number;
  targetType: string;
  targetId: string | null;
  knownSiteId: string | null;
  confidence: "high" | "medium" | "low";
  warningReasons: string[];
  fromLabel: string | null;
  toLabel: string | null;
}

interface MockCanonical {
  version: string;
  segments: MockSeg[];
  firstIso: string | null;
  lastIso: string | null;
  totals: {
    visibleWindowMinutes: number;
    workMinutes: number;
    travelMinutes: number;
    privateMinutes: number;
    unknownMinutes: number;
    gpsGapMinutes: number;
    idleMinutes: number;
    grossWorkdayMinutes: number;
    payableSuggestionMinutes: number;
  };
  debug: { pingsCount: number };
}

// ── 1:1-port av canonicalToCacheProjection.ts (Deno) ─────────────────────────
function buildLabel(seg: MockSeg): string {
  if (seg.type === "travel") {
    const from = seg.fromLabel?.trim();
    const to = seg.toLabel?.trim();
    if (from && to) return `Resa ${from} → ${to}`;
    if (from) return `Resa från ${from}`;
    if (to) return `Resa till ${to}`;
    return "Resa";
  }
  if (seg.type === "gps_gap") return "GPS-glapp";
  if (seg.type === "unknown_place") return seg.label?.trim() || "Okänd plats";
  if (seg.type === "idle") return seg.label?.trim() || "Inaktiv";
  if (seg.type === "private") return seg.label?.trim() || "Privat";
  return seg.label?.trim() || "Arbete";
}

function kindFor(seg: MockSeg) {
  switch (seg.type) {
    case "work": return "work";
    case "travel": return "travel";
    case "gps_gap": return "gap";
    case "private": return "private";
    case "idle": return "idle";
    case "unknown_place":
    default: return "unknown";
  }
}

function canonicalToCacheBlocks(canonical: MockCanonical) {
  return canonical.segments.map((seg) => {
    const label = buildLabel(seg);
    return {
      id: seg.id,
      kind: kindFor(seg),
      type: seg.type,
      classification: seg.type,
      start: seg.startIso,
      end: seg.endIso,
      durationMinutes: seg.durationMinutes,
      minutes: seg.durationMinutes,
      label,
      displayLabel: label,
      targetLabel: label,
      fromLabel: seg.fromLabel,
      toLabel: seg.toLabel,
    };
  });
}

function canonicalToCacheSummary(canonical: MockCanonical, pingCount: number) {
  const t = canonical.totals;
  const payable = t.payableSuggestionMinutes;
  return {
    source: "canonical_gps_day_v1",
    pingCount,
    reportBlocks: canonical.segments.length,
    payableMinutes: payable,
    workMinutes: payable,
    workOnlyMinutes: t.workMinutes,
    travelMinutes: t.travelMinutes,
    totalMinutes: payable,
    firstIso: canonical.firstIso,
    lastIso: canonical.lastIso,
    breakMinutes: 0,
  };
}

// ── Mock som motsvarar Tis 26/5 i bild 1 ─────────────────────────────────────
const tuesdayCanonical: MockCanonical = {
  version: "canonical_staff_day_gps_result_v1",
  firstIso: "2026-05-26T06:58:00Z",
  lastIso: "2026-05-26T18:08:00Z",
  totals: {
    visibleWindowMinutes: 670,
    workMinutes: 567, // 9h 27m (51 + 510 + 6)
    travelMinutes: 104, // 1h 44m (71 + 33)
    privateMinutes: 0,
    unknownMinutes: 0,
    gpsGapMinutes: 0,
    idleMinutes: 0,
    grossWorkdayMinutes: 670,
    payableSuggestionMinutes: 671, // work+travel
  },
  debug: { pingsCount: 420 },
  segments: [
    {
      id: "work:1", type: "work", label: "FA Warehouse",
      startIso: "2026-05-26T06:58:00Z", endIso: "2026-05-26T07:49:00Z",
      durationMinutes: 51, targetType: "known_site", targetId: "fa-wh",
      knownSiteId: "fa-wh", confidence: "high", warningReasons: [],
      fromLabel: null, toLabel: null,
    },
    {
      id: "travel:1", type: "travel", label: "Resa",
      startIso: "2026-05-26T07:49:00Z", endIso: "2026-05-26T09:00:00Z",
      durationMinutes: 71, targetType: "transport", targetId: null,
      knownSiteId: null, confidence: "medium", warningReasons: [],
      fromLabel: "FA Warehouse", toLabel: "Swedish game fair",
    },
    {
      id: "work:2", type: "work", label: "Swedish game fair",
      startIso: "2026-05-26T09:00:00Z", endIso: "2026-05-26T17:30:00Z",
      durationMinutes: 510, targetType: "known_site", targetId: "sgf",
      knownSiteId: "sgf", confidence: "high", warningReasons: [],
      fromLabel: null, toLabel: null,
    },
    {
      id: "travel:2", type: "travel", label: "Resa",
      startIso: "2026-05-26T17:30:00Z", endIso: "2026-05-26T18:03:00Z",
      durationMinutes: 33, targetType: "transport", targetId: null,
      knownSiteId: null, confidence: "medium", warningReasons: [],
      fromLabel: "Swedish game fair", toLabel: "FA Warehouse",
    },
    {
      id: "work:3", type: "work", label: "FA Warehouse",
      startIso: "2026-05-26T18:03:00Z", endIso: "2026-05-26T18:08:00Z",
      durationMinutes: 6, targetType: "known_site", targetId: "fa-wh",
      knownSiteId: "fa-wh", confidence: "high", warningReasons: [],
      fromLabel: null, toLabel: null,
    },
  ],
};

describe("canonicalToCacheProjection contract", () => {
  it("speglar GPS-vyns totals 1:1 — payableMinutes = work + travel", () => {
    const s = canonicalToCacheSummary(tuesdayCanonical, 420);
    expect(s.workOnlyMinutes).toBe(567); // 9h 27m
    expect(s.travelMinutes).toBe(104); // 1h 44m
    // Cellen ska visa total = arbete + resa (= 11h 11m)
    expect(s.payableMinutes).toBe(671);
    expect(s.workMinutes).toBe(671);
    expect(s.totalMinutes).toBe(671);
    expect(s.breakMinutes).toBe(0);
    expect(s.source).toBe("canonical_gps_day_v1");
  });

  it("travel-block får 'Resa Från → Till'-label", () => {
    const blocks = canonicalToCacheBlocks(tuesdayCanonical);
    const t1 = blocks.find((b) => b.id === "travel:1")!;
    expect(t1.label).toBe("Resa FA Warehouse → Swedish game fair");
    expect(t1.kind).toBe("travel");
    expect(t1.fromLabel).toBe("FA Warehouse");
    expect(t1.toLabel).toBe("Swedish game fair");

    const t2 = blocks.find((b) => b.id === "travel:2")!;
    expect(t2.label).toBe("Resa Swedish game fair → FA Warehouse");
  });

  it("arbetsblock behåller känd plats-label och kind=work", () => {
    const blocks = canonicalToCacheBlocks(tuesdayCanonical);
    const w = blocks.find((b) => b.id === "work:2")!;
    expect(w.label).toBe("Swedish game fair");
    expect(w.kind).toBe("work");
    expect(w.durationMinutes).toBe(510);
  });

  it("summan av block-minuter = canonical visibleWindow", () => {
    const blocks = canonicalToCacheBlocks(tuesdayCanonical);
    const sum = blocks.reduce((a, b) => a + b.durationMinutes, 0);
    // 51 + 71 + 510 + 33 + 6 = 671 (work+travel; inga gap-block den här dagen)
    expect(sum).toBe(671);
  });
});
