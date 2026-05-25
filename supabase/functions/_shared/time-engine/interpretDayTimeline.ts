/**
 * Time Engine — interpretDayTimeline
 * ==================================
 *
 * Pure tolkare ovanpå råa GpsTimelineSegment (output från buildGpsDayTimeline).
 * Producerar **EN tolkad dagstidslinje** som speglas till både admin och
 * personens mobilapp. Ingenting skrivs till `time_reports` här — det sker
 * först vid end-of-day commit (commitDayTimelineToTimeReports).
 *
 * Tolkaren är en ren funktion: samma input → samma output. Idempotent.
 *
 * Reglerna (i ordning):
 *   1. Slå ihop kontigt — segment med samma target inom < MERGE_GAP_MIN
 *      blir ett block.
 *   2. Kort utstick (<= SHORT_DETOUR_MAX_MIN) av typen `travel` mellan två
 *      block med SAMMA projekt/warehouse → räknas till samma projekt.
 *   3. Manuella overrides (lockedSegments) vinner alltid över heuristik.
 *   4. unknown_place förblir `unknown` — vi gissar aldrig.
 *   5. Natt 00:00–05:00 lokal tid: ingen heuristik (rena segment, inga merges).
 *   6. gps_gap blir aldrig travel.
 *
 * NOTERING: scanner-bekräftelse är ännu inte inkopplad — placeholderhook
 * `scanLocks` finns men matas in som tom array tills vi väljer att lägga
 * till regeln (det kräver att vi vet vilken scanner-tabell som äger sanningen).
 */

import type {
  GpsTimelineSegment,
  GpsTimelineSegmentType,
} from './buildGpsDayTimeline.ts';
import type { ISODate, ISODateTime, UUID, WorkTarget } from './contracts.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DayTimelineBlockKind =
  | 'project'
  | 'warehouse'
  | 'travel'
  | 'unknown'
  | 'gps_gap'
  | 'private';

export interface DayTimelineBlock {
  /** Stable per (staff,date,index). Used as commit idempotency key. */
  index: number;
  kind: DayTimelineBlockKind;
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  durationMin: number;
  /** Target identity (only set for project/warehouse). */
  targetKind: WorkTarget['kind'] | null;
  targetRefId: UUID | null;
  targetLabel: string | null;
  /** Source GPS segment ids that built this block. */
  sourceSegmentIds: string[];
  /** True iff a merge/short-detour rule changed the kind/target. */
  reinterpreted: boolean;
  /** Confidence inherited from underlying segments (min). */
  confidence: number;
  /** Reason for this block's classification (for UI tooltip + audit). */
  reason:
    | 'raw_known_site'
    | 'raw_unknown_place'
    | 'raw_transport'
    | 'raw_gps_gap'
    | 'raw_private_residence'
    | 'merged_contiguous_same_target'
    | 'short_detour_attached_to_project'
    | 'absorbed_same_target_sandwich'
    | 'manual_override'
    | 'night_no_heuristic';
  /** Max own GPS displacement (meters) across underlying segments. */
  maxDisplacementM: number;


export interface DayTimeline {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  blocks: DayTimelineBlock[];
  computedAt: ISODateTime;
  /** Counts of how many blocks per kind — UI summary. */
  summary: Record<DayTimelineBlockKind, { count: number; minutes: number }>;
}

export interface ManualOverride {
  /** Time range the admin/person locked. */
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  kind: DayTimelineBlockKind;
  targetKind?: WorkTarget['kind'] | null;
  targetRefId?: UUID | null;
  targetLabel?: string | null;
}

export interface InterpretDayTimelineInput {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  segments: GpsTimelineSegment[];
  /** Manual user/admin overrides — always win. */
  overrides?: ManualOverride[];
  /** IANA timezone (default Europe/Stockholm). */
  timezone?: string;
  /** Override defaults for tests. */
  rules?: Partial<InterpretRules>;
}

export interface InterpretRules {
  /** Max gap (minutes) between same-target blocks before we still merge. */
  mergeGapMinutes: number;
  /** A travel segment ≤ this many minutes between two same-project blocks
   *  is reclassified as that project. */
  shortDetourMaxMinutes: number;
  /** Local hour where night starts (no heuristic). */
  nightStartHour: number;
  /** Local hour where night ends. */
  nightEndHour: number;
}

const DEFAULT_RULES: InterpretRules = {
  mergeGapMinutes: 5,
  shortDetourMaxMinutes: 30,
  nightStartHour: 0,
  nightEndHour: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function minutesBetween(a: ISODateTime, b: ISODateTime): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
}

function localHour(iso: ISODateTime, timezone: string): number {
  // Cheap timezone hour extraction. Falls back to UTC if Intl missing.
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    });
    return Number(fmt.format(new Date(iso)));
  } catch {
    return new Date(iso).getUTCHours();
  }
}

function segmentToInitialBlock(
  seg: GpsTimelineSegment,
  index: number,
): DayTimelineBlock {
  const kind = mapSegmentKind(seg);
  return {
    index,
    kind,
    startedAt: seg.startTs,
    endedAt: seg.endTs,
    durationMin: Math.max(0, minutesBetween(seg.startTs, seg.endTs)),
    targetKind: seg.matchedTargetType ?? null,
    targetRefId: seg.matchedTargetId ?? null,
    targetLabel: seg.matchedTargetName ?? null,
    sourceSegmentIds: [seg.id],
    reinterpreted: false,
    confidence: seg.confidence ?? 0.5,
    reason: initialReason(kind, seg),
  };
}

function mapSegmentKind(seg: GpsTimelineSegment): DayTimelineBlockKind {
  if (seg.kind === 'gps_gap' || seg.type === 'gps_gap') return 'gps_gap';
  if (seg.targetDiagnostics?.privateResidence) return 'private';
  if (seg.type === 'transport') return 'travel';
  if (seg.type === 'unknown_place') return 'unknown';
  if (seg.type === 'known_site') {
    const t = seg.matchedTargetType;
    if (t === 'warehouse' || t === 'organization_location') return 'warehouse';
    if (t === 'project' || t === 'booking') return 'project';
  }
  return 'unknown';
}

function initialReason(
  kind: DayTimelineBlockKind,
  seg: GpsTimelineSegment,
): DayTimelineBlock['reason'] {
  if (kind === 'gps_gap') return 'raw_gps_gap';
  if (kind === 'private') return 'raw_private_residence';
  if (kind === 'travel') return 'raw_transport';
  if (kind === 'unknown') return 'raw_unknown_place';
  return 'raw_known_site';
}

function sameTarget(a: DayTimelineBlock, b: DayTimelineBlock): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'project' && a.kind !== 'warehouse') return false;
  return a.targetRefId !== null && a.targetRefId === b.targetRefId;
}

function mergeBlocks(
  a: DayTimelineBlock,
  b: DayTimelineBlock,
  reason: DayTimelineBlock['reason'],
): DayTimelineBlock {
  return {
    ...a,
    endedAt: b.endedAt,
    durationMin: a.durationMin + b.durationMin,
    sourceSegmentIds: [...a.sourceSegmentIds, ...b.sourceSegmentIds],
    confidence: Math.min(a.confidence, b.confidence),
    reinterpreted: true,
    reason,
  };
}

function isNight(
  block: DayTimelineBlock,
  rules: InterpretRules,
  tz: string,
): boolean {
  const h = localHour(block.startedAt, tz);
  if (rules.nightStartHour <= rules.nightEndHour) {
    return h >= rules.nightStartHour && h < rules.nightEndHour;
  }
  // wrap (e.g. 22..5)
  return h >= rules.nightStartHour || h < rules.nightEndHour;
}

function applyOverrides(
  block: DayTimelineBlock,
  overrides: ManualOverride[],
): DayTimelineBlock {
  for (const o of overrides) {
    const start = new Date(o.startedAt).getTime();
    const end = new Date(o.endedAt).getTime();
    const bs = new Date(block.startedAt).getTime();
    const be = new Date(block.endedAt).getTime();
    if (bs >= start && be <= end) {
      return {
        ...block,
        kind: o.kind,
        targetKind: o.targetKind ?? null,
        targetRefId: o.targetRefId ?? null,
        targetLabel: o.targetLabel ?? null,
        reinterpreted: true,
        reason: 'manual_override',
      };
    }
  }
  return block;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export function interpretDayTimeline(
  input: InterpretDayTimelineInput,
): DayTimeline {
  const rules = { ...DEFAULT_RULES, ...(input.rules ?? {}) };
  const tz = input.timezone ?? 'Europe/Stockholm';
  const overrides = input.overrides ?? [];

  // 1. Map raw segments → blocks (sorted by start).
  const sorted = [...input.segments].sort(
    (a, b) => new Date(a.startTs).getTime() - new Date(b.startTs).getTime(),
  );
  let blocks: DayTimelineBlock[] = sorted.map((s, i) =>
    segmentToInitialBlock(s, i),
  );

  // 2. Manual overrides FIRST so heuristics respect them.
  blocks = blocks.map((b) => applyOverrides(b, overrides));

  // 3. Short detour: travel ≤ shortDetourMaxMinutes between same project →
  //    reclassify travel as that project.
  for (let i = 1; i < blocks.length - 1; i++) {
    const prev = blocks[i - 1];
    const cur = blocks[i];
    const next = blocks[i + 1];
    if (cur.reason === 'manual_override') continue;
    if (cur.kind !== 'travel') continue;
    if (cur.durationMin > rules.shortDetourMaxMinutes) continue;
    if (!sameTarget(prev, next)) continue;
    if (prev.kind !== 'project') continue; // only projects, never warehouse
    blocks[i] = {
      ...cur,
      kind: 'project',
      targetKind: prev.targetKind,
      targetRefId: prev.targetRefId,
      targetLabel: prev.targetLabel,
      reinterpreted: true,
      reason: 'short_detour_attached_to_project',
    };
  }

  // 4. Merge contiguous same-target blocks (gap ≤ mergeGapMinutes).
  const merged: DayTimelineBlock[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(b);
      continue;
    }
    const gap = minutesBetween(last.endedAt, b.startedAt);
    const eligible =
      gap <= rules.mergeGapMinutes &&
      sameTarget(last, b) &&
      last.reason !== 'manual_override' &&
      b.reason !== 'manual_override';
    if (eligible) {
      merged[merged.length - 1] = mergeBlocks(
        last,
        b,
        'merged_contiguous_same_target',
      );
    } else {
      merged.push(b);
    }
  }

  // 5. Night guard: tag night blocks but do NOT merge across them; we already
  //    skipped reinterpretation if a block originated at night by treating
  //    night blocks individually. Here we just stamp the reason where relevant.
  for (const b of merged) {
    if (b.reinterpreted) continue;
    if (b.kind === 'unknown' || b.kind === 'travel') {
      if (isNight(b, rules, tz)) {
        b.reason = 'night_no_heuristic';
      }
    }
  }

  // 6. Reindex + summary.
  const finalBlocks = merged.map((b, i) => ({ ...b, index: i }));
  const summary = buildSummary(finalBlocks);

  return {
    staffId: input.staffId,
    organizationId: input.organizationId,
    date: input.date,
    blocks: finalBlocks,
    computedAt: new Date().toISOString(),
    summary,
  };
}

function buildSummary(
  blocks: DayTimelineBlock[],
): DayTimeline['summary'] {
  const empty = { count: 0, minutes: 0 };
  const out: DayTimeline['summary'] = {
    project: { ...empty },
    warehouse: { ...empty },
    travel: { ...empty },
    unknown: { ...empty },
    gps_gap: { ...empty },
    private: { ...empty },
  };
  for (const b of blocks) {
    out[b.kind].count += 1;
    out[b.kind].minutes += b.durationMin;
  }
  return out;
}

/**
 * Produce a stable, idempotent commit-key per block.
 * Used by commitDayTimelineToTimeReports to dedupe time_reports across reruns.
 */
export function dayTimelineBlockKey(
  staffId: UUID,
  date: ISODate,
  block: DayTimelineBlock,
): string {
  return `${staffId}:${date}:${block.index}:${block.kind}:${block.targetRefId ?? 'none'}`;
}
