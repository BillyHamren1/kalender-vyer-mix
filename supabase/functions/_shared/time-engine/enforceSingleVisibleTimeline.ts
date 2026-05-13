/**
 * Time Engine — enforceSingleVisibleTimeline (Location Truth 1.7, del 2)
 * ======================================================================
 *
 * Pure helper. Tar `ReportBlock[]` från buildReportBlocksFromLocationTruth
 * och garanterar EN synlig tidslinje:
 *   - block[i].endAt <= block[i+1].startAt
 *   - inga sub-lanes / parallella block
 *   - starkare platsblock vinner överlapp
 *   - active timer synthetic / svaga block får aldrig dölja work
 *   - transport får inte ligga parallellt med work
 *
 * Mergeordning vid överlapp:
 *   1. Samma plats/context  → merge till ett block (union av tidsintervall)
 *   2. Olika typ:
 *      - work > transport > internal_movement > unknown > signal_gap > private
 *      - active_timer_synthetic-block (resolvedFrom='synthetic_active_timer')
 *        absorberas alltid av starkare block
 */

import type { ISODateTime } from './contracts.ts';
import type { ReportBlock } from './buildReportBlocksFromLocationTruth.ts';

const KIND_PRIORITY: Record<ReportBlock['kind'], number> = {
  work: 100,
  transport: 60,
  internal_movement: 40,
  private: 30,
  unknown: 20,
  signal_gap: 10,
};

export interface SingleTimelineDiagnostics {
  blocksBefore: number;
  blocksAfter: number;
  overlapsDetectedCount: number;
  overlapsResolvedCount: number;
  remainingOverlapsCount: number;
  examples: Array<{
    type: 'merged_same_place' | 'absorbed_weaker' | 'clamped_endAt' | 'remaining_overlap';
    a: { id: string; kind: ReportBlock['kind']; title: string; startAt: ISODateTime; endAt: ISODateTime };
    b: { id: string; kind: ReportBlock['kind']; title: string; startAt: ISODateTime; endAt: ISODateTime };
  }>;
}

function pushEx(diag: SingleTimelineDiagnostics, ex: SingleTimelineDiagnostics['examples'][number]) {
  if (diag.examples.length < 30) diag.examples.push(ex);
}

function samePlace(a: ReportBlock, b: ReportBlock): boolean {
  if (a.kind !== 'work' || b.kind !== 'work') return false;
  if (a.title.trim().toLowerCase() === b.title.trim().toLowerCase()) return true;
  return false;
}

function overlapMs(a: ReportBlock, b: ReportBlock): number {
  const aStart = Date.parse(a.startAt), aEnd = Date.parse(a.endAt);
  const bStart = Date.parse(b.startAt), bEnd = Date.parse(b.endAt);
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function enforceSingleVisibleTimeline(
  inputBlocks: ReportBlock[],
): { blocks: ReportBlock[]; diagnostics: SingleTimelineDiagnostics } {
  const sorted = inputBlocks.slice().sort((a, b) => {
    const sa = Date.parse(a.startAt), sb = Date.parse(b.startAt);
    if (sa !== sb) return sa - sb;
    return KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind];
  });

  const diag: SingleTimelineDiagnostics = {
    blocksBefore: inputBlocks.length,
    blocksAfter: 0,
    overlapsDetectedCount: 0,
    overlapsResolvedCount: 0,
    remainingOverlapsCount: 0,
    examples: [],
  };

  const out: ReportBlock[] = [];
  for (const block of sorted) {
    const last = out[out.length - 1];
    if (!last) { out.push({ ...block }); continue; }

    const ov = overlapMs(last, block);
    if (ov === 0 && Date.parse(last.endAt) <= Date.parse(block.startAt)) {
      out.push({ ...block });
      continue;
    }

    diag.overlapsDetectedCount += 1;

    // Same place → merge unionen (extend last.endAt).
    if (samePlace(last, block)) {
      const newEnd = new Date(Math.max(Date.parse(last.endAt), Date.parse(block.endAt))).toISOString();
      pushEx(diag, { type: 'merged_same_place',
        a: { id: last.id, kind: last.kind, title: last.title, startAt: last.startAt, endAt: last.endAt },
        b: { id: block.id, kind: block.kind, title: block.title, startAt: block.startAt, endAt: block.endAt }});
      last.endAt = newEnd;
      // Källor:
      last.sourceLocationTruthSegmentIds = Array.from(new Set([
        ...last.sourceLocationTruthSegmentIds, ...block.sourceLocationTruthSegmentIds,
      ]));
      last.sourceTransportSegmentIds = Array.from(new Set([
        ...last.sourceTransportSegmentIds, ...block.sourceTransportSegmentIds,
      ]));
      diag.overlapsResolvedCount += 1;
      continue;
    }

    // Olika typ — starkare prioritet vinner.
    const lastP = KIND_PRIORITY[last.kind];
    const blockP = KIND_PRIORITY[block.kind];

    // Synthetic active timer block (resolvedFrom='fallback' eller liknande
    // utan locationTruth-bevis) får aldrig vinna över work.
    const lastIsSyntheticTimer = last.kind === 'work' && last.resolvedFrom === 'fallback'
      && last.sourceLocationTruthSegmentIds.length === 0;
    const blockIsSyntheticTimer = block.kind === 'work' && block.resolvedFrom === 'fallback'
      && block.sourceLocationTruthSegmentIds.length === 0;

    if (blockIsSyntheticTimer && !lastIsSyntheticTimer) {
      // Absorbera helt — block försvinner.
      pushEx(diag, { type: 'absorbed_weaker',
        a: { id: last.id, kind: last.kind, title: last.title, startAt: last.startAt, endAt: last.endAt },
        b: { id: block.id, kind: block.kind, title: block.title, startAt: block.startAt, endAt: block.endAt }});
      diag.overlapsResolvedCount += 1;
      continue;
    }
    if (lastIsSyntheticTimer && !blockIsSyntheticTimer) {
      // Ersätt last.
      pushEx(diag, { type: 'absorbed_weaker',
        a: { id: block.id, kind: block.kind, title: block.title, startAt: block.startAt, endAt: block.endAt },
        b: { id: last.id, kind: last.kind, title: last.title, startAt: last.startAt, endAt: last.endAt }});
      out.pop();
      out.push({ ...block });
      diag.overlapsResolvedCount += 1;
      continue;
    }

    // Transport får inte ligga parallellt med work.
    if (last.kind === 'work' && block.kind === 'transport') {
      // Klipp transport så den börjar efter work.
      const clippedStart = last.endAt;
      if (Date.parse(clippedStart) >= Date.parse(block.endAt)) {
        // Transport helt inne i work → absorbera bort.
        pushEx(diag, { type: 'absorbed_weaker',
          a: { id: last.id, kind: last.kind, title: last.title, startAt: last.startAt, endAt: last.endAt },
          b: { id: block.id, kind: block.kind, title: block.title, startAt: block.startAt, endAt: block.endAt }});
        diag.overlapsResolvedCount += 1;
        continue;
      }
      pushEx(diag, { type: 'clamped_endAt',
        a: { id: last.id, kind: last.kind, title: last.title, startAt: last.startAt, endAt: last.endAt },
        b: { id: block.id, kind: block.kind, title: block.title, startAt: clippedStart, endAt: block.endAt }});
      out.push({ ...block, startAt: clippedStart });
      diag.overlapsResolvedCount += 1;
      continue;
    }

    // Generell prioritet: starkare vinner — klipp svagare.
    if (lastP >= blockP) {
      // Klipp block.startAt till last.endAt om möjligt.
      if (Date.parse(last.endAt) >= Date.parse(block.endAt)) {
        // block helt inne i last → absorbera.
        pushEx(diag, { type: 'absorbed_weaker',
          a: { id: last.id, kind: last.kind, title: last.title, startAt: last.startAt, endAt: last.endAt },
          b: { id: block.id, kind: block.kind, title: block.title, startAt: block.startAt, endAt: block.endAt }});
        diag.overlapsResolvedCount += 1;
        continue;
      }
      pushEx(diag, { type: 'clamped_endAt',
        a: { id: last.id, kind: last.kind, title: last.title, startAt: last.startAt, endAt: last.endAt },
        b: { id: block.id, kind: block.kind, title: block.title, startAt: last.endAt, endAt: block.endAt }});
      out.push({ ...block, startAt: last.endAt });
      diag.overlapsResolvedCount += 1;
      continue;
    } else {
      // block starkare — klipp last.endAt = block.startAt.
      pushEx(diag, { type: 'clamped_endAt',
        a: { id: last.id, kind: last.kind, title: last.title, startAt: last.startAt, endAt: block.startAt },
        b: { id: block.id, kind: block.kind, title: block.title, startAt: block.startAt, endAt: block.endAt }});
      last.endAt = block.startAt;
      out.push({ ...block });
      diag.overlapsResolvedCount += 1;
      continue;
    }
  }

  // Final invariant check.
  for (let i = 0; i + 1 < out.length; i++) {
    if (Date.parse(out[i].endAt) > Date.parse(out[i + 1].startAt)) {
      diag.remainingOverlapsCount += 1;
      pushEx(diag, { type: 'remaining_overlap',
        a: { id: out[i].id, kind: out[i].kind, title: out[i].title, startAt: out[i].startAt, endAt: out[i].endAt },
        b: { id: out[i+1].id, kind: out[i+1].kind, title: out[i+1].title, startAt: out[i+1].startAt, endAt: out[i+1].endAt }});
    }
  }

  diag.blocksAfter = out.length;
  return { blocks: out, diagnostics: diag };
}
