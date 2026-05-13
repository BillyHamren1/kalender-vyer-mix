/**
 * Time Engine — cleanupNeedsReviewFromLocationTruth (Location Truth 1.7, del 3)
 * =============================================================================
 *
 * Pure helper. Tar `ReportBlock[]` och rensar bort needs_review som motorn
 * faktiskt KAN avgöra med locationTruth.
 *
 * needs_review FÅR finnas vid:
 *   - unknown_place utan ankare
 *   - flera konkurrerande targets utan vinnare
 *   - faktisk resa utan start/slut
 *   - private/home conflict
 *   - signalgap som inte kan kopplas till plats/rutt
 *   - omöjlig rutt
 *
 * needs_review FÅR INTE finnas pga:
 *   - signalgap inne i samma plats        → warningReasons: ['signal_gap_inside_same_location']
 *   - medium confidence                   → warningReasons: ['medium_confidence']
 *   - speed_mps-konflikt                  → warningReasons: ['speed_mps_conflict']
 *   - transport under 500 m               → warningReasons: ['below_transport_min_distance']
 *   - active timer-konflikt               → warningReasons: ['active_timer_target_ignored']
 *   - Team 1-label                        → warningReasons: ['team_label_replaced']
 *   - missing_transition_evidence som locationTruth bridgear
 */

import type { ReportBlock } from './buildReportBlocksFromLocationTruth.ts';

const DOWNGRADE_REASONS = new Set<string>([
  'signal_gap_inside_same_location',
  'signal_gap_inside_unknown_place',
  'signal_gap_inside_movement',
  'medium_confidence',
  'speed_mps_conflict',
  'below_transport_min_distance',
  'active_timer_target_ignored',
  'team_label_replaced',
  'missing_transition_evidence',
]);

const KEEP_REASONS = new Set<string>([
  'unknown_place_no_anchor',
  'multiple_competing_targets',
  'actual_trip_missing_endpoints',
  'private_home_conflict',
  'signal_gap_unbridgeable',
  'impossible_route',
]);

export interface NeedsReviewFromLocationTruthDiagnostics {
  needsReviewBefore: number;
  needsReviewAfter: number;
  convertedToWarningCount: number;
  unresolvedUnknownCount: number;
  examples: Array<{
    id: string;
    title: string;
    before: 'needs_review' | 'ok';
    after: 'needs_review' | 'ok';
    reason: 'downgraded_to_warning' | 'kept_unknown' | 'kept_explicit' | 'no_change';
    addedWarnings: string[];
  }>;
}

function blockReasons(b: ReportBlock): string[] {
  return [
    ...(b.locationTruthReasons ?? []),
  ];
}

export function cleanupNeedsReviewFromLocationTruth(
  inputBlocks: ReportBlock[],
): { blocks: ReportBlock[]; diagnostics: NeedsReviewFromLocationTruthDiagnostics } {
  const diag: NeedsReviewFromLocationTruthDiagnostics = {
    needsReviewBefore: 0,
    needsReviewAfter: 0,
    convertedToWarningCount: 0,
    unresolvedUnknownCount: 0,
    examples: [],
  };

  // Vi tillåter ett valfritt warningReasons-fält på blocket utan att bryta
  // typkontraktet — utvidgar via mutation.
  const out: (ReportBlock & { warningReasons?: string[]; warningLabel?: string | null })[] = inputBlocks.map((b) => ({ ...b }));

  for (const b of out) {
    const before: 'needs_review' | 'ok' = b.reviewState;
    if (before === 'needs_review') diag.needsReviewBefore += 1;

    const reasons = blockReasons(b);
    const downgrade = reasons.find((r) => DOWNGRADE_REASONS.has(r));
    const keepExplicit = reasons.find((r) => KEEP_REASONS.has(r));

    let after: 'needs_review' | 'ok' = before;
    let outcome: NeedsReviewFromLocationTruthDiagnostics['examples'][number]['reason'] = 'no_change';
    const added: string[] = [];

    if (before === 'needs_review' && b.kind === 'unknown' && !keepExplicit) {
      // Endast en unknown utan ankare ska BEHÅLLAS.
      after = 'needs_review';
      diag.unresolvedUnknownCount += 1;
      outcome = 'kept_unknown';
    } else if (before === 'needs_review' && downgrade && !keepExplicit) {
      after = 'ok';
      diag.convertedToWarningCount += 1;
      added.push(downgrade);
      b.warningReasons = Array.from(new Set([...(b.warningReasons ?? []), downgrade]));
      b.warningLabel = b.warningLabel ?? 'Signalproblem – inte tidkonflikt';
      outcome = 'downgraded_to_warning';
    } else if (before === 'needs_review' && keepExplicit) {
      after = 'needs_review';
      outcome = 'kept_explicit';
    }

    b.reviewState = after;
    if (after === 'needs_review') diag.needsReviewAfter += 1;

    if (diag.examples.length < 30 && outcome !== 'no_change') {
      diag.examples.push({
        id: b.id,
        title: b.title,
        before,
        after,
        reason: outcome,
        addedWarnings: added,
      });
    }
  }

  return { blocks: out, diagnostics: diag };
}
