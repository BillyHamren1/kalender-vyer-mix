/**
 * Gantt visual pipeline (UI-only, pure).
 *
 * Generisk pipeline som kör merge → absorb på vilka GanttBlock-liknande
 * objekt som helst. Används av StaffGanttView för både V2/allocation/legacy
 * och av integrationstesterna.
 *
 * Pipeline: input → mergeContiguousBlocks → buildVisualGanttBlocks
 *   → returnera mergade block utökade med attachedChips + absorbedSourceIds.
 */

import {
  mergeContiguousBlocks,
  type MergeBlockInput,
  type MergeableKind,
} from './ganttBlockMerge';
import {
  buildVisualGanttBlocks,
  type GanttBlockLite,
  type GanttKindLite,
  type VisualGanttDiagnostics,
} from './visualGanttBlocks';

export interface PipelineBlock {
  id: string;
  kind: GanttKindLite;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  title?: string;
  subtitle?: string | null;
  sessionKey?: string;
  rawKind?: string;
  isOpen?: boolean;
  isNightGpsOnly?: boolean;
  // Genomgående metadata som inte påverkar pipelinen men måste bevaras
  targetType?: string | null;
  targetId?: string | null;
  address?: string | null;
  warnings?: string[];
  source?: 'displayTimelineV2' | 'workdayAllocation' | 'reportCandidate';
  meta?: Record<string, unknown>;
}

export interface PipelineResultBlock<T extends PipelineBlock> {
  block: T & {
    attachedChips?: string[];
    absorbedSourceIds?: string[];
  };
}

export interface ApplyGanttVisualPipelineResult<T extends PipelineBlock> {
  blocks: Array<T & { attachedChips?: string[]; absorbedSourceIds?: string[] }>;
  mergeDiagnostics: ReturnType<typeof mergeContiguousBlocks>['diagnostics'];
  visualDiagnostics: VisualGanttDiagnostics;
}

/**
 * Generisk visual pipeline. Bevarar all originalmetadata på blocken (targetType,
 * targetId, address, warnings, source, meta...) och lägger till chips +
 * absorbed ids.
 */
export function applyGanttVisualPipeline<T extends PipelineBlock>(
  blocks: readonly T[],
  options: { staffName?: string; maxMergeGapMinutes?: number } = {},
): ApplyGanttVisualPipelineResult<T> {
  if (blocks.length === 0) {
    return {
      blocks: [],
      mergeDiagnostics: {
        rawBlockCount: 0,
        visualBlockCount: 0,
        mergedBlockCount: 0,
        mergedExamples: [],
      },
      visualDiagnostics: {
        staffName: options.staffName,
        rawBlockCount: 0,
        visualBlockCount: 0,
        absorbedTransportCount: 0,
        absorbedReviewCount: 0,
        absorbedUnknownCount: 0,
        absorbedPreWorkCount: 0,
        hiddenPreWorkCount: 0,
        standaloneSecondaryCount: 0,
        lanePackedMainBlocksCount: 0,
        examples: [],
      },
    };
  }

  // 1) Merge
  const byOriginalId = new Map<string, T>();
  const mergeInput: MergeBlockInput[] = blocks.map((b) => {
    byOriginalId.set(b.id, b);
    return {
      id: b.id,
      kind: b.kind as MergeableKind,
      sessionKey: b.sessionKey ?? `block:${b.id}`,
      startAt: b.startAt,
      endAt: b.endAt,
      durationMinutes: b.durationMinutes,
      rawKind: b.rawKind,
      isOpen: b.isOpen,
      isNightGpsOnly: b.isNightGpsOnly,
    };
  });
  const { blocks: merged, diagnostics: mergeDiagnostics } = mergeContiguousBlocks(
    mergeInput,
    { maxGapMinutes: options.maxMergeGapMinutes ?? 15 },
  );

  // Rehydrera mergade block med originalets metadata (från första underblocket)
  const mergedHydrated: T[] = merged.map((m) => {
    const first = byOriginalId.get(m.mergedFromIds[0])!;
    return {
      ...first,
      id: m.id,
      kind: m.kind as GanttKindLite,
      startAt: m.startAt,
      endAt: m.endAt,
      durationMinutes: m.durationMinutes,
      sessionKey: m.sessionKey,
    } as T;
  });

  // 2) Visual absorb
  const litesById = new Map<string, T>(mergedHydrated.map((b) => [b.id, b]));
  const visual = buildVisualGanttBlocks(
    mergedHydrated.map<GanttBlockLite>((b) => ({
      id: b.id,
      kind: b.kind,
      startAt: b.startAt,
      endAt: b.endAt,
      durationMinutes: b.durationMinutes,
      title: b.title,
      subtitle: b.subtitle ?? null,
      sessionKey: b.sessionKey,
      isNightGpsOnly: b.isNightGpsOnly,
    })),
    { staffName: options.staffName },
  );

  const out = visual.blocks
    .map((v) => {
      const src = litesById.get(v.id);
      if (!src) return null;
      return {
        ...src,
        attachedChips: v.chips.length > 0 ? v.chips : undefined,
        absorbedSourceIds: v.attachedEvents.length > 0
          ? v.attachedEvents.map((a) => a.id)
          : undefined,
      };
    })
    .filter((b): b is T & { attachedChips?: string[]; absorbedSourceIds?: string[] } =>
      b !== null,
    );

  return {
    blocks: out,
    mergeDiagnostics,
    visualDiagnostics: visual.diagnostics,
  };
}
