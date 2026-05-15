/**
 * Lager 4.1 — Display Timeline Layer (read-only)
 * ──────────────────────────────────────────────
 *
 * Tar Lager 3 (WorkdayAllocation) + Lager 1/2 kontext och bygger en
 * mänsklig, kompakt och begriplig dag som UI/tidrapport kan visa.
 *
 * Lager 4 svarar på:
 *   - Hur ska dagen visas för användaren?
 *   - Vilka block ska slås ihop?
 *   - Vilka rubriker/subtitlar/severity ska visas?
 *   - Vilka warnings ska synas (inte alla)?
 *   - Vilka detaljer hör i "visa mer"?
 *   - Vilka actions behöver användaren ta?
 *
 * Lager 4 får INTE:
 *   - ändra GPS, active_time_registrations, time_reports, payroll
 *   - skriva till databasen
 *   - stoppa timer / godkänna tider
 *   - påverka display_blocks_json (gamla pipelines)
 *   - mutera Lager 1/2/3-output
 */
import type { DayEvidence } from './buildDayEvidence.ts';
import type {
  LocationTruthResult,
  LocationTruthTargetType,
} from './buildLocationTruthFromDayEvidence.ts';
import type {
  WorkdayAllocationConfidence,
  WorkdayAllocationProposal,
  WorkdayAllocationResult,
  WorkdayAllocationSegment,
  WorkdayAllocationType,
  WorkdayAllocationWarning,
} from './buildWorkdayAllocationFromLocationTruth.ts';

// ── Types ────────────────────────────────────────────────────────────────

export type DisplayTimelineBlockType =
  | 'project'
  | 'large_project'
  | 'booking'
  | 'warehouse'
  | 'supplier'
  | 'travel'
  | 'commute'
  | 'unlinked_address'
  | 'private'
  | 'review'
  | 'break_or_gap';

export type DisplayTimelineSeverity =
  | 'normal'
  | 'info'
  | 'warning'
  | 'needs_user_review';

/** Endast warnings som är värda att visa för en användare. */
export type DisplayTimelineWarning =
  | 'staff_not_assigned_to_matched_target'
  | 'unassigned_known_target_presence'
  | 'planning_geo_mismatch'
  | 'allocation_low_confidence'
  | 'movement_classified_as_commute'
  | 'normally_not_paid_commute'
  | 'normally_not_paid_homebound'
  | 'long_travel_over_150km'
  | 'movement_missing_anchor'
  | 'supplier_visit_without_project_context'
  | 'supplier_visit_during_planned_project'
  | 'home_after_last_work_location'
  | 'temporary_home_presence'
  | 'workday_time_without_location_truth_segment'
  | 'warehouse_presence_during_planned_project'
  | 'segment_partially_outside_workday'
  | 'needs_review_business_context';

/** Action användaren förväntas kunna ta från ett block. */
export type DisplayTimelineActionType =
  | 'confirm_allocation'
  | 'pick_project_for_supplier'
  | 'classify_unknown_address'
  | 'classify_uncovered_gap'
  | 'review_travel'
  | 'mark_as_private'
  | 'open_correction_dialog';

export interface DisplayTimelineAction {
  type: DisplayTimelineActionType;
  label: string;
  /** Optional payload för UI (target-kandidat, segment-id m.m.). */
  payload?: Record<string, unknown>;
}

export interface DisplayTimelineBlock {
  id: string;
  startAt: string;
  endAt: string;
  title: string;
  subtitle: string | null;
  displayType: DisplayTimelineBlockType;
  targetType: LocationTruthTargetType | null;
  targetId: string | null;
  label: string | null;
  address: string | null;
  durationMinutes: number;
  confidence: WorkdayAllocationConfidence;
  severity: DisplayTimelineSeverity;
  warnings: DisplayTimelineWarning[];
  actions: DisplayTimelineAction[];
  sourceAllocationSegmentIds: string[];
  sourceLocationTruthSegmentIds: string[];
  metadata: {
    /** Antal allokeringssegment som slogs ihop till det här blocket. */
    mergedCount: number;
    /** Original allocationType (om olika typer slogs ihop, första). */
    primaryAllocationType: WorkdayAllocationType;
    /** True om något källsegment ligger utanför workday. */
    containsOutsideWorkday: boolean;
    /** Originalvarningar från Lager 3 (för "visa mer"). */
    rawAllocationWarnings: WorkdayAllocationWarning[];
    /** ID:n på Lager 3-proposals som kopplats till blocket. */
    relatedProposalSegmentIds: string[];
  };
}

export interface DisplayTimelineDiagnostics {
  staffId: string | null;
  date: string | null;
  builtAtIso: string;
  buildDurationMs: number;
  inputAllocationSegmentCount: number;
  inputProposalCount: number;
  outputBlockCount: number;
  mergedSegmentsCollapsed: number;
  blocksByDisplayType: Record<DisplayTimelineBlockType, number>;
  blocksBySeverity: Record<DisplayTimelineSeverity, number>;
  totalDisplayMinutes: number;
  reviewBlockCount: number;
  warnings: string[];
}

export interface DisplayTimelineResult {
  blocks: DisplayTimelineBlock[];
  diagnostics: DisplayTimelineDiagnostics;
}

export interface BuildDisplayTimelineInput {
  dayEvidence: DayEvidence | null;
  locationTruthV2: LocationTruthResult | null;
  workdayAllocation: WorkdayAllocationResult | null;
}

// ── Mapping helpers ──────────────────────────────────────────────────────

const ALLOC_TO_DISPLAY: Record<WorkdayAllocationType, DisplayTimelineBlockType> = {
  project_work: 'project',
  large_project_work: 'large_project',
  booking_work: 'booking',
  warehouse_work: 'warehouse',
  supplier_visit: 'supplier',
  work_travel: 'travel',
  commute_travel: 'commute',
  unlinked_work_address: 'unlinked_address',
  private_time: 'private',
  needs_work_allocation_review: 'review',
};

const DISPLAY_TYPE_DEFAULT_TITLE: Record<DisplayTimelineBlockType, string> = {
  project: 'Projekt',
  large_project: 'Stort projekt',
  booking: 'Bokning',
  warehouse: 'Lager',
  supplier: 'Leverantör',
  travel: 'Resa',
  commute: 'Pendling',
  unlinked_address: 'Okänd arbetsadress',
  private: 'Privat tid',
  review: 'Behöver granskning',
  break_or_gap: 'Glapp i dagen',
};

/** Endast warnings som är meningsfulla för en användare visas. Resten döljs i metadata. */
const USER_VISIBLE_WARNINGS = new Set<DisplayTimelineWarning>([
  'staff_not_assigned_to_matched_target',
  'unassigned_known_target_presence',
  'planning_geo_mismatch',
  'allocation_low_confidence',
  'movement_classified_as_commute',
  'normally_not_paid_commute',
  'normally_not_paid_homebound',
  'long_travel_over_150km',
  'movement_missing_anchor',
  'supplier_visit_without_project_context',
  'supplier_visit_during_planned_project',
  'home_after_last_work_location',
  'temporary_home_presence',
  'workday_time_without_location_truth_segment',
  'warehouse_presence_during_planned_project',
  'segment_partially_outside_workday',
  'needs_review_business_context',
]);

function toMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function durationMinutes(startIso: string, endIso: string): number {
  const ms = toMs(endIso) - toMs(startIso);
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

function pickWarnings(raw: WorkdayAllocationWarning[]): DisplayTimelineWarning[] {
  const out: DisplayTimelineWarning[] = [];
  for (const w of raw) {
    if (USER_VISIBLE_WARNINGS.has(w as DisplayTimelineWarning)) {
      out.push(w as DisplayTimelineWarning);
    }
  }
  return out;
}

function deriveSeverity(
  displayType: DisplayTimelineBlockType,
  confidence: WorkdayAllocationConfidence,
  warnings: WorkdayAllocationWarning[],
): DisplayTimelineSeverity {
  if (displayType === 'review') return 'needs_user_review';
  if (displayType === 'unlinked_address') return 'needs_user_review';
  if (displayType === 'break_or_gap') return 'needs_user_review';
  if (warnings.includes('staff_not_assigned_to_matched_target')) return 'warning';
  if (warnings.includes('planning_geo_mismatch')) return 'warning';
  if (warnings.includes('supplier_visit_during_planned_project')) return 'warning';
  if (warnings.includes('warehouse_presence_during_planned_project')) return 'warning';
  if (warnings.includes('long_travel_over_150km')) return 'warning';
  if (warnings.includes('home_after_last_work_location')) return 'info';
  if (warnings.includes('movement_classified_as_commute')) return 'info';
  if (warnings.includes('temporary_home_presence')) return 'info';
  if (warnings.includes('allocation_low_confidence') || confidence === 'low') return 'info';
  return 'normal';
}

function deriveTitle(
  displayType: DisplayTimelineBlockType,
  label: string | null,
): string {
  if (label && label.trim()) return label.trim();
  return DISPLAY_TYPE_DEFAULT_TITLE[displayType];
}

function deriveSubtitle(
  displayType: DisplayTimelineBlockType,
  block: { address: string | null; durationMinutes: number },
): string | null {
  const parts: string[] = [];
  if (block.address) parts.push(block.address);
  if (block.durationMinutes >= 60) {
    const h = Math.floor(block.durationMinutes / 60);
    const m = block.durationMinutes % 60;
    parts.push(m > 0 ? `${h} h ${m} min` : `${h} h`);
  } else if (block.durationMinutes > 0) {
    parts.push(`${block.durationMinutes} min`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function deriveActions(
  block: Omit<DisplayTimelineBlock, 'actions' | 'subtitle'>,
  proposalsForSegment: WorkdayAllocationProposal[],
): DisplayTimelineAction[] {
  const actions: DisplayTimelineAction[] = [];
  if (block.displayType === 'supplier') {
    const link = proposalsForSegment.find(
      (p) => p.proposalType === 'link_supplier_to_project_candidate',
    );
    if (link) {
      actions.push({
        type: 'pick_project_for_supplier',
        label: 'Koppla leverantörsbesök till projekt',
        payload: {
          candidateTargetType: link.candidateTargetType ?? null,
          candidateTargetId: link.candidateTargetId ?? null,
          candidateLabel: link.candidateLabel ?? null,
        },
      });
    }
  }
  if (block.displayType === 'unlinked_address') {
    actions.push({
      type: 'classify_unknown_address',
      label: 'Klassificera plats',
      payload: { address: block.address ?? null },
    });
  }
  if (block.displayType === 'break_or_gap') {
    actions.push({
      type: 'classify_uncovered_gap',
      label: 'Förklara glapp',
      payload: { startAt: block.startAt, endAt: block.endAt },
    });
  }
  if (block.displayType === 'review') {
    actions.push({
      type: 'open_correction_dialog',
      label: 'Granska och åtgärda',
    });
  }
  if (block.displayType === 'travel' || block.displayType === 'commute') {
    actions.push({
      type: 'review_travel',
      label: 'Granska resa',
    });
  }
  if (
    block.warnings.includes('staff_not_assigned_to_matched_target') ||
    block.warnings.includes('unassigned_known_target_presence')
  ) {
    actions.push({ type: 'confirm_allocation', label: 'Bekräfta tid' });
  }
  if (
    block.warnings.includes('home_after_last_work_location') ||
    block.warnings.includes('temporary_home_presence')
  ) {
    actions.push({ type: 'mark_as_private', label: 'Markera som privat' });
  }
  return actions;
}

// ── Merge ────────────────────────────────────────────────────────────────

function canMerge(
  a: WorkdayAllocationSegment,
  b: WorkdayAllocationSegment,
  gapMs: number,
): boolean {
  if (a.allocationType !== b.allocationType) return false;
  if ((a.targetType ?? null) !== (b.targetType ?? null)) return false;
  if ((a.targetId ?? null) !== (b.targetId ?? null)) return false;
  if (!!a.outsideWorkday !== !!b.outsideWorkday) return false;
  // Tillåt små glapp (≤2 min) mellan kontigta segment.
  if (gapMs > 2 * 60_000) return false;
  return true;
}

function buildBlockFromSegments(
  group: WorkdayAllocationSegment[],
  index: number,
  proposalsBySegmentId: Map<string, WorkdayAllocationProposal[]>,
): DisplayTimelineBlock {
  const first = group[0];
  const last = group[group.length - 1];
  const startAt = first.startAt;
  const endAt = last.endAt;
  const displayType = ALLOC_TO_DISPLAY[first.allocationType];
  const allWarnings = group.flatMap((s) => s.warnings);
  const userWarnings = pickWarnings(allWarnings);
  const allLtIds = group.flatMap((s) => s.sourceLocationTruthSegmentIds);
  const containsOutside = group.some((s) => !!s.outsideWorkday);
  // Confidence = lägsta i gruppen.
  const confidenceRank: Record<WorkdayAllocationConfidence, number> = { high: 0, medium: 1, low: 2 };
  const confidence = group.reduce<WorkdayAllocationConfidence>((acc, s) =>
    confidenceRank[s.confidence] > confidenceRank[acc] ? s.confidence : acc, 'high');
  const dur = durationMinutes(startAt, endAt);
  const label = first.label;
  const address = first.address;
  const proposalSegmentIds = group
    .map((s) => s.sourceLocationTruthSegmentIds)
    .flat()
    .filter((id) => proposalsBySegmentId.has(id));
  const relatedProposals = proposalSegmentIds.flatMap((id) => proposalsBySegmentId.get(id) ?? []);

  const baseBlock: Omit<DisplayTimelineBlock, 'actions' | 'subtitle'> = {
    id: `dtl_${index.toString().padStart(4, '0')}_${first.id}`,
    startAt,
    endAt,
    title: deriveTitle(displayType, label),
    displayType,
    targetType: first.targetType,
    targetId: first.targetId,
    label,
    address,
    durationMinutes: dur,
    confidence,
    severity: deriveSeverity(displayType, confidence, allWarnings),
    warnings: userWarnings,
    sourceAllocationSegmentIds: group.map((s) => s.id),
    sourceLocationTruthSegmentIds: Array.from(new Set(allLtIds)),
    metadata: {
      mergedCount: group.length,
      primaryAllocationType: first.allocationType,
      containsOutsideWorkday: containsOutside,
      rawAllocationWarnings: Array.from(new Set(allWarnings)),
      relatedProposalSegmentIds: Array.from(new Set(proposalSegmentIds)),
    },
  };
  const subtitle = deriveSubtitle(displayType, { address, durationMinutes: dur });
  const actions = deriveActions(baseBlock, relatedProposals);
  return { ...baseBlock, subtitle, actions };
}

function buildGapBlock(
  startAt: string,
  endAt: string,
  index: number,
  relatedProposal?: WorkdayAllocationProposal,
): DisplayTimelineBlock {
  const dur = durationMinutes(startAt, endAt);
  const block: Omit<DisplayTimelineBlock, 'actions' | 'subtitle'> = {
    id: `dtl_gap_${index.toString().padStart(4, '0')}`,
    startAt,
    endAt,
    title: DISPLAY_TYPE_DEFAULT_TITLE.break_or_gap,
    displayType: 'break_or_gap',
    targetType: null,
    targetId: null,
    label: null,
    address: null,
    durationMinutes: dur,
    confidence: 'low',
    severity: 'needs_user_review',
    warnings: ['workday_time_without_location_truth_segment'],
    sourceAllocationSegmentIds: [],
    sourceLocationTruthSegmentIds: [],
    metadata: {
      mergedCount: 0,
      primaryAllocationType: 'needs_work_allocation_review',
      containsOutsideWorkday: false,
      rawAllocationWarnings: ['workday_time_without_location_truth_segment'],
      relatedProposalSegmentIds: relatedProposal ? [relatedProposal.segmentId] : [],
    },
  };
  const subtitle = deriveSubtitle('break_or_gap', { address: null, durationMinutes: dur });
  const actions = deriveActions(block, relatedProposal ? [relatedProposal] : []);
  return { ...block, subtitle, actions };
}

// ── Main ─────────────────────────────────────────────────────────────────

export function buildDisplayTimelineFromWorkdayAllocation(
  input: BuildDisplayTimelineInput,
): DisplayTimelineResult {
  const startedAt = Date.now();
  const wda = input.workdayAllocation;
  const allocSegments = wda?.segments ?? [];
  const proposals = wda?.proposals ?? [];

  const proposalsBySegmentId = new Map<string, WorkdayAllocationProposal[]>();
  for (const p of proposals) {
    const arr = proposalsBySegmentId.get(p.segmentId) ?? [];
    arr.push(p);
    proposalsBySegmentId.set(p.segmentId, arr);
  }

  // Sortera segment efter starttid (utanför workday senast).
  const sorted = [...allocSegments]
    .filter((s) => !!s.startAt && !!s.endAt)
    .sort((a, b) => toMs(a.startAt) - toMs(b.startAt));

  // Slå ihop kontigta likartade segment.
  const groups: WorkdayAllocationSegment[][] = [];
  for (const seg of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const prev = last[last.length - 1];
      const gap = toMs(seg.startAt) - toMs(prev.endAt);
      if (canMerge(prev, seg, gap)) {
        last.push(seg);
        continue;
      }
    }
    groups.push([seg]);
  }

  const blocks: DisplayTimelineBlock[] = groups.map((g, i) =>
    buildBlockFromSegments(g, i, proposalsBySegmentId),
  );

  // Lägg till uncovered_workday_time-proposals som break_or_gap-block.
  const gapProposals = proposals.filter((p) => p.proposalType === 'uncovered_workday_time');
  let gapIdx = 0;
  for (const gp of gapProposals) {
    blocks.push(buildGapBlock(gp.startAt, gp.endAt, gapIdx++, gp));
  }

  // Slutsortera kronologiskt.
  blocks.sort((a, b) => toMs(a.startAt) - toMs(b.startAt));

  // Diagnostics.
  const blocksByDisplayType = Object.fromEntries(
    Object.keys(DISPLAY_TYPE_DEFAULT_TITLE).map((k) => [k, 0]),
  ) as Record<DisplayTimelineBlockType, number>;
  const blocksBySeverity: Record<DisplayTimelineSeverity, number> = {
    normal: 0, info: 0, warning: 0, needs_user_review: 0,
  };
  let totalMin = 0;
  let reviewCount = 0;
  let mergedCollapsed = 0;
  for (const b of blocks) {
    blocksByDisplayType[b.displayType] = (blocksByDisplayType[b.displayType] ?? 0) + 1;
    blocksBySeverity[b.severity] += 1;
    totalMin += b.durationMinutes;
    if (b.severity === 'needs_user_review') reviewCount += 1;
    if (b.metadata.mergedCount > 1) {
      mergedCollapsed += b.metadata.mergedCount - 1;
    }
  }

  const diagnostics: DisplayTimelineDiagnostics = {
    staffId: wda?.diagnostics.staffId ?? null,
    date: wda?.diagnostics.date ?? null,
    builtAtIso: new Date().toISOString(),
    buildDurationMs: Date.now() - startedAt,
    inputAllocationSegmentCount: allocSegments.length,
    inputProposalCount: proposals.length,
    outputBlockCount: blocks.length,
    mergedSegmentsCollapsed: mergedCollapsed,
    blocksByDisplayType,
    blocksBySeverity,
    totalDisplayMinutes: totalMin,
    reviewBlockCount: reviewCount,
    warnings: [],
  };

  if (!wda) {
    diagnostics.warnings.push('no_workday_allocation_input');
  } else if (allocSegments.length === 0) {
    diagnostics.warnings.push('empty_workday_allocation');
  }

  return { blocks, diagnostics };
}
