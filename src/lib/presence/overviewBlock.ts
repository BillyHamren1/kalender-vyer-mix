/**
 * OverviewBlock — kanonisk modell för Dagöversikten.
 *
 * Speglar formatet som framtida tidrapportförslag (review-suggestions) kommer att
 * producera per personal/dag. Renderingsskiktet ska bara läsa OverviewBlock,
 * aldrig de råa timeline-typerna.
 *
 * Renderingsregler för reviewState:
 *  - "ok"          → inget extra
 *  - "needs_review"→ liten "Granska"-badge
 *  - "signal_issue"→ liten signalikon
 *  - "ignored"     → blocket göms eller tonas ned
 *
 * Plus konvention: kind === "unknown" visar "Okänd plats" i UI.
 */

export type OverviewBlockKind =
  | "work_site"
  | "transport"
  | "unknown"
  | "signal_gap"
  | "timer";

export type OverviewReviewState =
  | "ok"
  | "needs_review"
  | "signal_issue"
  | "ignored";

export type OverviewTargetType =
  | "project"
  | "large_project"
  | "booking"
  | "location"
  | "warehouse"
  | "unknown";

export interface OverviewBlock {
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD

  kind: OverviewBlockKind;

  startAt: string;            // ISO
  endAt: string | null;       // ISO (null endast för punkt-event som timer-marker)
  durationMinutes: number;
  durationLabel: string;

  title: string;              // huvudtext, t.ex. "FA Warehouse" eller "Transport"
  subtitle: string | null;    // sekundär text, t.ex. "→ Westmans Uthyrning"

  targetType: OverviewTargetType;
  targetId: string | null;
  targetLabel: string | null;

  fromLabel: string | null;
  toLabel: string | null;

  confidence: number | null;  // 0–1 om vi har det
  reviewState: OverviewReviewState;

  // Diagnostik som "Visa tekniska detaljer" kan rendera
  meta?: {
    inlineGapMinutes?: number;
    sourceType?: string;
    [k: string]: unknown;
  };
}

// ---------- Adapter från presence-day timeline ----------

interface RawBlock {
  at: string;
  endAt?: string | null;
  durationMin?: number | null;
  type: string;
  label: string;
  // ev. extra fält finns men vi rör dem inte här
  [k: string]: unknown;
}

const fmtDur = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
};

const presenceLike = (b: RawBlock | undefined) =>
  !!b && (b.type === "smoothed_presence" || b.type === "unknown_place");

/**
 * Bygg OverviewBlock[] från presence-day timeline-rader.
 * Renderingsskiktet ska använda detta i stället för råa rader.
 */
export function toOverviewBlocks(
  staffId: string,
  staffName: string,
  date: string,
  rawBlocks: RawBlock[],
): OverviewBlock[] {
  const main = rawBlocks
    .filter((b) =>
      ["smoothed_presence", "transport", "unknown_place", "gps_gap"].includes(b.type),
    )
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Pre-pass: mät inline-gap-minuter per presenceblock-index
  const inlineGapByIdx = new Map<number, number>();
  const standaloneGap = new Set<number>();
  for (let i = 0; i < main.length; i++) {
    const b = main[i];
    if (b.type !== "gps_gap") continue;
    let prevIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (main[j].type !== "gps_gap") { prevIdx = j; break; }
    }
    let nextIdx = -1;
    for (let j = i + 1; j < main.length; j++) {
      if (main[j].type !== "gps_gap") { nextIdx = j; break; }
    }
    const prev = prevIdx >= 0 ? main[prevIdx] : undefined;
    const next = nextIdx >= 0 ? main[nextIdx] : undefined;
    const samePlace =
      presenceLike(prev) && presenceLike(next) && prev!.label === next!.label;
    if (samePlace && prevIdx >= 0) {
      const dur = b.durationMin ?? 0;
      inlineGapByIdx.set(prevIdx, (inlineGapByIdx.get(prevIdx) ?? 0) + dur);
    } else {
      standaloneGap.add(i);
    }
  }

  const out: OverviewBlock[] = [];

  for (let i = 0; i < main.length; i++) {
    const b = main[i];
    const dur = b.durationMin ?? Math.max(
      0,
      b.endAt ? Math.round((new Date(b.endAt).getTime() - new Date(b.at).getTime()) / 60000) : 0,
    );

    // base shape
    const base: Omit<OverviewBlock, "kind" | "title" | "subtitle" | "targetType" | "fromLabel" | "toLabel" | "reviewState"> = {
      staffId,
      staffName,
      date,
      startAt: b.at,
      endAt: b.endAt ?? null,
      durationMinutes: dur,
      durationLabel: fmtDur(dur),
      targetId: (b as any).targetId ?? null,
      targetLabel: b.label ?? null,
      confidence: typeof (b as any).confidence === "number" ? (b as any).confidence : null,
      meta: { sourceType: b.type },
    };

    if (b.type === "smoothed_presence") {
      const inlineGap = inlineGapByIdx.get(i) ?? 0;
      out.push({
        ...base,
        kind: "work_site",
        title: b.label || "På plats",
        subtitle: null,
        targetType: ((b as any).targetType as OverviewTargetType) ?? "unknown",
        fromLabel: null,
        toLabel: null,
        reviewState: inlineGap > 0 ? "signal_issue" : "ok",
        meta: { ...base.meta, inlineGapMinutes: inlineGap || undefined },
      });
    } else if (b.type === "transport") {
      let prev: RawBlock | undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (presenceLike(main[j])) { prev = main[j]; break; }
      }
      let next: RawBlock | undefined;
      for (let j = i + 1; j < main.length; j++) {
        if (presenceLike(main[j])) { next = main[j]; break; }
      }
      const fromLabel = prev?.label ?? null;
      const toLabel = next?.label ?? null;
      out.push({
        ...base,
        kind: "transport",
        title: "Transport",
        subtitle: fromLabel && toLabel
          ? `${fromLabel} → ${toLabel}`
          : toLabel
            ? `→ ${toLabel}`
            : fromLabel
              ? `${fromLabel} →`
              : null,
        targetType: "unknown",
        targetLabel: null,
        fromLabel,
        toLabel,
        reviewState: "ok",
      });
    } else if (b.type === "unknown_place") {
      out.push({
        ...base,
        kind: "unknown",
        title: "Okänd plats",
        subtitle: null,
        targetType: "unknown",
        targetLabel: null,
        fromLabel: null,
        toLabel: null,
        reviewState: "needs_review",
      });
    } else if (b.type === "gps_gap") {
      if (!standaloneGap.has(i)) continue; // gömt — det räknas på presence-blocket istället
      out.push({
        ...base,
        kind: "signal_gap",
        title: "Signal saknas",
        subtitle: null,
        targetType: "unknown",
        targetLabel: null,
        fromLabel: null,
        toLabel: null,
        reviewState: "signal_issue",
      });
    }
  }

  // Timer markers (punkt-event)
  for (const b of rawBlocks) {
    if (b.type !== "active_timer_started" && b.type !== "active_timer_stopped") continue;
    out.push({
      staffId,
      staffName,
      date,
      kind: "timer",
      startAt: b.at,
      endAt: b.endAt ?? null,
      durationMinutes: 0,
      durationLabel: "",
      title: b.type === "active_timer_started" ? "Timer startad" : "Timer stoppad",
      subtitle: b.label ?? null,
      targetType: ((b as any).targetType as OverviewTargetType) ?? "unknown",
      targetId: (b as any).targetId ?? null,
      targetLabel: b.label ?? null,
      fromLabel: null,
      toLabel: null,
      confidence: null,
      reviewState: "ok",
      meta: { sourceType: b.type },
    });
  }

  return out;
}
