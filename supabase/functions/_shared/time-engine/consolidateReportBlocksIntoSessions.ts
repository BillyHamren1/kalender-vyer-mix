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
 * Time Engine 2.10 — EN canonical lista (HARD_SESSION_BREAK_REASONS) styr
 * både sandwich-passet och probabilistic-passet. Soft/signal-baserade
 * needs_review-block absorberas. Hard needs_review-block bryter session
 * och behålls som "Granska". Det får inte längre finnas två separata
 * listor som kan glida isär.
 *
 * Absorberas in i föregående/efterföljande work-blockets session:
 *   - needs_review ENDAST om reasons är tomma eller alla är soft/signal
 *     (signal_gap_*, missing_transition_evidence, low_gps_signal,
 *     speed_violation_no_distance, short_cross_target_movement,
 *     short_transport_to_unknown, absorbed_micro_movement,
 *     session_consolidated, uncertain_transition,
 *     probabilistic_session_absorption) → isSoftAbsorbableNeedsReview()
 *   - unknown (vilken som helst storlek)
 *   - transport med distanceMeters < realTripMinDistanceMeters (jitter
 *     eller transport utan tydlig destination)
 *   - work-block utan target (otarget arbete)
 *
 * BRYTER session (block efter detta absorberas EJ):
 *   - work-block med ANNAN känd target
 *   - transport med distanceMeters >= realTripMinDistanceMeters (riktig
 *     resa till annan plats) — speed_mps ensamt skapar aldrig transport
 *   - block med någon reason i HARD_SESSION_BREAK_REASONS (t.ex.
 *     unknown_place_no_anchor, conflicting_targets, private_residence,
 *     workday_ended, planned_assignment_target_change, impossible_route,
 *     signal_gap_unbound, unabsorbable_block …)
 *
 * Diagnostics:
 *   - rejectedHardReviewAbsorptionCount + rejectedHardReviewAbsorptionReasons
 *     räknar varje gång ett needs_review-block STOPPADES från absorption
 *     på grund av en hard reason.
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
  /** Time Engine 2.9 — antal block absorberade via shouldAbsorbAsProbableSameSession
   *  (utan strikt closing same-target work-block). */
  probabilisticAbsorptionCount: number;
  /** Time Engine 2.10 — antal needs_review-block som STOPPADES från
   *  absorption på grund av en reason i HARD_SESSION_BREAK_REASONS. */
  rejectedHardReviewAbsorptionCount: number;
  /** Time Engine 2.10 — count per hard reason som blockerade absorption. */
  rejectedHardReviewAbsorptionReasons: Record<string, number>;
  examples: Array<{
    /** Time Engine 2.8 — full session example for diagnostics_json. */
    staffName: string | null;
    sessionLabel: string | null;
    sessionStart: string;
    sessionEnd: string;
    sessionDurationMinutes: number;
    originalBlockKinds: string[];
    originalBlockLabels: string[];
    absorbedBlockCount: number;
    /** Time Engine 2.9 — set of reasons + warning labels för absorberade block. */
    absorbedReasons: string[];
    warningReasons: string[];
    signalGapMinutes: number;
    internalMovementMinutes: number;
    finalKind: string;
    finalReviewState: string;
    warningLabel: string | null;
    reasons: string[];
    // Legacy fields (kept for backwards compatibility with previous readers).
    sessionTargetLabel: string | null;
    sessionStartAt: string;
    sessionEndAt: string;
    absorbedKinds: string[];
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

  /** Time Engine 2.8 — optional staff name for diagnostics examples. */
  staffName?: string | null;
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

const normalizeLooseLabel = (value: string | null | undefined): string | null => {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return normalized.length > 2 ? normalized : null;
};

const isSoftTechnicalNeedsReview = (block: ReportCandidateBlock): boolean => {
  if (block.kind !== 'needs_review') return false;
  const reasons = block.reviewReasons ?? [];
  if (reasons.length === 0) return true;
  return reasons.every((reason) =>
    SOFT_REVIEW_REASONS.has(reason) || SIGNAL_GAP_REASONS.has(reason),
  );
};

const isTechnicalNoiseBlock = (
  block: ReportCandidateBlock | undefined,
  realTripMinDistanceMeters: number,
): boolean => {
  if (!block) return false;
  if (block.kind === 'unknown') return true;
  if (isSoftTechnicalNeedsReview(block)) return true;
  if (block.kind === 'transport') {
    const distanceMeters = block.evidenceSummary?.distanceMeters ?? 0;
    return distanceMeters < realTripMinDistanceMeters;
  }
  if (block.kind === 'work' && !sessionTargetKey(block)) return true;
  return false;
};

function shouldAbsorbAsProbableSameSession(
  previous: ReportCandidateBlock | undefined,
  current: ReportCandidateBlock,
  next: ReportCandidateBlock | undefined,
  deps: ConsolidationDeps,
): { absorb: boolean; host?: 'prev' | 'next'; reason: string } {
  if (!isTechnicalNoiseBlock(current, deps.realTripMinDistanceMeters)) {
    return { absorb: false, reason: 'not_technical_noise' };
  }

  const prevIsWork = previous?.kind === 'work' && !hasBreakingReason(previous);
  const nextIsWork = next?.kind === 'work' && !hasBreakingReason(next);
  if (!prevIsWork && !nextIsWork) {
    return { absorb: false, reason: 'no_neighbor_work_host' };
  }

  const prevKey = sessionTargetKey(previous);
  const nextKey = sessionTargetKey(next);
  const prevLabel = normalizeLooseLabel(previous?.targetLabel ?? previous?.toLabel ?? previous?.fromLabel);
  const nextLabel = normalizeLooseLabel(next?.targetLabel ?? next?.toLabel ?? next?.fromLabel);
  const curLabel = normalizeLooseLabel(current.targetLabel ?? current.toLabel ?? current.fromLabel);
  const currentDistance = current.evidenceSummary?.distanceMeters ?? 0;
  const noClearAlternateDestination =
    currentDistance < deps.realTripMinDistanceMeters && !hasBreakingReason(current);

  if (prevIsWork && nextIsWork) {
    const sameContext =
      (prevKey && nextKey && prevKey === nextKey) ||
      (prevLabel && nextLabel && prevLabel === nextLabel);
    if (sameContext && noClearAlternateDestination) {
      return { absorb: true, host: 'prev', reason: 'same_context_neighbors' };
    }
  }

  if (prevIsWork) {
    const prevMatchesCurrent =
      (prevKey && curLabel && prevLabel === curLabel) ||
      (prevLabel && curLabel && prevLabel === curLabel) ||
      (!!prevKey && !curLabel);
    if (prevMatchesCurrent && noClearAlternateDestination) {
      return { absorb: true, host: 'prev', reason: 'previous_context_match' };
    }
  }

  if (nextIsWork) {
    const nextMatchesCurrent =
      (nextKey && curLabel && nextLabel === curLabel) ||
      (nextLabel && curLabel && nextLabel === curLabel) ||
      (!!nextKey && !curLabel);
    if (nextMatchesCurrent && noClearAlternateDestination) {
      return { absorb: true, host: 'next', reason: 'next_context_match' };
    }
  }

  if (prevIsWork && !nextIsWork && noClearAlternateDestination) {
    return { absorb: true, host: 'prev', reason: 'trailing_technical_noise' };
  }

  if (nextIsWork && !prevIsWork && noClearAlternateDestination) {
    return { absorb: true, host: 'next', reason: 'leading_technical_noise' };
  }

  return { absorb: false, reason: 'insufficient_context' };
}

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
    demotedNeedsReviewBlocksCount: 0,
    probabilisticAbsorptionCount: 0,
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
      const absorbedLabels: string[] = [];
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
        absorbedLabels.push(r.targetLabel ?? r.toLabel ?? r.fromLabel ?? r.kind);
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

      // Time Engine 2.8 — synthetic sessionId (stable before assignId() runs).
      const sessionId =
        `session::${cur.startAt}::${cur.targetType ?? 'na'}::${cur.targetId ?? cur.targetLabel ?? 'unknown'}`;
      cur.sessionId = sessionId;
      const trail: Array<{
        absorbedIntoSessionId: string;
        absorbedOriginalKind: string;
        absorbedReason: string | null;
      }> = cur.absorbedTrail ?? [];

      // Absorb everything (k+1 .. closeAt) into cur
      for (let j = k + 1; j <= closeAt; j++) {
        const victim = out[j];
        const victimReasons = victim.reviewReasons ?? [];
        trail.push({
          absorbedIntoSessionId: sessionId,
          absorbedOriginalKind: victim.kind,
          absorbedReason: victimReasons[0] ?? null,
        });
        deps.absorbInto(cur, victim);
      }
      cur.absorbedTrail = trail;
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
          staffName: deps.staffName ?? null,
          sessionLabel: cur.targetLabel,
          sessionStart: sessionStart,
          sessionEnd: sessionEndCandidate,
          sessionDurationMinutes: cur.durationMinutes,
          originalBlockKinds: ['work', ...absorbedKinds],
          originalBlockLabels: [
            cur.targetLabel ?? cur.kind,
            ...absorbedLabels,
          ],
          absorbedBlockCount: absorbedCount,
          absorbedReasons: Array.from(new Set(cur.absorbedReasons ?? [])),
          warningReasons: Array.from(new Set(cur.warningReasons ?? [])),
          signalGapMinutes: cur.signalGapMinutes,
          internalMovementMinutes: cur.internalMovementMinutes ?? 0,
          finalKind: cur.kind,
          finalReviewState: cur.reviewState,
          warningLabel: cur.warningLabel ?? null,
          reasons: [...(cur.reviewReasons ?? [])],
          // Legacy fields (back-compat).
          sessionTargetLabel: cur.targetLabel,
          sessionStartAt: sessionStart,
          sessionEndAt: sessionEndCandidate,
          absorbedKinds,
        });
      }

      changed = true;
      break;
    }
  }


  // ───────────────────────────────────────────────────────────────────────
  // Time Engine 2.9 — Probabilistic same-session absorption pass.
  //
  // Den strikta sandwich-passen ovan kräver ett "closing" work-block med
  // SAMMA target. Det missar verkliga fall där arbetet slutar utan ett
  // följande work-block (dagens sista session, pågående timer som ännu inte
  // stoppats), eller där host-blocket före ensamt äger kontexten.
  //
  // Denna pass är sannolikhetsbaserad: ett tekniskt brus-block (signal_gap,
  // unknown, soft needs_review, transport <500m utan tydlig destination)
  // absorberas in i föregående eller efterföljande work-host om
  // shouldAbsorbAsProbableSameSession säger ja.
  //
  // Bryts av samma hårda regler (private_residence, workday_ended,
  // clear_other_destination, riktig resa ≥500 m, konkurrerande targets).
  // ───────────────────────────────────────────────────────────────────────
  let probaChanged = true;
  let probaSafety = 0;
  while (probaChanged && probaSafety < 200) {
    probaChanged = false;
    probaSafety += 1;
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      if (cur.kind === 'work') continue;
      if (hasBreakingReason(cur)) continue;
      const prev = i > 0 ? out[i - 1] : undefined;
      const next = i < out.length - 1 ? out[i + 1] : undefined;

      const decision = shouldAbsorbAsProbableSameSession(prev, cur, next, deps);
      if (!decision.absorb || !decision.host) continue;

      const host = decision.host === 'prev' ? prev! : next!;
      const sessionId =
        host.sessionId ??
        `session::${host.startAt}::${host.targetType ?? 'na'}::${host.targetId ?? host.targetLabel ?? 'unknown'}`;
      host.sessionId = sessionId;
      host.hasProbabilisticConsolidation = true;

      const trail = host.absorbedTrail ?? [];
      trail.push({
        absorbedIntoSessionId: sessionId,
        absorbedOriginalKind: cur.kind,
        absorbedReason: (cur.reviewReasons ?? [])[0] ?? decision.reason,
      });
      host.absorbedTrail = trail;

      const dist = cur.evidenceSummary?.distanceMeters ?? 0;
      if (cur.kind === 'needs_review') {
        const isSignalGap = (cur.reviewReasons ?? []).some((rr) => SIGNAL_GAP_REASONS.has(rr));
        if (isSignalGap) diagnostics.absorbedSignalGapBlocksCount += 1;
        else diagnostics.absorbedNeedsReviewBlocksCount += 1;
      } else if (cur.kind === 'unknown') {
        diagnostics.absorbedUnknownBlocksCount += 1;
      } else if (cur.kind === 'transport') {
        diagnostics.absorbedInternalTransportBlocksCount += 1;
        host.internalMovementMinutes =
          (host.internalMovementMinutes ?? 0) + cur.durationMinutes;
        host.internalMovementDistanceMeters =
          (host.internalMovementDistanceMeters ?? 0) + dist;
      }

      deps.absorbInto(host, cur);
      out.splice(i, 1);

      if (!host.reviewReasons.includes('session_consolidated')) {
        host.reviewReasons.push('session_consolidated');
      }
      host.warningReasons = Array.from(new Set([
        ...(host.warningReasons ?? []),
        'probabilistic_session_absorption',
      ]));
      host.subtitle =
        `${deps.fmtClock(host.startAt)}–${deps.fmtClock(host.endAt)} · ${deps.fmtDuration(host.durationMinutes)}`;

      diagnostics.probabilisticAbsorptionCount += 1;
      probaChanged = true;
      break;
    }
  }

  // Mark hasSignalUncertainty on all sessions/blocks for downstream UI hint.
  for (const r of out) {
    const sigMin = r.signalGapMinutes ?? 0;
    const sigCount = r.signalGapCount ?? 0;
    const sigWarn = (r.warningReasons ?? []).some(
      (w) => w === 'signal_gap_inside_session',
    );
    if (sigMin > 0 || sigCount > 0 || sigWarn) {
      r.hasSignalUncertainty = true;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Time Engine 2.7 — Needs-review cleanup pass.
  // Efter sessions-konsolideringen: gå igenom kvarvarande needs_review-block
  // och demota till reviewState='ok' om reasons ENBART är soft (signal_gap,
  // låg GPS-signal, missing_transition_evidence, transport <500m utan
  // distans, speed-violation utan distans, redan-absorberat).
  // Sparar originalreasons i `absorbedReasons` så ingen information tappas.
  // ───────────────────────────────────────────────────────────────────────
  for (const r of out) {
    if (r.reviewState !== 'needs_review') continue;
    const reasons = r.reviewReasons ?? [];
    if (reasons.length === 0) {
      r.reviewState = 'ok';
      diagnostics.demotedNeedsReviewBlocksCount += 1;
      continue;
    }
    const hasHard = reasons.some((rr) => HARD_REVIEW_REASONS.has(rr));
    if (hasHard) continue; // legitim needs_review, behåll.

    const allSoft = reasons.every(
      (rr) => SOFT_REVIEW_REASONS.has(rr) || SIGNAL_GAP_REASONS.has(rr),
    );
    if (!allSoft) continue; // okänd reason → konservativt: behåll needs_review.

    // Spara original-reasons för spårbarhet och rensa.
    r.absorbedReasons = Array.from(new Set([
      ...(r.absorbedReasons ?? []),
      ...reasons,
    ]));
    r.reviewState = 'ok';
    diagnostics.demotedNeedsReviewBlocksCount += 1;

    // Sätt warning om signalproblem fanns.
    const hadSignal =
      reasons.some((rr) => SIGNAL_GAP_REASONS.has(rr)) ||
      r.signalGapMinutes > 0 ||
      (r.signalGapCount ?? 0) > 0;
    if (hadSignal) {
      r.warningReasons = Array.from(new Set([
        ...(r.warningReasons ?? []),
        'signal_gap_inside_session',
      ]));
      const label = r.signalGapMinutes > 0
        ? `Signal saknades periodvis: ${deps.fmtDuration(r.signalGapMinutes)}`
        : 'Signal saknades periodvis';
      if (!r.warningLabel || r.warningLabel === 'Signal saknades periodvis') {
        r.warningLabel = label;
      }
    }
  }

  diagnostics.blocksAfterSessionConsolidation = out.length;
  diagnostics.preservedNeedsReviewBlocksCount =
    out.filter((r) => r.reviewState === 'needs_review').length;
  diagnostics.preservedTransportBlocksCount =
    out.filter((r) => r.kind === 'transport').length;

  return { blocks: out, diagnostics };
}
