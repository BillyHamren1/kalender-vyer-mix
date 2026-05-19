/**
 * buildStaffGanttMirrorBlocks — delad helper som producerar EXAKT samma
 * GanttBlock[] som `/staff-management/time-reports` (StaffGanttView) renderar
 * för en given personal+dag.
 *
 * Mobilen kallar denna helper direkt mot `get-staff-presence-day`-svaret för
 * inloggad personal+datum så att mobil-tidslinjen blir bit-för-bit identisk
 * med admin-Gantten — samma källval, samma fas-färgning, samma absorberade
 * chips, samma rubriker/tider.
 *
 * Helpern är pure: inga DB-anrop, inga side-effects. Tar engine-response +
 * phase-maps som input.
 *
 * OBS: Den enda admin-vägen vi INTE replikerar 1:1 är den "tunga" legacy-
 * loopen i `blocksFromStaff` som använder `staff.actualModel` /
 * `resolveActualLocationTargetForBlock` + nattguard. Den körs bara när
 * `buildSuggestedDisplayBlocksForAdminGantt` returnerar tomt, vilket aldrig
 * sker när motorn har producerat synliga block (work/transport/unknown/
 * needs_review). Det är det normala fallet — och därför det vi speglar här.
 * Edge case-fall där admin-vägen extra-namnger okända block via planning-
 * fallback rör bara block-titeln, aldrig tider eller block-antal.
 */
import {
  applyPlanningPhaseToGanttBlocks,
  buildSessionPhaseMap,
  resolveBookingPhaseFromTitle,
  resolveGanttPhaseKind,
  sessionKeyForBlock,
  type SessionPhaseKind,
} from '@/lib/staff/ganttPhaseColor';
import {
  mapDisplayTimelineBlocksToGantt,
  mapWorkdayAllocationSegmentsToGantt,
  selectGanttSourceFromMapped,
  sessionKeyFromTimelineBlock,
  type GanttBlockFromTimeline,
  type GanttBlockSource,
} from '@/lib/staff/displayTimelineToGanttBlocks';
import { applyGanttVisualPipeline, type PipelineBlock } from '@/lib/staff/ganttVisualPipeline';
import { mergeContiguousBlocks, type MergeBlockInput, type MergeableKind } from '@/lib/staff/ganttBlockMerge';
import { buildSuggestedDisplayBlocksForAdminGantt } from '@/lib/staff/reportCandidateGanttParity';
import type { ReportCandidateBlockUI } from '@/components/staff/ReportCandidateTimeline';

// ── Lokal kopia av Gantt-typerna (StaffGanttView exporterar inte sina) ──
//
// Vi håller dem strukturellt identiska med StaffGanttView.GanttBlock så att
// båda renderarna kan dela samma data utan castning. Field-kontraktet är
// låst av tester (se src/test/staffGanttMirrorParity.contract.test.ts).
export type GanttKind =
  | 'work'
  | 'transport'
  | 'review'
  | 'unknown'
  | 'break'
  | 'rig'
  | 'rigdown'
  | 'warehouse'
  | 'pre_work';

export interface MirrorGanttBlock {
  id: string;
  kind: GanttKind;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  title: string;
  subtitle?: string | null;
  isOpen?: boolean;
  plannedBadgeLabel?: string | null;
  isNightGpsOnly?: boolean;
  sessionKey?: string;
  rawKind?: string;
  subBlocks?: Array<{
    id: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    rawKind?: string;
    resolvedKind: GanttKind;
  }>;
  countedDurationMinutes?: number;
  visualGapMinutes?: number;
  attachedChips?: string[];
  absorbedSourceIds?: string[];
  targetType?: string | null;
  targetId?: string | null;
  address?: string | null;
  warnings?: string[];
  source?: GanttBlockSource;
  meta?: Record<string, unknown>;
  reportCandidateBlock?: ReportCandidateBlockUI;
}

export interface BuildStaffGanttMirrorInput {
  staffName: string;
  dateStr: string;
  /** Råa fält från `get-staff-presence-day`-responsen. */
  presenceDay: {
    reportCandidateBlocks?: any[] | null;
    displayTimelineBlocksV2?: any[] | null;
    workdayAllocationSegments?: any[] | null;
    presenceBlocks?: any[] | null;
    targets?: any[] | null;
  };
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>;
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>;
}

export interface BuildStaffGanttMirrorResult {
  blocks: MirrorGanttBlock[];
  source: GanttBlockSource | 'none';
  counts: {
    rawV2: number;
    mappedV2: number;
    rawAlloc: number;
    mappedAlloc: number;
    legacy: number;
    rendered: number;
  };
}

const detectPhaseFromText = (
  title?: string | null,
  subtitle?: string | null,
): 'rig' | 'rigdown' | null => {
  const s = `${title ?? ''} ${subtitle ?? ''}`.toLowerCase();
  if (/\brigdown\b|rigga\s*ner|nedrigg|rig\s*ner|rig-?ner/.test(s)) return 'rigdown';
  if (/\brigg?\b|rigday|rigg?dag|bygg(?!nad)/.test(s)) return 'rig';
  return null;
};

const isWarehouseTarget = (b: { title?: string | null; subtitle?: string | null; targetLabel?: string | null }) => {
  const hay = `${b.title ?? ''} ${b.subtitle ?? ''} ${b.targetLabel ?? ''}`.toLowerCase();
  return /\b(lager|warehouse)\b/.test(hay);
};

const resolveBlockPhaseDirect = (
  b: ReportCandidateBlockUI,
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
): SessionPhaseKind | null => {
  const phaseKind = resolveGanttPhaseKind({
    targetType: b.targetType,
    targetId: b.targetId,
    bookingPhaseByDate,
    largeProjectPhaseByDate,
  });
  if (phaseKind === 'rig' || phaseKind === 'rigdown') return phaseKind;
  if (phaseKind === 'work') return 'work';
  const fromTitle = resolveBookingPhaseFromTitle(b, bookingPhaseByDate);
  if (fromTitle === 'rig' || fromTitle === 'rigdown') return fromTitle;
  const phase = detectPhaseFromText(b.title, b.subtitle);
  if (phase) return phase;
  return null;
};

const mapReportCandidateKind = (
  b: ReportCandidateBlockUI,
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  sessionPhaseMap?: Record<string, SessionPhaseKind>,
): GanttKind => {
  if (b.kind === 'work') {
    if ((b as any).reviewState === 'needs_review') return 'review';
    if (isWarehouseTarget(b as any)) return 'warehouse';
    const direct = resolveBlockPhaseDirect(b, bookingPhaseByDate, largeProjectPhaseByDate);
    if (direct === 'rig' || direct === 'rigdown') return direct;
    if (sessionPhaseMap) {
      const sessionPhase = sessionPhaseMap[sessionKeyForBlock(b)];
      if (sessionPhase === 'rig' || sessionPhase === 'rigdown') return sessionPhase;
    }
    return 'work';
  }
  if (b.kind === 'transport') return 'transport';
  if (b.kind === 'needs_review') return 'review';
  if (b.kind === 'unknown') return 'unknown';
  if ((b as any).kind === 'break') return 'break';
  return 'unknown';
};

const MERGEABLE_KINDS: ReadonlySet<GanttKind> = new Set([
  'work', 'warehouse', 'rig', 'rigdown',
]);

const applyVisualMerge = (blocks: MirrorGanttBlock[]): MirrorGanttBlock[] => {
  const byId = new Map<string, MirrorGanttBlock>();
  const mergeInput: MergeBlockInput[] = blocks.map((b) => {
    byId.set(b.id, b);
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
  const { blocks: merged } = mergeContiguousBlocks(mergeInput, { maxGapMinutes: 15 });
  const result: MirrorGanttBlock[] = merged.map((m) => {
    const first = byId.get(m.mergedFromIds[0])!;
    return {
      ...first,
      id: m.id,
      kind: m.kind as GanttKind,
      startAt: m.startAt,
      endAt: m.endAt,
      durationMinutes: m.durationMinutes,
      sessionKey: m.sessionKey,
      rawKind: m.rawKind,
      subBlocks: m.subBlocks.map((s) => ({ ...s, resolvedKind: s.resolvedKind as GanttKind })),
      countedDurationMinutes: m.countedDurationMinutes,
      visualGapMinutes: m.visualGapMinutes,
    };
  });
  return result.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
};

const timelineBlockToGanttBlock = (b: GanttBlockFromTimeline): MirrorGanttBlock => ({
  id: b.id,
  kind: b.kind as GanttKind,
  startAt: b.startAt,
  endAt: b.endAt,
  durationMinutes: b.durationMinutes,
  title: b.title,
  subtitle: b.subtitle ?? null,
  rawKind:
    (b.meta && (b.meta.displayType as string)) ||
    (b.meta && (b.meta.allocationType as string)) ||
    undefined,
  sessionKey: sessionKeyFromTimelineBlock(b),
  targetType: b.targetType,
  targetId: b.targetId,
  address: b.address,
  warnings: b.warnings,
  source: b.source,
  meta: b.meta,
});

const runVisualPipeline = (blocks: MirrorGanttBlock[], staffName: string): MirrorGanttBlock[] => {
  if (blocks.length === 0) return [];
  const { blocks: out } = applyGanttVisualPipeline<MirrorGanttBlock & PipelineBlock>(
    blocks as Array<MirrorGanttBlock & PipelineBlock>,
    { staffName, maxMergeGapMinutes: 15 },
  );
  return out as MirrorGanttBlock[];
};

// ── ReportCandidate-vägen (samma som StaffGanttView blocksFromStaff
//    parity-grenen) ──────────────────────────────────────────────────────
const buildReportCandidateBlocks = (
  candidate: ReportCandidateBlockUI[],
  presenceBlocks: any[],
  targets: any[],
  staffName: string,
  dateStr: string,
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
): MirrorGanttBlock[] => {
  // Time Engine 4.x — filtrera bort UI-suppressade block (open_day_signal_gap,
  // pre_first_gps_signal_gap, short_onsite_anchor_noise) innan parity-bygget.
  // De ligger kvar i cache/diagnostics men ska aldrig renderas i Gantt.
  const visibleCandidate = candidate.filter((b) => !b.hiddenReason);
  const parityBlocks = buildSuggestedDisplayBlocksForAdminGantt({
    blocks: visibleCandidate,
    presenceBlocks,
    targets,
    staffName,
    date: dateStr,
  });
  if (parityBlocks.length === 0) return [];

  const phaseInputs = parityBlocks.filter((b) => b.kind === 'work' && !isWarehouseTarget(b as any));
  const perBlockPhase: Record<string, SessionPhaseKind | null> = {};
  for (const b of phaseInputs) {
    perBlockPhase[b.id] = resolveBlockPhaseDirect(
      b as unknown as ReportCandidateBlockUI,
      bookingPhaseByDate,
      largeProjectPhaseByDate,
    );
  }
  const sessionPhaseMap = buildSessionPhaseMap(
    phaseInputs.map((b) => ({
      id: b.id,
      targetType: (b as any).targetType,
      targetId: (b as any).targetId,
      title: b.title,
      subtitle: (b as any).subtitle,
      startAt: b.startAt,
      endAt: b.endAt,
    })),
    perBlockPhase,
  );

  const parityGantt: MirrorGanttBlock[] = parityBlocks.map((b) => ({
    id: b.id,
    kind:
      b.kind === 'work'
        ? mapReportCandidateKind(
            b as unknown as ReportCandidateBlockUI,
            bookingPhaseByDate,
            largeProjectPhaseByDate,
            sessionPhaseMap,
          )
        : (b.ganttKind as GanttKind),
    startAt: b.startAt,
    endAt: b.endAt,
    durationMinutes: b.durationMinutes,
    title: (b as any).displayTitle ?? b.title,
    subtitle: (b as any).displaySubtitle ?? (b as any).subtitle ?? null,
    rawKind: b.kind,
    sessionKey: sessionKeyForBlock({
      id: b.id,
      targetType: (b as any).targetType,
      targetId: (b as any).targetId,
      title: b.title,
      subtitle: (b as any).subtitle,
    }),
    targetType: (b as any).targetType,
    targetId: (b as any).targetId,
    source: 'reportCandidate',
    reportCandidateBlock: b as unknown as ReportCandidateBlockUI,
  }));

  return applyVisualMerge(parityGantt);
};

// ── Huvudfunktion ─────────────────────────────────────────────────────────
export function buildStaffGanttMirrorBlocks(
  input: BuildStaffGanttMirrorInput,
): BuildStaffGanttMirrorResult {
  const {
    staffName,
    dateStr,
    presenceDay,
    bookingPhaseByDate,
    largeProjectPhaseByDate,
  } = input;

  const v2Blocks = Array.isArray(presenceDay.displayTimelineBlocksV2)
    ? presenceDay.displayTimelineBlocksV2
    : [];
  const allocSegs = Array.isArray(presenceDay.workdayAllocationSegments)
    ? presenceDay.workdayAllocationSegments
    : [];
  const legacyBlocks = Array.isArray(presenceDay.reportCandidateBlocks)
    ? (presenceDay.reportCandidateBlocks as ReportCandidateBlockUI[])
    : [];
  const presenceBlocks = Array.isArray(presenceDay.presenceBlocks)
    ? presenceDay.presenceBlocks
    : [];
  const targets = Array.isArray(presenceDay.targets) ? presenceDay.targets : [];
  const hasV2Field = Array.isArray(presenceDay.displayTimelineBlocksV2);

  const mappedV2Raw = mapDisplayTimelineBlocksToGantt(v2Blocks as any).map(timelineBlockToGanttBlock);
  const mappedAllocRaw = mapWorkdayAllocationSegmentsToGantt(allocSegs as any).map(timelineBlockToGanttBlock);

  const mappedV2 = applyPlanningPhaseToGanttBlocks(
    mappedV2Raw as any,
    bookingPhaseByDate,
    largeProjectPhaseByDate,
  ) as MirrorGanttBlock[];
  const mappedAlloc = applyPlanningPhaseToGanttBlocks(
    mappedAllocRaw as any,
    bookingPhaseByDate,
    largeProjectPhaseByDate,
  ) as MirrorGanttBlock[];

  // Suggested-Only Policy (2026-05-17) — reportCandidate vinner när motorn
  // har producerat block, oavsett V2-fältet. Speglas från StaffGanttView.
  const selected: GanttBlockSource = legacyBlocks.length > 0
    ? 'reportCandidate'
    : selectGanttSourceFromMapped({
        mappedV2Count: mappedV2.length,
        mappedAllocationCount: mappedAlloc.length,
        legacyCount: 0,
        hasV2Field,
      });

  let blocks: MirrorGanttBlock[] = [];
  if (selected === 'displayTimelineV2') {
    blocks = runVisualPipeline(mappedV2, staffName);
  } else if (selected === 'workdayAllocation') {
    blocks = runVisualPipeline(mappedAlloc, staffName);
  } else if (selected === 'reportCandidate') {
    blocks = buildReportCandidateBlocks(
      legacyBlocks,
      presenceBlocks,
      targets,
      staffName,
      dateStr,
      bookingPhaseByDate,
      largeProjectPhaseByDate,
    );
    blocks = blocks.map((b) => ({ ...b, source: b.source ?? 'reportCandidate' }));
  }

  return {
    blocks,
    source: blocks.length > 0 ? selected : 'none',
    counts: {
      rawV2: v2Blocks.length,
      mappedV2: mappedV2.length,
      rawAlloc: allocSegs.length,
      mappedAlloc: mappedAlloc.length,
      legacy: legacyBlocks.length,
      rendered: blocks.length,
    },
  };
}
