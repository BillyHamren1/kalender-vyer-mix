/**
 * consolidateReportBlocksIntoSessions
 * ───────────────────────────────────
 * SISTA Time Engine pass innan summary_json / display_blocks_json /
 * staff_day_report_cache skrivs.
 *
 * Slår ihop tekniska kedjor (TRANSPORT-jitter / GRANSKA-signal_gap /
 * unknown_place / mikro-transitions) som ligger MELLAN två work-block
 * med samma target till EN sammanhållen arbetssession.
 *
 * Förhindrar att UI:t i /staff-management/time-reports visar
 *   "Transport → Granska → Transport → Granska"
 * när allt egentligen hör till samma jobb/arbetspass.
 *
 * Pure function. Operates on a copy of the input array. Inga DB-anrop.
 * Inga writes till time_reports / workdays / location_time_entries /
 * travel_time_logs.
 *
 * Absorberas in i föregående work-blockets session:
 *   - needs_review (vilken anledning som helst — inkl. signal_gap_*,
 *     missing_transition_evidence, short_cross_target_movement,
 *     short_transport_to_unknown) NÄR ett work-block med samma target
 *     dyker upp efter rad-blocket
 *   - unknown (vilken som helst storlek)
 *   - transport med distanceMeters < realTripMinDistanceMeters (jitter
 *     eller transport utan tydlig destination)
 *   - work-block utan target (otarget arbete)
 *
 * BRYTER session (block efter detta absorberas EJ):
 *   - work-block med ANNAN känd target
 *   - transport med distanceMeters >= realTripMinDistanceMeters (riktig
 *     resa till annan plats)
 *
 * Garantier:
 *   - Aldrig writes till time_reports/workdays/LTE/travel.
 *   - Riktig transport >= realTripMinDistanceMeters (default 500 m) till
 *     annan plats förblir egen rad.
 *   - GRANSKA blir aldrig automatiskt arbete utan ett efterföljande
 *     work-block med samma target som "binder" sessionen.
 *   - signalGapMinutes och internalMovementMinutes ökas på sessionen och
 *     visas som warning ("Signal saknades periodvis").
 */

import type { ReportCandidateBlock } from './buildReportCandidateBlocks.ts';

export interface SessionConsolidationDiagnostics {
  blocksBeforeSessionConsolidation: number;
  blocksAfterSessionConsolidation: number;
  sessionsCreatedCount: number;
  absorbedSignalGapBlocksCount: number;
  absorbedNeedsReviewBlocksCount: number;
  absorbedInternalTransportBlocksCount: number;
  absorbedUnknownBlocksCount: number;
  preservedNeedsReviewBlocksCount: number;
  preservedTransportBlocksCount: number;
  /** Time Engine 2.7 — antal needs_review-block som efter konsolidering
   *  demoterades till reviewState='ok' (rena soft-skäl, ingen hård orsak). */
  demotedNeedsReviewBlocksCount: number;
  examples: Array<{
    sessionTargetLabel: string | null;
    sessionStartAt: string;
    sessionEndAt: string;
    sessionDurationMinutes: number;
    absorbedBlockCount: number;
    absorbedKinds: string[];
    signalGapMinutes: number;
    internalMovementMinutes: number;
  }>;
}

export interface ConsolidationDeps {
  /** Real-trip threshold in meters — default 500 m. Transport segments at or
   *  above this distance break the session (treated as real movement to
   *  another place). */
  realTripMinDistanceMeters: number;

  /** Absorption helper from buildReportCandidateBlocks. Mutates host. */
  absorbInto: (host: ReportCandidateBlock, victim: ReportCandidateBlock) => void;

  /** Subtitle formatters (closure-bound to the calling builder). */
  fmtClock: (iso: string) => string;
  fmtDuration: (min: number) => string;

  /** Reason classifier sets (closure-bound to the calling builder). */
  blockingReviewReasons: Set<string>;
  warningOnlyReasons: Set<string>;
}

/** Reasons that indicate "this needs_review block is essentially a signal gap" */
const SIGNAL_GAP_REASONS = new Set<string>([
  'signal_gap_unresolved',
  'signal_gap_open_day',
  'signal_gaps_inside_work_block',
  'missing_transition_evidence',
  'targets_differ_without_movement',
]);

/**
 * Time Engine 2.4 — review-reasons som ALLTID bryter en session.
 * Om något av dessa förekommer på ett efterföljande block får sessionen
 * inte absorbera vidare; blocket behålls som eget block (eller separat
 * transport/session enligt befintlig modell).
 *
 * Täcker:
 *  - private_residence / boende / home-konflikt
 *  - tydligt stoppad arbetsdag (workday_ended / workday_stopped /
 *    explicit_stop) om uppströms-motorn satt en sådan markör
 *  - ny planerad assignment med annan target
 *  - tydlig annan destination
 *  - omöjlig rutt (speed/teleport som faktiskt har distans bakom sig)
 *  - flera konkurrerande targets utan vinnare
 *
 * OBS: bara signal_gap-baserade reasons + uncertain transition får
 * absorberas. Allt annat = break.
 */
const SESSION_BREAK_REASONS = new Set<string>([
  'private_residence',
  'private_zone',
  'home_private_conflict',
  'workday_ended',
  'workday_stopped',
  'explicit_stop',
  'day_end_marker',
  'new_planned_assignment_other_target',
  'planned_assignment_target_change',
  'clear_other_destination',
  'impossible_route',
  'route_speed_violation_with_distance',
  'multiple_competing_targets',
  'target_ambiguous_no_winner',
  'conflicting_targets',
]);

const hasBreakingReason = (r: ReportCandidateBlock): boolean => {
  const reasons = r.reviewReasons ?? [];
  return reasons.some((rr) => SESSION_BREAK_REASONS.has(rr));
};

/**
 * Time Engine 2.7 — needs_review cleanup:
 * "hårda" reasons som ALLTID motiverar att blocket behåller needs_review
 * även efter konsolidering. Allt som INTE är i denna mängd (eller i
 * SIGNAL_GAP_REASONS) räknas som soft och tillåter demotion till 'ok'.
 *
 * Täcker:
 *  - okänd plats utan ankare
 *  - flera konkurrerande targets utan tydlig vinnare
 *  - faktisk resa saknar start/slut
 *  - home/private/private_residence-konflikt
 *  - omöjlig rutt (med faktisk distans)
 *  - signalgap som inte kan kopplas (cross-target/unbound)
 *  - explicit "kan ej absorberas"
 */
const HARD_REVIEW_REASONS = new Set<string>([
  'unknown_place_no_anchor',
  'no_anchor_for_unknown_place',
  'multiple_competing_targets',
  'target_ambiguous_no_winner',
  'conflicting_targets',
  'travel_missing_endpoints',
  'travel_missing_start_or_end',
  'home_private_conflict',
  'private_residence',
  'private_zone',
  'impossible_route',
  'route_speed_violation_with_distance',
  'signal_gap_unbound',
  'signal_gap_cross_target',
  'unabsorbable_block',
]);

/**
 * "Soft" reasons som ENSAMMA inte motiverar needs_review efter konsolidering.
 * Innehåller signal_gap-familjen + tekniska glapp som kan absorberas.
 */
const SOFT_REVIEW_REASONS = new Set<string>([
  ...SIGNAL_GAP_REASONS,
  'low_gps_signal',
  'speed_violation_no_distance',
  'short_cross_target_movement',
  'short_transport_to_unknown',
  'absorbed_micro_movement',
  'session_consolidated',
]);

/**
 * Stark sessionsnyckel — matchar på targetType+targetId först (täcker
 * locationId, projectId, bookingId, largeProjectId via targetType-prefix).
 * Faller tillbaka på normaliserad targetLabel när id saknas men labeln
 * är specifik (>3 tecken) — täcker "samma plats / planned assignment /
 * work area" när uppströms-builden inte hann binda en id.
 */
const sessionTargetKey = (r: ReportCandidateBlock | undefined): string | null => {
  if (!r) return null;
  if (r.targetId) return `${r.targetType ?? ''}::${r.targetId}`;
  const label = (r.targetLabel ?? '').trim().toLowerCase();
  if (label.length > 3) return `label::${label}`;
  return null;
};

export interface ConsolidationResult {
  blocks: ReportCandidateBlock[];
  diagnostics: SessionConsolidationDiagnostics;
}

export function consolidateReportBlocksIntoSessions(
  inputBlocks: ReportCandidateBlock[],
  deps: ConsolidationDeps,
): ConsolidationResult {
  // Operate on a shallow copy of the array — block objects are still mutated
  // by absorbInto (they are passed by reference to the caller anyway), but
  // we don't reorder the caller's source list.
  const out: ReportCandidateBlock[] = inputBlocks.slice();

  const diagnostics: SessionConsolidationDiagnostics = {
    blocksBeforeSessionConsolidation: out.length,
    blocksAfterSessionConsolidation: out.length,
    sessionsCreatedCount: 0,
    absorbedSignalGapBlocksCount: 0,
    absorbedNeedsReviewBlocksCount: 0,
    absorbedInternalTransportBlocksCount: 0,
    absorbedUnknownBlocksCount: 0,
    preservedNeedsReviewBlocksCount: 0,
    preservedTransportBlocksCount: 0,
    examples: [],
  };

  let changed = true;
  let safety = 0;
  while (changed && safety < 200) {
    changed = false;
    safety += 1;

    for (let k = 0; k < out.length - 1; k++) {
      const cur = out[k];
      if (cur.kind !== 'work') continue;
      const curKey = sessionTargetKey(cur);
      if (!curKey) continue;

      // Look ahead for a closing same-target work block, only crossing
      // absorbable blocks.
      let closeAt = -1;
      let absorbedSignalGap = 0;
      let absorbedNeedsReview = 0;
      let absorbedInternalTransport = 0;
      let absorbedUnknown = 0;
      const absorbedKinds: string[] = [];
      let internalMovementMin = 0;
      let internalMovementMeters = 0;

      for (let j = k + 1; j < out.length; j++) {
        const r = out[j];
        const dist = r.evidenceSummary?.distanceMeters ?? 0;
        const rKey = sessionTargetKey(r);

        // HARD BREAKERS — block efter detta absorberas EJ.
        //
        // 1) Work-block med ANNAN känd target.
        if (r.kind === 'work' && rKey && rKey !== curKey) break;

        // 2) Riktig transport (>= realTripMinDistanceMeters, default 500 m).
        //    Konservativt: även utan label på destinationen är >=500 m egen
        //    GPS-förflyttning en riktig resa och får inte gömmas i sessionen.
        //    OBS: speed-only utan distans bryter inte (kräver faktisk
        //    förflyttning ≥ 500 m).
        if (
          r.kind === 'transport' &&
          dist >= deps.realTripMinDistanceMeters
        ) break;

        // 3) Time Engine 2.4 — Hårda break-reasons (private_residence,
        //    workday_ended, planned_assignment_target_change,
        //    clear_other_destination, impossible_route, conflicting_targets,
        //    m.fl.). Gäller oavsett block-kind.
        if (hasBreakingReason(r)) break;

        // Closing same-target work
        if (r.kind === 'work' && rKey && rKey === curKey) {
          closeAt = j;
          break;
        }

        // Absorbable kinds:
        //  - needs_review där reasons ENBART är signal-gap-/transition-
        //    relaterade (annars bryter SESSION_BREAK_REASONS ovan)
        //  - unknown (any size — sandwich-safe när bunden av samma target)
        //  - transport < realTripMinDistanceMeters (jitter / utan tydlig
        //    destination)
        //  - work without targetId (otarget arbete)
        const isAbsorbable =
          r.kind === 'needs_review' ||
          r.kind === 'unknown' ||
          (r.kind === 'transport' && dist < deps.realTripMinDistanceMeters) ||
          (r.kind === 'work' && !r.targetId);

        if (!isAbsorbable) break;

        absorbedKinds.push(r.kind);
        if (r.kind === 'needs_review') {
          const reasons = r.reviewReasons ?? [];
          const isSignalGap = reasons.some((rr) => SIGNAL_GAP_REASONS.has(rr));
          if (isSignalGap) absorbedSignalGap += 1;
          else absorbedNeedsReview += 1;
        } else if (r.kind === 'unknown') {
          absorbedUnknown += 1;
        } else if (r.kind === 'transport') {
          absorbedInternalTransport += 1;
          internalMovementMin += r.durationMinutes;
          internalMovementMeters += dist;
        }
      }

      if (closeAt < 0) continue;

      const sessionStart = cur.startAt;
      const sessionEndCandidate = out[closeAt].endAt;
      const absorbedCount = closeAt - k;

      // Absorb everything (k+1 .. closeAt) into cur
      for (let j = k + 1; j <= closeAt; j++) {
        deps.absorbInto(cur, out[j]);
      }
      out.splice(k + 1, closeAt - k);

      cur.internalMovementMinutes =
        (cur.internalMovementMinutes ?? 0) + internalMovementMin;
      cur.internalMovementDistanceMeters =
        (cur.internalMovementDistanceMeters ?? 0) + internalMovementMeters;

      if (!cur.reviewReasons.includes('session_consolidated')) {
        cur.reviewReasons.push('session_consolidated');
      }
      // Strip blocking reasons we just resolved by binding to same target.
      // Signal-gap-baserade reasons (även om de listas som "blocking" uppströms)
      // räknas i Time Engine 2.5 som warning-only när vi har ett bindande
      // host-target — de blir metadata på sessionen istället för egen rad.
      cur.reviewReasons = cur.reviewReasons.filter(
        (rr) =>
          !deps.blockingReviewReasons.has(rr) ||
          deps.warningOnlyReasons.has(rr) ||
          SIGNAL_GAP_REASONS.has(rr),
      );

      // reviewState = 'ok' så länge host har target/label (vi vet vad det är).
      // needs_review skall ENDAST finnas kvar om motorn faktiskt inte kan
      // klassa blocket — d.v.s. host saknar target OCH har kvar äkta blocking
      // reasons (inte signal-gap).
      const hasNonSignalBlocking = cur.reviewReasons.some(
        (rr) => deps.blockingReviewReasons.has(rr) && !SIGNAL_GAP_REASONS.has(rr),
      );
      const hostKnown = !!(cur.targetId || (cur.targetLabel && cur.targetLabel.trim().length > 0));
      cur.reviewState = hostKnown || !hasNonSignalBlocking ? 'ok' : 'needs_review';

      // Time Engine 2.5 — signalproblem som metadata/warning, inte eget event.
      const sessionSignalMin = cur.signalGapMinutes;
      const sessionSignalCount = cur.signalGapCount ?? 0;
      if (sessionSignalMin > 0 || sessionSignalCount > 0) {
        cur.warningReasons = Array.from(new Set([
          ...(cur.warningReasons ?? []),
          'signal_gap_inside_session',
        ]));
        const label = sessionSignalMin > 0
          ? `Signal saknades periodvis: ${deps.fmtDuration(sessionSignalMin)}`
          : 'Signal saknades periodvis';
        // Skriv över ev. tidigare generisk warning så minutangivelse syns.
        if (
          !cur.warningLabel ||
          cur.warningLabel === 'Signal saknades periodvis'
        ) {
          cur.warningLabel = label;
        }
      } else if (internalMovementMin > 0 && !cur.warningLabel) {
        cur.warningLabel = 'Intern rörelse periodvis';
      }

      // Time Engine 2.6 — markera intern rörelse separat (oavsett om signal-
      // gap också finns), så UI/diagnostics kan särskilja intern rörelse
      // (jitter / rörelse inom samma arbetsområde) från ren signalförlust.
      if (internalMovementMin > 0 || absorbedInternalTransport > 0) {
        cur.warningReasons = Array.from(new Set([
          ...(cur.warningReasons ?? []),
          'internal_movement_inside_session',
        ]));
      }

      cur.subtitle =
        `${deps.fmtClock(cur.startAt)}–${deps.fmtClock(cur.endAt)} · ${deps.fmtDuration(cur.durationMinutes)}`;

      diagnostics.sessionsCreatedCount += 1;
      diagnostics.absorbedSignalGapBlocksCount += absorbedSignalGap;
      diagnostics.absorbedNeedsReviewBlocksCount += absorbedNeedsReview;
      diagnostics.absorbedInternalTransportBlocksCount += absorbedInternalTransport;
      diagnostics.absorbedUnknownBlocksCount += absorbedUnknown;

      if (diagnostics.examples.length < 20) {
        diagnostics.examples.push({
          sessionTargetLabel: cur.targetLabel,
          sessionStartAt: sessionStart,
          sessionEndAt: sessionEndCandidate,
          sessionDurationMinutes: cur.durationMinutes,
          absorbedBlockCount: absorbedCount,
          absorbedKinds,
          signalGapMinutes: cur.signalGapMinutes,
          internalMovementMinutes: cur.internalMovementMinutes ?? 0,
        });
      }

      changed = true;
      break;
    }
  }

  diagnostics.blocksAfterSessionConsolidation = out.length;
  diagnostics.preservedNeedsReviewBlocksCount =
    out.filter((r) => r.kind === 'needs_review').length;
  diagnostics.preservedTransportBlocksCount =
    out.filter((r) => r.kind === 'transport').length;

  return { blocks: out, diagnostics };
}
