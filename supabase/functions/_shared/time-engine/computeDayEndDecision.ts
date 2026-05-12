// Time Engine 3.2 — computeDayEndDecision
// ─────────────────────────────────────────
// Pure helper that decides whether a staff's *visible* work day for a given
// (Stockholm) date is ended, and if so, when and why.
//
// READ-ONLY. Writes nothing. No DB access. No Date.now() for historical days.
//
// The decision is stored in `diagnostics_json.dayEndDecision` and is intended
// for /staff-management/time-reports. It does NOT mutate report blocks in
// this revision — the engine still emits its existing rows. The decision is
// the diagnostic source of truth that downstream views (and the next engine
// revision) can use to clamp ongoing blocks.
//
// Inputs are intentionally minimal: blocks + active registrations + the most
// recent GPS evidence + home anchors + the Stockholm day window. Everything
// is precomputed in the callsite.

import type {
  ReportCandidateBlock,
  ActiveTimeRegistrationInput,
  OpenActiveRegistrationContext,
  HomeAnchorInput,
} from './buildReportCandidateBlocks.ts';

export type DayEndReason =
  | 'manual_stop'
  | 'admin_stop'
  | 'active_registration_stopped'
  | 'left_last_work_before_private_residence_commute'
  | 'long_distance_homebound_travel'
  | 'private_residence_after_last_work'
  | 'no_fresh_evidence_after_last_work'
  | 'report_day_ended'
  | 'still_active';

export type DayEndConfidence = 'high' | 'medium' | 'low';

export interface DayEndDecision {
  /** True when the visible work day should be considered ended. */
  dayEnded: boolean;
  /** Last point in time that should belong to the visible day (ISO). */
  endedAt: string | null;
  endReason: DayEndReason;
  confidence: DayEndConfidence;
  /** Human-readable evidence trail (kept short). */
  evidence: string[];
  /**
   * Set when the decision believes the day is over but engine output still
   * carries an open block. Downstream code/UI should treat this as a hint
   * that the visible day must be clamped at `endedAt`.
   */
  diagnostic?: 'active_timer_open_but_not_enough_engine_evidence' | null;
}

export interface ComputeDayEndDecisionInput {
  /** YYYY-MM-DD (the report day, Stockholm time). */
  date: string;
  /** Stockholm day window in UTC ISO. */
  dayStartUtcIso: string;
  dayEndUtcIso: string;
  /** Blocks emitted by buildReportCandidateBlocks for this day. */
  blocks: ReportCandidateBlock[];
  /** All active_time_registrations rows that overlap the day. */
  activeRegistrations: ActiveTimeRegistrationInput[];
  /** Open registration context, if any. */
  openActiveRegistration?: OpenActiveRegistrationContext | null;
  /** ISO timestamp of the last GPS ping in the day window, or null. */
  lastGpsPingAtIso: string | null;
  /** Home / private-residence anchors used by the engine. */
  homeAnchors: HomeAnchorInput[];
  /**
   * "Now" — only used when the date IS today (Stockholm). For historical
   * days the function NEVER consults Date.now and falls back to the day
   * window end. Pass new Date().toISOString() for live calls.
   */
  nowIso: string;
  /** Optional planned end of day (ISO) from BSA → bookings. */
  plannedEndOfDayIso?: string | null;
}

/** Evidence is "fresh" if the latest known engine evidence is within this
 *  many minutes of the open active timer's last activity. */
const FRESH_EVIDENCE_WINDOW_MIN = 30;

/**
 * Time Engine 4.6 — 15-mils-regel.
 * Hemresa < 15 mil räknas inte som arbete och får inte hålla dagen levande
 * fram till boende. Hemresa ≥ 15 mil kan vara arbetsrelaterad restid och
 * dagen kan då sluta vid residenceEnterAt.
 */
export const COMMUTE_DISTANCE_THRESHOLD_METERS = 150_000;

/** Buffer för att fånga transportblock som slutar strax efter
 *  residenceEnterAt p.g.a. GPS-jitter. */
const COMMUTE_TRANSPORT_BUFFER_MS = 5 * 60_000;

/** Treat a long stop_source as an explicit admin/emergency stop. */
const ADMIN_STOP_SOURCES = new Set([
  'admin',
  'admin_stop',
  'admin_force_stop',
  'emergency',
  'emergency_stop',
  'system_admin',
  'reset',
]);
const MANUAL_STOP_SOURCES = new Set([
  'user',
  'user_stop',
  'manual',
  'manual_stop',
  'mobile_user',
  'web_user',
  'staff',
]);

/**
 * Summa transport-distans (meter) för transportblock som ligger mellan
 * leaveWorkAt och residenceEnterAt (+ buffer). Används för att avgöra om
 * hemresan ska räknas som arbete (≥ 150 km) eller inte.
 */
function sumCommuteDistanceMeters(
  blocks: ReportCandidateBlock[],
  leaveWorkAtIso: string,
  residenceEnterAtIso: string,
): number {
  const fromMs = new Date(leaveWorkAtIso).getTime();
  const toMs = new Date(residenceEnterAtIso).getTime() + COMMUTE_TRANSPORT_BUFFER_MS;
  let sum = 0;
  for (const b of blocks) {
    if (b.kind !== 'transport') continue;
    const sMs = new Date(b.startAt).getTime();
    const eMs = new Date(b.endAt).getTime();
    if (eMs <= fromMs || sMs >= toMs) continue;
    const dist = Number(b.evidenceSummary?.distanceMeters ?? (b as any).distanceMeters ?? 0);
    if (Number.isFinite(dist) && dist > 0) sum += dist;
  }
  return Math.round(sum);
}

function clampToDay(iso: string | null, dayStart: string, dayEnd: string): string | null {
  if (!iso) return null;
  if (iso < dayStart) return dayStart;
  if (iso > dayEnd) return dayEnd;
  return iso;
}

function lastEvidenceFromBlocks(blocks: ReportCandidateBlock[]): string | null {
  let latest: string | null = null;
  for (const b of blocks) {
    const candidate = b.lastConfirmedAt ?? b.endAt ?? null;
    if (!candidate) continue;
    if (!latest || candidate > latest) latest = candidate;
  }
  return latest;
}

function lastWorkBlock(blocks: ReportCandidateBlock[]): ReportCandidateBlock | null {
  let last: ReportCandidateBlock | null = null;
  for (const b of blocks) {
    if (b.kind !== 'work') continue;
    if (!last || b.endAt > last.endAt) last = b;
  }
  return last;
}

function minutesBetween(aIso: string, bIso: string): number {
  return Math.abs((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
}

export function computeDayEndDecision(
  input: ComputeDayEndDecisionInput,
): DayEndDecision {
  const {
    date,
    dayStartUtcIso,
    dayEndUtcIso,
    blocks,
    activeRegistrations,
    openActiveRegistration,
    lastGpsPingAtIso,
    nowIso,
    plannedEndOfDayIso,
  } = input;

  const evidence: string[] = [];

  // ── 1. Historical days: never use Date.now, never have ongoing blocks ──
  const isHistorical = nowIso > dayEndUtcIso;
  const safeNow = isHistorical ? dayEndUtcIso : nowIso;
  if (isHistorical) {
    evidence.push(`historical_day:${date} (clamped to ${dayEndUtcIso})`);
  }

  // ── 2. Explicit stop wins ──────────────────────────────────────────────
  // Find the latest stopped registration that overlaps the day window.
  let latestExplicitStop: {
    stoppedAt: string;
    source: string;
    reason: DayEndReason;
  } | null = null;

  for (const reg of activeRegistrations) {
    const stoppedAt = reg.stoppedAt ?? reg.endedAt ?? null;
    if (!stoppedAt) continue;
    if (stoppedAt < dayStartUtcIso || stoppedAt > dayEndUtcIso) continue;
    const src = (reg.stopSource ?? '').toLowerCase();
    let reason: DayEndReason | null = null;
    if (ADMIN_STOP_SOURCES.has(src)) reason = 'admin_stop';
    else if (MANUAL_STOP_SOURCES.has(src)) reason = 'manual_stop';
    else reason = 'active_registration_stopped';
    if (!latestExplicitStop || stoppedAt > latestExplicitStop.stoppedAt) {
      latestExplicitStop = { stoppedAt, source: src || '∅', reason };
    }
  }

  const hasOpen = !!openActiveRegistration;

  if (latestExplicitStop && !hasOpen) {
    evidence.push(`explicit_stop:source=${latestExplicitStop.source} at=${latestExplicitStop.stoppedAt}`);
    return {
      dayEnded: true,
      endedAt: clampToDay(latestExplicitStop.stoppedAt, dayStartUtcIso, dayEndUtcIso),
      endReason: latestExplicitStop.reason,
      confidence: 'high',
      evidence,
      diagnostic: null,
    };
  }

  // ── 3. Historical day with no open timer → report_day_ended ────────────
  if (isHistorical && !hasOpen) {
    const lastEv = lastEvidenceFromBlocks(blocks);
    evidence.push(`historical_no_open_timer last_evidence=${lastEv ?? '∅'}`);
    return {
      dayEnded: true,
      endedAt: clampToDay(lastEv ?? dayEndUtcIso, dayStartUtcIso, dayEndUtcIso),
      endReason: 'report_day_ended',
      confidence: 'high',
      evidence,
      diagnostic: null,
    };
  }

  // ── 4. Open active timer present ───────────────────────────────────────
  if (hasOpen) {
    const lastWork = lastWorkBlock(blocks);
    const lastWorkEnd = lastWork?.endAt ?? null;
    const lastEv = lastEvidenceFromBlocks(blocks);

    // 4a. last block kind = private_residence-marked work that auto-closed.
    // Time Engine 4.6 — 15-mils-regel:
    //   - residenceEnterAt = autoClosedAt
    //   - leaveWorkAt      = autoClosed.lastConfirmedAt ?? autoClosed.endAt
    //   - commuteDistance  = summa transport mellan leaveWorkAt..residenceEnterAt
    //   - commuteDistance >= 150 km → restid räknas som arbete, dag slutar
    //                                 vid residenceEnterAt
    //   - commuteDistance <  150 km → restid är privat, dag slutar vid
    //                                 leaveWorkAt (kalendern går INTE till
    //                                 ankomst boende)
    //   - 90-min-vistelse hemma används bara som bekräftelse, inte som
    //     sluttid (autoClosedAt = stay.startMs ≈ residenceEnterAt).
    const autoClosed = blocks.find((b) => b.autoClosedByPrivateResidence);
    if (autoClosed && autoClosed.autoClosedAt) {
      const residenceEnterAt = autoClosed.autoClosedAt;
      const leaveWorkAt = autoClosed.lastConfirmedAt ?? autoClosed.endAt ?? residenceEnterAt;
      const commuteDistanceMeters = sumCommuteDistanceMeters(
        blocks,
        leaveWorkAt,
        residenceEnterAt,
      );
      const longCommute = commuteDistanceMeters >= COMMUTE_DISTANCE_THRESHOLD_METERS;

      evidence.push(
        `private_residence_auto_close residence_enter=${residenceEnterAt} ` +
          `leave_work=${leaveWorkAt} commute_m=${commuteDistanceMeters} ` +
          `threshold_m=${COMMUTE_DISTANCE_THRESHOLD_METERS} ` +
          `stay_min=${autoClosed.privateResidenceDurationMinutes ?? '?'}`,
      );

      if (longCommute) {
        return {
          dayEnded: true,
          endedAt: clampToDay(residenceEnterAt, dayStartUtcIso, dayEndUtcIso),
          endReason: 'long_distance_homebound_travel',
          confidence: 'high',
          evidence,
          diagnostic: 'active_timer_open_but_not_enough_engine_evidence',
        };
      }

      return {
        dayEnded: true,
        endedAt: clampToDay(leaveWorkAt, dayStartUtcIso, dayEndUtcIso),
        endReason: 'left_last_work_before_private_residence_commute',
        confidence: 'high',
        evidence,
        diagnostic: 'active_timer_open_but_not_enough_engine_evidence',
      };
    }

    // 4b. The open registration started before noon but the latest fresh
    // engine evidence is older than the freshness window → engine has no
    // proof the day continues.
    const lastFreshEvidenceIso =
      [lastEv, lastGpsPingAtIso].filter(Boolean).sort().pop() ?? null;

    if (!lastFreshEvidenceIso) {
      evidence.push('open_timer_with_no_engine_evidence');
      return {
        dayEnded: true,
        endedAt: clampToDay(openActiveRegistration!.startedAtIso, dayStartUtcIso, dayEndUtcIso),
        endReason: 'no_fresh_evidence_after_last_work',
        confidence: 'low',
        evidence,
        diagnostic: 'active_timer_open_but_not_enough_engine_evidence',
      };
    }

    const ageMin = minutesBetween(lastFreshEvidenceIso, safeNow);
    if (ageMin > FRESH_EVIDENCE_WINDOW_MIN) {
      evidence.push(
        `stale_evidence age=${Math.round(ageMin)}min ` +
          `(window=${FRESH_EVIDENCE_WINDOW_MIN}) last=${lastFreshEvidenceIso}`,
      );
      return {
        dayEnded: true,
        endedAt: clampToDay(lastFreshEvidenceIso, dayStartUtcIso, dayEndUtcIso),
        endReason: 'no_fresh_evidence_after_last_work',
        confidence: 'medium',
        evidence,
        diagnostic: 'active_timer_open_but_not_enough_engine_evidence',
      };
    }

    // 4c. Open timer + fresh evidence → still active.
    evidence.push(
      `open_timer_with_fresh_evidence age=${Math.round(ageMin)}min last=${lastFreshEvidenceIso}` +
        (plannedEndOfDayIso ? ` planned_end=${plannedEndOfDayIso}` : ''),
    );
    if (lastWorkEnd) evidence.push(`last_work_end=${lastWorkEnd}`);
    return {
      dayEnded: false,
      endedAt: null,
      endReason: 'still_active',
      confidence: 'high',
      evidence,
      diagnostic: null,
    };
  }

  // ── 5. Today, no open timer, no explicit stop ─────────────────────────
  // Use last engine evidence as a soft end.
  const lastEv = lastEvidenceFromBlocks(blocks);
  if (lastEv) {
    evidence.push(`today_no_open_timer last_evidence=${lastEv}`);
    return {
      dayEnded: true,
      endedAt: clampToDay(lastEv, dayStartUtcIso, dayEndUtcIso),
      endReason: 'no_fresh_evidence_after_last_work',
      confidence: 'medium',
      evidence,
      diagnostic: null,
    };
  }

  evidence.push('no_blocks_no_timer_no_stop');
  return {
    dayEnded: true,
    endedAt: null,
    endReason: 'report_day_ended',
    confidence: 'low',
    evidence,
    diagnostic: null,
  };
}
