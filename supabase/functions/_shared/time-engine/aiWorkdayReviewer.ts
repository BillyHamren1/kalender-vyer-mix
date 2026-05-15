/**
 * Lager 3.7 — AI Workday Reviewer (read-only, förslag-only)
 * ─────────────────────────────────────────────────────────
 *
 * AI får hjälpa till med frågetecken i Lager 3, men ÄGER ALDRIG sanningen.
 *
 * Principer (hårda, enforced av denna modul):
 *   - AI får ALDRIG ändra fysisk plats från Lager 2.
 *   - AI får ALDRIG skriva data (time_reports, active_time_registrations,
 *     display_blocks_json, location_time_entries, payroll, GPS).
 *   - AI får ALDRIG flytta personen till planerad plats om GPS säger annat.
 *   - AI returnerar BARA proposals med requiresHumanApproval.
 *   - Om ingen säker AI-klient är konfigurerad → no-op reviewer som
 *     returnerar tomt resultat. Inga externa anrop görs i denna fil.
 *
 * Modulen exponerar:
 *   - buildAiWorkdayReviewInput(...)  → samlar osäkra fall till AI-input
 *   - reviewWorkdayWithAi(...)         → no-op/mock reviewer (default)
 *   - shouldTriggerAiReview(segment)   → trigger-policy (deterministisk)
 *
 * Triggers (osäkra fall som ber om AI-review):
 *   - supplier_visit_without_project_context
 *   - unlinked_work_address (allocationType)
 *   - unassigned_but_present (assignmentStatus)
 *   - planning_geo_mismatch
 *   - large_project_missing_geo
 *   - movement_missing_anchor
 *   - competing_business_targets
 *   - osäkert stop-förslag (suggest_workday_end + low/medium confidence)
 */
import type { DayEvidence } from './buildDayEvidence.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
} from './buildLocationTruthFromDayEvidence.ts';
import type {
  WorkdayAllocationResult,
  WorkdayAllocationSegment,
  WorkdayAllocationProposal,
  WorkdayAllocationConfidence,
} from './buildWorkdayAllocationFromLocationTruth.ts';

// ── Trigger-typer ─────────────────────────────────────────────────────────

export type AiReviewTriggerReason =
  | 'supplier_visit_without_project_context'
  | 'unlinked_work_address'
  | 'unassigned_but_present'
  | 'planning_geo_mismatch'
  | 'large_project_missing_geo'
  | 'movement_missing_anchor'
  | 'competing_business_targets'
  | 'uncertain_workday_end_proposal';

export interface AiReviewSegmentCase {
  segmentId: string;
  /** wda-id (Lager 3-segment-id). */
  allocationSegmentId: string;
  startAt: string;
  endAt: string;
  /** Lager 3-allokering AI ska förhålla sig till (inte ändra). */
  allocationType: WorkdayAllocationSegment['allocationType'];
  targetType: LocationTruthTargetType | null;
  targetId: string | null;
  label: string | null;
  address: string | null;
  confidence: WorkdayAllocationConfidence;
  /** Vilka triggers som matchade detta segment. */
  triggers: AiReviewTriggerReason[];
  /** Hela warning-listan (oförändrad — för transparens). */
  warnings: string[];
  /** Lager 2 finalType + status (read-only kontext). */
  locationTruthFinalType: LocationTruthSegment['finalType'] | null;
  businessContextStatus: WorkdayAllocationSegment['businessContextStatus'];
  /** Konkurrerande targets om vi hittat fler än en kandidat (deterministiskt). */
  competingTargets?: Array<{
    targetType: LocationTruthTargetType;
    targetId: string | null;
    label: string | null;
    source: string;
  }>;
}

export interface AiReviewProposalCase {
  proposalSegmentId: string;
  proposalType: NonNullable<WorkdayAllocationProposal['proposalType']>;
  reason: string;
  startAt: string;
  endAt: string;
  suggestedEndAt: string | null;
  confidence: WorkdayAllocationConfidence;
  triggers: AiReviewTriggerReason[];
}

export interface AiWorkdayReviewInput {
  staffId: string | null;
  date: string | null;
  builtAtIso: string;
  /** Read-only kontext: workday-fönstret. */
  workday: {
    startAt: string | null;
    endAt: string | null;
    isOpen: boolean;
  };
  /** Osäkra segment som AI får titta på. */
  segmentCases: AiReviewSegmentCase[];
  /** Osäkra proposals (t.ex. suggest_workday_end med medium confidence). */
  proposalCases: AiReviewProposalCase[];
  diagnostics: {
    totalAllocationSegments: number;
    triggeredSegmentCount: number;
    triggeredProposalCount: number;
    triggerCounts: Record<AiReviewTriggerReason, number>;
  };
}

// ── AI-output (förslag-only) ──────────────────────────────────────────────

export type AiProposalType =
  | 'link_supplier_to_project'
  | 'link_unlinked_address_to_target'
  | 'confirm_unassigned_presence'
  | 'choose_between_competing_targets'
  | 'classify_movement_anchor'
  | 'confirm_workday_end'
  | 'needs_user_input';

export interface AiReviewProposal {
  proposalType: AiProposalType;
  targetType: LocationTruthTargetType | null;
  targetId: string | null;
  label: string | null;
  confidence: WorkdayAllocationConfidence;
  /** Hård regel: AI-förslag kräver alltid mänsklig granskning. */
  requiresHumanApproval: true;
  reason: string;
  sourceSegmentIds: string[];
  warnings: string[];
}

export interface AiWorkdayReviewOutput {
  proposals: AiReviewProposal[];
  summary: string;
  risks: string[];
  /** Diagnostik om reviewer-vägen som faktiskt kördes. */
  reviewer: {
    kind: 'noop' | 'mock' | 'external';
    invokedAt: string;
    durationMs: number;
    note?: string;
  };
}

// ── Trigger-policy (deterministisk, ingen AI inblandad) ──────────────────

/**
 * Avgör om ett Lager 3-segment ska skickas till AI-review.
 * Endast osäkra fall — bekräftade projekt/lager passerar inte.
 */
export function shouldTriggerAiReview(
  seg: WorkdayAllocationSegment,
): AiReviewTriggerReason[] {
  const triggers: AiReviewTriggerReason[] = [];
  if (seg.outsideWorkday) return triggers; // utanför workday → inte AI:s sak

  if (seg.warnings.includes('supplier_visit_without_project_context')) {
    triggers.push('supplier_visit_without_project_context');
  }
  if (seg.allocationType === 'unlinked_work_address') {
    triggers.push('unlinked_work_address');
  }
  if (seg.assignmentStatus === 'unassigned_but_present') {
    triggers.push('unassigned_but_present');
  }
  if (seg.warnings.includes('planning_geo_mismatch')) {
    triggers.push('planning_geo_mismatch');
  }
  if (seg.warnings.includes('movement_missing_anchor')) {
    triggers.push('movement_missing_anchor');
  }
  // large_project saknar geo → matchad target finns men addressen är null
  // OCH targetType är large_project. Vi använder address-null som proxy.
  if (
    seg.targetType === 'large_project' &&
    !seg.address &&
    !seg.outsideWorkday
  ) {
    triggers.push('large_project_missing_geo');
  }
  return triggers;
}

// ── buildAiWorkdayReviewInput ────────────────────────────────────────────

export interface BuildAiWorkdayReviewInputArgs {
  dayEvidence: DayEvidence | null;
  locationTruthV2: LocationTruthResult | null;
  workdayAllocation: WorkdayAllocationResult | null;
}

export function buildAiWorkdayReviewInput(
  args: BuildAiWorkdayReviewInputArgs,
): AiWorkdayReviewInput {
  const wda = args.workdayAllocation;
  const lt = args.locationTruthV2;
  const ltById = new Map<string, LocationTruthSegment>();
  for (const s of lt?.segments ?? []) ltById.set(s.id, s);

  const segmentCases: AiReviewSegmentCase[] = [];
  const triggerCounts: Record<AiReviewTriggerReason, number> = {
    supplier_visit_without_project_context: 0,
    unlinked_work_address: 0,
    unassigned_but_present: 0,
    planning_geo_mismatch: 0,
    large_project_missing_geo: 0,
    movement_missing_anchor: 0,
    competing_business_targets: 0,
    uncertain_workday_end_proposal: 0,
  };

  for (const seg of wda?.segments ?? []) {
    const triggers = shouldTriggerAiReview(seg);

    // Konkurrerande targets (deterministiskt) — om Lager 2 redan markerat
    // status 'multiple_target_candidates' eller liknande, lyfter vi det.
    const ltSeg = seg.sourceLocationTruthSegmentIds[0]
      ? ltById.get(seg.sourceLocationTruthSegmentIds[0]) ?? null
      : null;
    const competing = extractCompetingTargets(ltSeg);
    if (competing.length > 1) triggers.push('competing_business_targets');

    if (triggers.length === 0) continue;

    for (const t of triggers) triggerCounts[t] += 1;

    segmentCases.push({
      segmentId: seg.sourceLocationTruthSegmentIds[0] ?? seg.id,
      allocationSegmentId: seg.id,
      startAt: seg.startAt,
      endAt: seg.endAt,
      allocationType: seg.allocationType,
      targetType: seg.targetType,
      targetId: seg.targetId,
      label: seg.label,
      address: seg.address,
      confidence: seg.confidence,
      triggers,
      warnings: [...seg.warnings],
      locationTruthFinalType: ltSeg?.finalType ?? null,
      businessContextStatus: seg.businessContextStatus,
      competingTargets: competing.length > 1 ? competing : undefined,
    });
  }

  const proposalCases: AiReviewProposalCase[] = [];
  for (const p of wda?.proposals ?? []) {
    if (p.proposalType !== 'suggest_workday_end') continue;
    if (p.confidence === 'high') continue; // säkra förslag behöver inte AI
    triggerCounts.uncertain_workday_end_proposal += 1;
    proposalCases.push({
      proposalSegmentId: p.segmentId,
      proposalType: p.proposalType,
      reason: p.reason,
      startAt: p.startAt,
      endAt: p.endAt,
      suggestedEndAt: p.suggestedEndAt ?? null,
      confidence: p.confidence,
      triggers: ['uncertain_workday_end_proposal'],
    });
  }

  return {
    staffId: wda?.diagnostics.staffId ?? lt?.diagnostics.staffId ?? null,
    date: wda?.diagnostics.date ?? lt?.diagnostics.date ?? null,
    builtAtIso: new Date().toISOString(),
    workday: {
      startAt: wda?.diagnostics.workdayStartAt ?? null,
      endAt: wda?.diagnostics.workdayEndAt ?? null,
      isOpen: wda?.diagnostics.openWorkday ?? false,
    },
    segmentCases,
    proposalCases,
    diagnostics: {
      totalAllocationSegments: wda?.segments.length ?? 0,
      triggeredSegmentCount: segmentCases.length,
      triggeredProposalCount: proposalCases.length,
      triggerCounts,
    },
  };
}

function extractCompetingTargets(
  ltSeg: LocationTruthSegment | null,
): NonNullable<AiReviewSegmentCase['competingTargets']> {
  if (!ltSeg) return [];
  // Best effort: om Lager 2 lagt en lista i diagnostics.candidateTargets
  // använder vi den. Annars returnerar vi tom lista (deterministiskt, inget
  // gissande). Vi undviker any-cast genom att läsa via okänt fält.
  const diag = ltSeg.diagnostics as Record<string, unknown> | undefined;
  const candidates = diag && Array.isArray(diag.candidateTargets)
    ? (diag.candidateTargets as Array<Record<string, unknown>>)
    : [];
  const out: NonNullable<AiReviewSegmentCase['competingTargets']> = [];
  for (const c of candidates) {
    const tt = typeof c.targetType === 'string' ? c.targetType as LocationTruthTargetType : null;
    if (!tt) continue;
    out.push({
      targetType: tt,
      targetId: typeof c.targetId === 'string' ? c.targetId : null,
      label: typeof c.label === 'string' ? c.label : null,
      source: typeof c.source === 'string' ? c.source : 'location_truth_candidate',
    });
  }
  return out;
}

// ── No-op reviewer (default — ingen extern AI kopplad här) ───────────────

export interface ReviewWorkdayWithAiOptions {
  /**
   * Override för testbarhet. Default = 'noop' (returnerar tom proposals-array).
   * 'mock' = deterministisk eko-reviewer som kopierar trigger-info utan att
   * gissa targets. ALDRIG 'external' i denna fil — externa anrop måste
   * implementeras i en separat edge function.
   */
  reviewerKind?: 'noop' | 'mock';
  nowIso?: string;
}

/**
 * Default reviewer: gör INTE något externt anrop. Returnerar antingen tom
 * proposals-array (noop) eller en deterministisk mock som speglar triggers
 * tillbaka som `needs_user_input`-förslag — fortfarande utan att gissa
 * targets eller flytta personen.
 *
 * Externa AI-anrop ska implementeras i en separat edge function (t.ex.
 * analyze-unclear-segment) som ANVÄNDER buildAiWorkdayReviewInput för sin
 * payload. Denna fil kopplar med flit ingen LOVABLE_API_KEY.
 */
export function reviewWorkdayWithAi(
  input: AiWorkdayReviewInput,
  opts: ReviewWorkdayWithAiOptions = {},
): AiWorkdayReviewOutput {
  const startedAt = Date.now();
  const kind = opts.reviewerKind ?? 'noop';
  const invokedAt = opts.nowIso ?? new Date().toISOString();

  if (kind === 'noop') {
    return {
      proposals: [],
      summary: input.segmentCases.length === 0 && input.proposalCases.length === 0
        ? 'Inga osäkra fall — AI-review behövs ej.'
        : `Noop reviewer: ${input.segmentCases.length} segment och ${input.proposalCases.length} förslag identifierade som osäkra. Ingen extern AI kopplad.`,
      risks: [],
      reviewer: {
        kind: 'noop',
        invokedAt,
        durationMs: Date.now() - startedAt,
        note: 'AI-klient ej konfigurerad i denna modul. Återanvänd buildAiWorkdayReviewInput i extern edge function vid behov.',
      },
    };
  }

  // Mock-reviewer: speglar triggers → needs_user_input-proposal. Gissar
  // ALDRIG targets. requiresHumanApproval = true (hård regel).
  const proposals: AiReviewProposal[] = [];
  for (const c of input.segmentCases) {
    proposals.push({
      proposalType: 'needs_user_input',
      targetType: null,
      targetId: null,
      label: c.label,
      confidence: 'low',
      requiresHumanApproval: true,
      reason: `mock_review:${c.triggers.join('+')}`,
      sourceSegmentIds: [c.segmentId, c.allocationSegmentId],
      warnings: ['ai_mock_reviewer_no_external_call'],
    });
  }
  for (const p of input.proposalCases) {
    proposals.push({
      proposalType: 'confirm_workday_end',
      targetType: null,
      targetId: null,
      label: null,
      confidence: p.confidence,
      requiresHumanApproval: true,
      reason: `mock_review:${p.proposalType}`,
      sourceSegmentIds: [p.proposalSegmentId],
      warnings: ['ai_mock_reviewer_no_external_call'],
    });
  }

  return {
    proposals,
    summary: `Mock reviewer: ${proposals.length} förslag (alla kräver mänsklig granskning).`,
    risks: input.workday.isOpen ? ['workday_still_open_at_review_time'] : [],
    reviewer: {
      kind: 'mock',
      invokedAt,
      durationMs: Date.now() - startedAt,
    },
  };
}
