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

/**
 * Action användaren förväntas kunna ta från ett block (eller hela dagen).
 *
 * Lager 4.4 — Actions är endast _beskrivningar_ av möjliga åtgärder.
 * De skriver ingenting i Lager 4 och får inte mutera GPS, time_reports,
 * active_time_registrations eller payroll. UI ansvarar för att utföra dem.
 */
export type DisplayTimelineActionType =
  // Dag-nivå (Lager 4.4)
  | 'approve_day'
  | 'edit_day'
  | 'add_note'
  // Projekt/booking/large_project utan assignment
  | 'confirm_worked_here'
  | 'request_assignment_link'
  | 'suggest_assignment_link'
  // Unlinked address
  | 'link_to_project'
  | 'mark_as_other_work'
  // Supplier
  | 'link_supplier_visit_to_project'
  | 'mark_as_pickup'
  | 'mark_as_dropoff'
  // Private + workday-end-förslag
  | 'accept_suggested_workday_end'
  | 'edit_workday_end'
  | 'ignore_private_time'
  // Planning ↔ GPS-mismatch
  | 'confirm_actual_location'
  | 'edit_time_block'
  | 'add_explanation'
  // Legacy / övriga (bakåtkompatibla)
  | 'confirm_allocation'
  | 'pick_project_for_supplier'
  | 'classify_unknown_address'
  | 'classify_uncovered_gap'
  | 'review_travel'
  | 'mark_as_private'
  | 'open_correction_dialog';

export type DisplayTimelineActionSeverity =
  | 'info'
  | 'primary'
  | 'warning'
  | 'critical';

export interface DisplayTimelineAction {
  /** Lager 4.4 — kanoniskt namn enligt spec. */
  actionType: DisplayTimelineActionType;
  /** Bakåtkompatibelt alias för actionType (samma värde). */
  type: DisplayTimelineActionType;
  label: string;
  requiresAiValidation: boolean;
  requiresUserNote: boolean;
  severity: DisplayTimelineActionSeverity;
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
  /** Lager 4.3 — människovänliga svenska warning-texter, parallella med `warnings`. */
  humanWarnings: string[];
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
    /** Lager 4.2 — totalt antal minuter som absorberades från små gap. */
    absorbedGapMinutes: number;
    /** Lager 4.2 — korta supplier-besök som vikts in i blocket. */
    absorbedSupplierVisits: Array<{
      startAt: string; endAt: string; label: string | null; address: string | null;
    }>;
    /** Lager 4.2 — korta travel/commute-segment som vikts in i blocket. */
    absorbedTravelSegments: Array<{
      startAt: string; endAt: string; durationMinutes: number;
    }>;
  };
}

export interface DisplayTimelineConsolidationExample {
  kind:
    | 'merged_same_target'
    | 'absorbed_small_gap'
    | 'absorbed_supplier_into_project'
    | 'absorbed_travel_into_project'
    | 'hidden_short_uncovered_gap'
    | 'collapsed_trailing_private';
  startAt: string;
  endAt: string;
  note: string;
}

export interface DisplayTimelineDiagnostics {
  staffId: string | null;
  date: string | null;
  builtAtIso: string;
  buildDurationMs: number;
  /** Antal Lager 3-segment som kom in. */
  inputAllocationSegmentCount: number;
  inputProposalCount: number;
  /** Antal display-block efter konsolidering. */
  outputDisplayBlockCount: number;
  /** Bakåtkompatibelt alias för outputDisplayBlockCount. */
  outputBlockCount: number;
  /** Antal segment som slogs ihop (input − output, exkl. absorberade). */
  mergedSegmentCount: number;
  /** Bakåtkompatibelt alias för mergedSegmentCount. */
  mergedSegmentsCollapsed: number;
  /** Antal små gap som absorberades in i ett block i stället för att bli eget block. */
  absorbedGapCount: number;
  /** Antal warnings som klassats som tekniska och inte visas på blocken. */
  hiddenTechnicalWarningCount: number;
  blocksByDisplayType: Record<DisplayTimelineBlockType, number>;
  blocksBySeverity: Record<DisplayTimelineSeverity, number>;
  totalDisplayMinutes: number;
  reviewBlockCount: number;
  warnings: string[];
  /** Ett par konkreta exempel för debugging. */
  examples: DisplayTimelineConsolidationExample[];
}

export interface DisplayTimelineResult {
  blocks: DisplayTimelineBlock[];
  /** Lager 4.4 — actions som gäller hela dagen, inte ett enskilt block. */
  dayActions: DisplayTimelineAction[];
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
  const seen = new Set<string>();
  for (const w of raw) {
    if (USER_VISIBLE_WARNINGS.has(w as DisplayTimelineWarning) && !seen.has(w)) {
      seen.add(w);
      out.push(w as DisplayTimelineWarning);
    }
  }
  return out;
}

// ── Lager 4.3 — Svensk warning-text ──────────────────────────────────────
const WARNING_HUMAN_TEXT: Partial<Record<string, string>> = {
  staff_not_assigned_to_matched_target: 'Du var på plats men saknade assignment.',
  unassigned_known_target_presence: 'Närvaro på känd plats utan assignment.',
  no_project_link: 'Adressen är inte kopplad till projekt.',
  long_signal_gap: 'Signal saknades en längre stund, men platsen verkar vara samma.',
  planning_geo_mismatch: 'Planeringen säger annan plats än GPS.',
  supplier_visit_without_project_context: 'Leverantörsbesöket saknar tydlig projektkoppling.',
  supplier_visit_during_planned_project: 'Leverantörsbesök under planerat projekt.',
  warehouse_presence_during_planned_project: 'Lagerbesök under planerat projekt.',
  allocation_low_confidence: 'Osäker tolkning av platsen.',
  movement_classified_as_commute: 'Förflyttningen tolkades som pendling.',
  normally_not_paid_commute: 'Pendling räknas normalt inte som arbetstid.',
  normally_not_paid_homebound: 'Hemresa räknas normalt inte som arbetstid.',
  long_travel_over_150km: 'Lång resa (över 150 km).',
  movement_missing_anchor: 'Förflyttning saknar tydlig start- eller slutpunkt.',
  home_after_last_work_location: 'Hemma efter sista arbetsplatsen för dagen.',
  temporary_home_presence: 'Kort vistelse hemma.',
  workday_time_without_location_truth_segment: 'Arbetstid utan platsdata.',
  segment_partially_outside_workday: 'Delvis utanför arbetsdagen.',
  needs_review_business_context: 'Affärsmässigt sammanhang behöver granskas.',
};

function humanWarning(w: string): string | null {
  return WARNING_HUMAN_TEXT[w] ?? null;
}

function buildHumanWarnings(warnings: DisplayTimelineWarning[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of warnings) {
    const text = humanWarning(w);
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
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

// ── Lager 4.3 — Rubriker ─────────────────────────────────────────────────

/**
 * Försöker hitta en projektfas (RIGG/EVENT/RIGDOWN) i label.
 * Returnerar { phase, baseName } där phase är ren fas-token eller null.
 */
function extractPhase(label: string | null): { phase: 'RIGG' | 'EVENT' | 'RIGDOWN' | null; baseName: string | null } {
  if (!label) return { phase: null, baseName: null };
  const trimmed = label.trim();
  // Mönster: "RIGG — Foo", "Rigg: Foo", "Foo (RIGG)", "Foo - Event-dag"
  const phaseRegex = /\b(rigg(?:ning)?|event(?:dag)?|rigdown|rigg\s*ner|nedrigg(?:ning)?)\b/i;
  const m = trimmed.match(phaseRegex);
  if (!m) return { phase: null, baseName: trimmed };
  const raw = m[1].toLowerCase();
  let phase: 'RIGG' | 'EVENT' | 'RIGDOWN' | null = null;
  if (raw.startsWith('rigg') && !raw.includes('ner')) phase = 'RIGG';
  else if (raw.startsWith('event')) phase = 'EVENT';
  else phase = 'RIGDOWN';
  // Rensa fas-tokenet ur baseName.
  const baseName = trimmed
    .replace(phaseRegex, '')
    .replace(/[\s\-—–:()]+/g, ' ')
    .trim() || null;
  return { phase, baseName };
}

function deriveTitle(
  displayType: DisplayTimelineBlockType,
  label: string | null,
): string {
  const { phase, baseName } = extractPhase(label);
  const name = baseName || (label ? label.trim() : null);
  switch (displayType) {
    case 'large_project':
      if (phase && name) return `${phase} — ${name}`;
      if (name) return `Projektarbete — ${name}`;
      return 'Projektarbete';
    case 'project':
      if (phase && name) return `${phase} — ${name}`;
      if (name) return `Projektarbete — ${name}`;
      return 'Projektarbete';
    case 'booking':
      if (phase && name) return `${phase} — ${name}`;
      if (name) return `Bokning — ${name}`;
      return 'Bokning';
    case 'warehouse':
      return 'Lager';
    case 'supplier':
      if (name) return `Leverantörsbesök — ${name}`;
      return 'Leverantörsbesök';
    case 'travel':
      return 'Arbetsresa';
    case 'commute':
      // Riktning sätts post-hoc i main()
      return 'Resa till arbete';
    case 'unlinked_address':
      return 'Arbete på okopplad adress';
    case 'private':
      return 'Hemma';
    case 'review':
      return 'Behöver kontrolleras';
    case 'break_or_gap':
      return DISPLAY_TYPE_DEFAULT_TITLE.break_or_gap;
  }
}

function formatDuration(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }
  return min > 0 ? `${min} min` : '';
}

function deriveSubtitle(
  displayType: DisplayTimelineBlockType,
  block: { address: string | null; durationMinutes: number; supplierLinkLabel?: string | null; fromAddress?: string | null; toAddress?: string | null },
): string | null {
  const parts: string[] = [];
  if (displayType === 'supplier') {
    if (block.address) parts.push(block.address);
    if (block.supplierLinkLabel) parts.push(`Trolig koppling: ${block.supplierLinkLabel}`);
  } else if (displayType === 'travel' || displayType === 'commute') {
    if (block.fromAddress && block.toAddress) {
      parts.push(`${block.fromAddress} → ${block.toAddress}`);
    } else if (block.address) {
      parts.push(block.address);
    }
  } else if (displayType === 'warehouse') {
    if (block.address) parts.push(block.address);
  } else {
    if (block.address) parts.push(block.address);
  }
  const dur = formatDuration(block.durationMinutes);
  if (dur) parts.push(dur);
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

/** Lager 4.2 — Två segment får slås ihop om "samma sak". */
function sameLogicalTarget(a: WorkdayAllocationSegment, b: WorkdayAllocationSegment): boolean {
  if (a.allocationType !== b.allocationType) return false;
  if ((a.targetType ?? null) !== (b.targetType ?? null)) return false;
  if ((a.targetId ?? null) !== (b.targetId ?? null)) return false;
  if ((a.label ?? null) !== (b.label ?? null)) return false;
  if ((a.address ?? null) !== (b.address ?? null)) return false;
  return true;
}

/** Mjuk merge tröskel: 2 min utan extra villkor. */
const MERGE_GAP_SOFT_MS = 2 * 60_000;
/** Bridged merge tröskel: upp till 30 min för identisk target/label/address (Lager 2/3 har redan markerat platsen som densamma). */
const MERGE_GAP_BRIDGED_MS = 30 * 60_000;

function canMerge(
  a: WorkdayAllocationSegment,
  b: WorkdayAllocationSegment,
  gapMs: number,
): boolean {
  if (!sameLogicalTarget(a, b)) return false;
  if (!!a.outsideWorkday !== !!b.outsideWorkday) return false;
  if (gapMs <= MERGE_GAP_SOFT_MS) return true;
  // Större gap är ok när det är exakt samma plats — Lager 2/3 har redan
  // bedömt att personen var kvar på samma punkt.
  if (gapMs <= MERGE_GAP_BRIDGED_MS) return true;
  return false;
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

  // Lager 4.3 — supplier-länk för subtitle.
  const supplierLink = group.find((s) => s.linkedProjectCandidate)?.linkedProjectCandidate ?? null;

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
    humanWarnings: buildHumanWarnings(userWarnings),
    sourceAllocationSegmentIds: group.map((s) => s.id),
    sourceLocationTruthSegmentIds: Array.from(new Set(allLtIds)),
    metadata: {
      mergedCount: group.length,
      primaryAllocationType: first.allocationType,
      containsOutsideWorkday: containsOutside,
      rawAllocationWarnings: Array.from(new Set(allWarnings)),
      relatedProposalSegmentIds: Array.from(new Set(proposalSegmentIds)),
      absorbedGapMinutes: 0,
      absorbedSupplierVisits: [],
      absorbedTravelSegments: [],
    },
  };
  const subtitle = deriveSubtitle(displayType, {
    address,
    durationMinutes: dur,
    supplierLinkLabel: supplierLink?.label ?? null,
  });
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
    humanWarnings: buildHumanWarnings(['workday_time_without_location_truth_segment']),
    sourceAllocationSegmentIds: [],
    sourceLocationTruthSegmentIds: [],
    metadata: {
      mergedCount: 0,
      primaryAllocationType: 'needs_work_allocation_review',
      containsOutsideWorkday: false,
      rawAllocationWarnings: ['workday_time_without_location_truth_segment'],
      relatedProposalSegmentIds: relatedProposal ? [relatedProposal.segmentId] : [],
      absorbedGapMinutes: 0,
      absorbedSupplierVisits: [],
      absorbedTravelSegments: [],
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
  const examples: DisplayTimelineConsolidationExample[] = [];
  let absorbedGapCount = 0;
  const absorbedGapMinutesByGroupIdx = new Map<number, number>();
  for (const seg of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const prev = last[last.length - 1];
      const gap = toMs(seg.startAt) - toMs(prev.endAt);
      if (canMerge(prev, seg, gap)) {
        last.push(seg);
        if (gap > MERGE_GAP_SOFT_MS) {
          absorbedGapCount += 1;
          const idx = groups.length - 1;
          absorbedGapMinutesByGroupIdx.set(
            idx,
            (absorbedGapMinutesByGroupIdx.get(idx) ?? 0) + Math.round(gap / 60_000),
          );
          if (examples.length < 6) {
            examples.push({
              kind: 'absorbed_small_gap',
              startAt: prev.endAt,
              endAt: seg.startAt,
              note: `Gap ${Math.round(gap / 60_000)} min absorberat (samma ${seg.allocationType})`,
            });
          }
        } else if (examples.length < 6) {
          examples.push({
            kind: 'merged_same_target',
            startAt: prev.startAt,
            endAt: seg.endAt,
            note: `Slog ihop ${seg.allocationType} (${seg.label ?? 'utan label'})`,
          });
        }
        continue;
      }
    }
    groups.push([seg]);
  }

  let blocks: DisplayTimelineBlock[] = groups.map((g, i) => {
    const block = buildBlockFromSegments(g, i, proposalsBySegmentId);
    const absorbedMin = absorbedGapMinutesByGroupIdx.get(i) ?? 0;
    if (absorbedMin > 0) block.metadata.absorbedGapMinutes = absorbedMin;
    return block;
  });

  // ── Lager 4.2 — vik in korta supplier/travel som metadata på närliggande projekt ──
  const PROJECT_LIKE: ReadonlySet<DisplayTimelineBlockType> = new Set([
    'project', 'large_project', 'booking', 'warehouse',
  ]);
  const SHORT_SUPPLIER_MAX_MIN = 15;
  const SHORT_TRAVEL_MAX_MIN = 10;

  function targetKey(b: DisplayTimelineBlock): string {
    return `${b.targetType ?? ''}::${b.targetId ?? ''}`;
  }

  function tryFold(idx: number): boolean {
    const cur = blocks[idx];
    if (!cur) return false;
    const prev = blocks[idx - 1];
    const next = blocks[idx + 1];
    const sameNeighborProject =
      prev && next &&
      PROJECT_LIKE.has(prev.displayType) &&
      PROJECT_LIKE.has(next.displayType) &&
      targetKey(prev) === targetKey(next);

    // Supplier kort + linkedProjectCandidate matchar grannprojekt → vik in.
    if (cur.displayType === 'supplier' && cur.durationMinutes <= SHORT_SUPPLIER_MAX_MIN) {
      const candidates = (wda?.segments ?? [])
        .filter((s) => cur.sourceAllocationSegmentIds.includes(s.id))
        .map((s) => s.linkedProjectCandidate)
        .filter((c): c is NonNullable<typeof c> => !!c);
      const candidate = candidates[0];
      let host: DisplayTimelineBlock | null = null;
      if (sameNeighborProject) host = prev;
      if (!host && candidate && prev && PROJECT_LIKE.has(prev.displayType) &&
          prev.targetType === candidate.targetType && prev.targetId === candidate.targetId) host = prev;
      if (!host && candidate && next && PROJECT_LIKE.has(next.displayType) &&
          next.targetType === candidate.targetType && next.targetId === candidate.targetId) host = next;
      if (host) {
        host.metadata.absorbedSupplierVisits.push({
          startAt: cur.startAt, endAt: cur.endAt, label: cur.label, address: cur.address,
        });
        host.endAt = host.endAt > cur.endAt ? host.endAt : cur.endAt;
        host.startAt = host.startAt < cur.startAt ? host.startAt : cur.startAt;
        host.durationMinutes = durationMinutes(host.startAt, host.endAt);
        if (examples.length < 6) {
          examples.push({
            kind: 'absorbed_supplier_into_project',
            startAt: cur.startAt, endAt: cur.endAt,
            note: `Kort leverantörsbesök vikt in i ${host.title}`,
          });
        }
        return true;
      }
    }

    // Mycket kort travel/commute mellan två block med samma projekt → vik in i föregående.
    if ((cur.displayType === 'travel' || cur.displayType === 'commute') &&
        cur.durationMinutes <= SHORT_TRAVEL_MAX_MIN && sameNeighborProject) {
      prev!.metadata.absorbedTravelSegments.push({
        startAt: cur.startAt, endAt: cur.endAt, durationMinutes: cur.durationMinutes,
      });
      prev!.endAt = cur.endAt;
      prev!.durationMinutes = durationMinutes(prev!.startAt, prev!.endAt);
      if (examples.length < 6) {
        examples.push({
          kind: 'absorbed_travel_into_project',
          startAt: cur.startAt, endAt: cur.endAt,
          note: `Kort förflyttning (${cur.durationMinutes} min) vikt in i ${prev!.title}`,
        });
      }
      return true;
    }
    return false;
  }

  // Iterera bakifrån så index inte krockar vid splice.
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (tryFold(i)) blocks.splice(i, 1);
  }

  // ── Lager 4.2 — Lägg till uncovered_workday_time som mjuka block ──
  const SHORT_GAP_HIDE_MAX_MIN = 10;
  const gapProposals = proposals.filter((p) => p.proposalType === 'uncovered_workday_time');
  let gapIdx = 0;
  let hiddenShortGapCount = 0;
  for (const gp of gapProposals) {
    const gMin = durationMinutes(gp.startAt, gp.endAt);
    if (gMin <= SHORT_GAP_HIDE_MAX_MIN) {
      hiddenShortGapCount += 1;
      if (examples.length < 6) {
        examples.push({
          kind: 'hidden_short_uncovered_gap',
          startAt: gp.startAt, endAt: gp.endAt,
          note: `Kort uncovered ${gMin} min — döljs från huvudvyn`,
        });
      }
      continue;
    }
    const block = buildGapBlock(gp.startAt, gp.endAt, gapIdx++, gp);
    // Lager 4.2 — milda långa gaps; behåll review-action.
    if (gMin <= 30) block.severity = 'info';
    blocks.push(block);
  }

  // ── Lager 4.2 — Trailing private/home: kollapsa efter sista arbets-block ──
  const lastWorkIdx = (() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const t = blocks[i].displayType;
      if (t !== 'private' && t !== 'break_or_gap') return i;
    }
    return -1;
  })();
  if (lastWorkIdx >= 0) {
    const trailingPrivates = blocks.slice(lastWorkIdx + 1).filter((b) => b.displayType === 'private');
    if (trailingPrivates.length > 0) {
      const first = trailingPrivates[0];
      const total = trailingPrivates.reduce((s, b) => s + b.durationMinutes, 0);
      first.title = 'Hemma';
      first.endAt = trailingPrivates[trailingPrivates.length - 1].endAt;
      first.durationMinutes = total;
      first.severity = 'info';
      if (!first.actions.find((a) => a.type === 'open_correction_dialog')) {
        first.actions.push({
          type: 'open_correction_dialog',
          label: 'Arbetsdagen kan avslutas här',
        });
      }
      // Ta bort de andra trailing-privates.
      const removeIds = new Set(trailingPrivates.slice(1).map((b) => b.id));
      const before = blocks.length;
      blocks = blocks.filter((b) => !removeIds.has(b.id));
      if (before !== blocks.length && examples.length < 6) {
        examples.push({
          kind: 'collapsed_trailing_private',
          startAt: first.startAt, endAt: first.endAt,
          note: `Slog ihop ${trailingPrivates.length} privata block till "Hemma"`,
        });
      }
    }
  }

  // Slutsortera kronologiskt.
  blocks.sort((a, b) => toMs(a.startAt) - toMs(b.startAt));

  // Lager 4.3 — Riktning för pendling baserat på grannar.
  for (let i = 0; i < blocks.length; i++) {
    const cur = blocks[i];
    if (cur.displayType !== 'commute') continue;
    const prev = blocks[i - 1];
    const next = blocks[i + 1];
    const prevIsWork = prev && PROJECT_LIKE.has(prev.displayType);
    const nextIsWork = next && PROJECT_LIKE.has(next.displayType);
    if (nextIsWork && !prevIsWork) cur.title = 'Resa till arbete';
    else if (prevIsWork && !nextIsWork) cur.title = 'Hemresa';
    else if (nextIsWork) cur.title = 'Resa till arbete';
    else cur.title = 'Hemresa';
  }

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
  let hiddenTechnicalWarningCount = hiddenShortGapCount;
  for (const b of blocks) {
    blocksByDisplayType[b.displayType] = (blocksByDisplayType[b.displayType] ?? 0) + 1;
    blocksBySeverity[b.severity] += 1;
    totalMin += b.durationMinutes;
    if (b.severity === 'needs_user_review') reviewCount += 1;
    if (b.metadata.mergedCount > 1) {
      mergedCollapsed += b.metadata.mergedCount - 1;
    }
    // Lager 4.2 — räkna raw warnings som filtrerades bort.
    const visibleSet = new Set(b.warnings as string[]);
    for (const raw of b.metadata.rawAllocationWarnings) {
      if (!visibleSet.has(raw as string)) hiddenTechnicalWarningCount += 1;
    }
  }

  const diagnostics: DisplayTimelineDiagnostics = {
    staffId: wda?.diagnostics.staffId ?? null,
    date: wda?.diagnostics.date ?? null,
    builtAtIso: new Date().toISOString(),
    buildDurationMs: Date.now() - startedAt,
    inputAllocationSegmentCount: allocSegments.length,
    inputProposalCount: proposals.length,
    outputDisplayBlockCount: blocks.length,
    outputBlockCount: blocks.length,
    mergedSegmentCount: mergedCollapsed,
    mergedSegmentsCollapsed: mergedCollapsed,
    absorbedGapCount,
    hiddenTechnicalWarningCount,
    blocksByDisplayType,
    blocksBySeverity,
    totalDisplayMinutes: totalMin,
    reviewBlockCount: reviewCount,
    warnings: [],
    examples,
  };

  if (!wda) {
    diagnostics.warnings.push('no_workday_allocation_input');
  } else if (allocSegments.length === 0) {
    diagnostics.warnings.push('empty_workday_allocation');
  }

  return { blocks, diagnostics };
}
