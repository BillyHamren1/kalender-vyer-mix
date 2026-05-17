/**
 * Visual merge för Staff Gantt — slår ihop adjacent block med samma
 * resolved visualKind och samma sessionKey till ETT block. Pure helper,
 * inga fas/regel-beslut: litar på att kallaren redan kört phase
 * inheritance och satt slutgiltig visualKind på varje block.
 *
 * Pipeline:
 *   raw → phase inheritance → assign visualKind → mergeContiguousBlocks → render
 */

export type MergeableKind =
  | 'work'
  | 'warehouse'
  | 'rig'
  | 'rigdown'
  | 'transport'
  | 'review'
  | 'unknown'
  | 'break'
  | 'pre_work';

/** Endast dessa fyra slås ihop. transport/review/unknown/break/pre_work står stilla. */
const MERGEABLE: ReadonlySet<MergeableKind> = new Set([
  'work',
  'warehouse',
  'rig',
  'rigdown',
]);

export interface MergeBlockInput {
  id: string;
  /** Resolved visual kind efter phase inheritance. Merge tittar bara på detta. */
  kind: MergeableKind;
  /** Stabil sessionKey (booking#:NNNN > target:id > title-fallback). */
  sessionKey: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  /** Raw engine kind (innan phase inheritance) — bara för diagnostics. */
  rawKind?: string;
  isOpen?: boolean;
  isNightGpsOnly?: boolean;
}

export interface MergedBlockExtras {
  /** id:n från alla originalblock som ingår. Innehåller minst ett. */
  mergedFromIds: string[];
  /** sum(originalDurations) — räknad arbetstid. */
  countedDurationMinutes: number;
  /** sum(gaps mellan originalblocken). */
  visualGapMinutes: number;
  /** Originalblockens raw kind i ordning (för tooltip). */
  rawKinds: string[];
  /** Originalblockens resolved visualKind i ordning. */
  resolvedKinds: MergeableKind[];
  /** Underblock i ordning för senare drawer/tooltip. */
  subBlocks: Array<{
    id: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    rawKind?: string;
    resolvedKind: MergeableKind;
  }>;
}

export interface MergeOptions {
  /** Default 15. Block med större glapp slås inte ihop. */
  maxGapMinutes?: number;
}

export interface MergeDiagnostics {
  rawBlockCount: number;
  visualBlockCount: number;
  /** Antal originalblock som konsumerades av en merge (input − output). */
  mergedBlockCount: number;
  mergedExamples: Array<{
    sessionKey: string;
    rawKinds: string[];
    resolvedKinds: MergeableKind[];
    startBefore: string[];
    endBefore: string[];
    finalStart: string;
    finalEnd: string;
    summedDurationMinutes: number;
    visualGapMinutes: number;
    reason: 'same_session_same_visual_kind_within_gap';
  }>;
}

const ms = (iso: string) => new Date(iso).getTime();

const canMergePair = (
  prev: MergeBlockInput,
  next: MergeBlockInput,
  maxGapMs: number,
): boolean => {
  if (!MERGEABLE.has(prev.kind) || !MERGEABLE.has(next.kind)) return false;
  // "Två block av samma typ bredvid varandra ska alltid mergas" — vi tittar
  // bara på visualKind, inte på sessionKey/bokning. Två rigg-block intill
  // varandra ska bli ett, även om de tillhör olika bokningar.
  // 'work' och 'rig' renderas identiskt → behandlas som samma typ vid merge.
  const normKind = (k: MergeableKind): MergeableKind => (k === 'work' ? 'rig' : k);
  if (normKind(prev.kind) !== normKind(next.kind)) return false;
  if (prev.isNightGpsOnly || next.isNightGpsOnly) return false;
  if ((prev.isOpen ?? false) !== (next.isOpen ?? false)) return false;
  const gap = ms(next.startAt) - ms(prev.endAt);
  if (!Number.isFinite(gap)) return false;
  if (gap < 0) return false; // overlap → låt enforceSingleVisibleTimeline hantera
  if (gap > maxGapMs) return false;
  return true;
};

interface InternalMerged extends MergeBlockInput, MergedBlockExtras {}

const seedMerged = (b: MergeBlockInput): InternalMerged => ({
  ...b,
  mergedFromIds: [b.id],
  countedDurationMinutes: b.durationMinutes,
  visualGapMinutes: 0,
  rawKinds: [b.rawKind ?? b.kind],
  resolvedKinds: [b.kind],
  subBlocks: [
    {
      id: b.id,
      startAt: b.startAt,
      endAt: b.endAt,
      durationMinutes: b.durationMinutes,
      rawKind: b.rawKind,
      resolvedKind: b.kind,
    },
  ],
});

const fold = (acc: InternalMerged, next: MergeBlockInput): InternalMerged => {
  const gapMin = Math.max(0, Math.round((ms(next.startAt) - ms(acc.endAt)) / 60000));
  const finalEnd = ms(next.endAt) > ms(acc.endAt) ? next.endAt : acc.endAt;
  return {
    ...acc,
    endAt: finalEnd,
    durationMinutes: acc.countedDurationMinutes + next.durationMinutes,
    countedDurationMinutes: acc.countedDurationMinutes + next.durationMinutes,
    visualGapMinutes: acc.visualGapMinutes + gapMin,
    mergedFromIds: [...acc.mergedFromIds, next.id],
    rawKinds: [...acc.rawKinds, next.rawKind ?? next.kind],
    resolvedKinds: [...acc.resolvedKinds, next.kind],
    subBlocks: [
      ...acc.subBlocks,
      {
        id: next.id,
        startAt: next.startAt,
        endAt: next.endAt,
        durationMinutes: next.durationMinutes,
        rawKind: next.rawKind,
        resolvedKind: next.kind,
      },
    ],
  };
};

export interface MergeResult {
  blocks: Array<MergeBlockInput & MergedBlockExtras & { id: string }>;
  diagnostics: MergeDiagnostics;
}

/**
 * Slår ihop adjacent block enligt reglerna ovan. Stabil ordning på input
 * (sorteras på startAt internt). Mergeas iterativt så tre+ block i rad blir ett.
 */
export function mergeContiguousBlocks(
  input: MergeBlockInput[],
  opts?: MergeOptions,
): MergeResult {
  const maxGapMs = (opts?.maxGapMinutes ?? 60) * 60_000;
  const sorted = [...input].sort((a, b) => ms(a.startAt) - ms(b.startAt));

  const out: InternalMerged[] = [];
  const examples: MergeDiagnostics['mergedExamples'] = [];

  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && canMergePair(last, b, maxGapMs)) {
      const merged = fold(last, b);
      out[out.length - 1] = merged;
    } else {
      out.push(seedMerged(b));
    }
  }

  // Bygg diagnostics-exempel för verkliga merges
  for (const m of out) {
    if (m.mergedFromIds.length > 1 && examples.length < 5) {
      examples.push({
        sessionKey: m.sessionKey,
        rawKinds: m.rawKinds,
        resolvedKinds: m.resolvedKinds,
        startBefore: m.subBlocks.map((s) => s.startAt),
        endBefore: m.subBlocks.map((s) => s.endAt),
        finalStart: m.startAt,
        finalEnd: m.endAt,
        summedDurationMinutes: m.countedDurationMinutes,
        visualGapMinutes: m.visualGapMinutes,
        reason: 'same_session_same_visual_kind_within_gap',
      });
    }
  }

  // mergedBlockCount = antal originalblock som konsumerades (input.length - out.length)
  const mergedBlockCount = sorted.length - out.length;

  // Splitta tillbaka till id (med "+merged"-suffix för flerblocks-grupper)
  const blocks = out.map((m) => ({
    ...m,
    id: m.mergedFromIds.length > 1 ? `${m.mergedFromIds[0]}+merged` : m.id,
  }));

  return {
    blocks,
    diagnostics: {
      rawBlockCount: sorted.length,
      visualBlockCount: out.length,
      mergedBlockCount,
      mergedExamples: examples,
    },
  };
}
