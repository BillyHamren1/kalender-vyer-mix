/**
 * Time Engine — dayEndFromLocationTruth (Location Truth 1.7, del 1)
 * =================================================================
 *
 * Pure helper. Avgör WHEN arbetsdagen tar slut baserat ENBART på:
 *   - locationTruthSegments (sanning om plats)
 *   - transportSegments (1.5)
 *   - manual stop / stopped active_time_registration (bara start/stop-ts)
 *   - dagfönster (Stockholm dayStart/dayEnd)
 *
 * Får INTE använda:
 *   - active_time_registration target/label (Timer 1.7 isolation)
 *   - Date.now på historiska dagar
 *   - öppna timers utan platsevidence (de får aldrig hålla dagen levande)
 */

import { haversine } from '../geofenceEval.ts';
import type { ISODateTime, UUID } from './contracts.ts';
import type { LocationTruthSegment } from './buildLocationTruthTimeline.ts';
import type { TransportSegment } from './buildTransportFromLocationTruth.ts';

export const PRIVATE_RESIDENCE_DAY_END_MINUTES = 90;
export const COMMUTE_DISTANCE_THRESHOLD_METERS = 150_000;

export type DayEndReason =
  | 'manual_stop'
  | 'private_residence_confirmed'
  | 'no_fresh_evidence_after_last_work'
  | 'historical_day_end'
  | 'open_active_timer_ignored_no_evidence'
  | 'unresolved';

export interface DayEndDecision {
  dayEndAt: ISODateTime | null;
  reason: DayEndReason;
  /** Source segment id (when from locationTruth). */
  sourceSegmentId: string | null;
  /** Used commute distance (m) when private residence applied. */
  commuteDistanceMeters: number | null;
  /** True if commute > 150 km (transport may count). */
  longCommute: boolean;
  notes: string[];
}

export interface DayEndInputs {
  date: string;
  staffId: UUID;
  stockholmDayWindow: { startUtc: ISODateTime; endUtc: ISODateTime };
  locationTruthSegments: LocationTruthSegment[];
  transportSegments?: TransportSegment[];
  /** Bara start/stop tidstämplar — INTE target/label. */
  activeTimer?: {
    startedAt: ISODateTime | null;
    stoppedAt: ISODateTime | null;
    status: 'active' | 'stopped' | string;
  } | null;
  manualStopAt?: ISODateTime | null;
  /** True om dagen ligger i historik (inga ongoing). */
  isHistorical: boolean;
  /** Senaste GPS-ping ts (för stale-detektion). */
  lastGpsPingAt?: ISODateTime | null;
}

export interface LocationTruthDayEndDiagnostics {
  dayEndDecision: DayEndDecision;
  privateResidenceConfirmedEnds: number;
  commuteExcludedEnds: number;
  staleOpenTimersIgnored: number;
  examples: Array<{
    reason: DayEndReason;
    at: ISODateTime | null;
    note: string;
  }>;
}

function isWork(s: LocationTruthSegment): boolean {
  return s.kind === 'project' || s.kind === 'booking' || s.kind === 'warehouse' || s.kind === 'known_location';
}

export function decideDayEndFromLocationTruth(
  input: DayEndInputs,
): { decision: DayEndDecision; diagnostics: LocationTruthDayEndDiagnostics } {
  const segs = (input.locationTruthSegments ?? [])
    .slice()
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const diag: LocationTruthDayEndDiagnostics = {
    dayEndDecision: { dayEndAt: null, reason: 'unresolved', sourceSegmentId: null, commuteDistanceMeters: null, longCommute: false, notes: [] },
    privateResidenceConfirmedEnds: 0,
    commuteExcludedEnds: 0,
    staleOpenTimersIgnored: 0,
    examples: [],
  };

  // 1) Manual stop / stopped active_time_registration.
  const stopped = input.manualStopAt ?? input.activeTimer?.stoppedAt ?? null;
  if (stopped) {
    const decision: DayEndDecision = {
      dayEndAt: stopped,
      reason: 'manual_stop',
      sourceSegmentId: null,
      commuteDistanceMeters: null,
      longCommute: false,
      notes: ['stop from manual or stopped active_time_registration'],
    };
    diag.dayEndDecision = decision;
    diag.examples.push({ reason: decision.reason, at: stopped, note: 'manual_or_stopped_timer' });
    return { decision, diagnostics: diag };
  }

  const lastWork = [...segs].reverse().find(isWork) ?? null;

  // 2) private_residence efter sista jobb, ≥ 90 min.
  if (lastWork) {
    const residenceAfter = segs.find((s) =>
      s.kind === 'private_residence' && Date.parse(s.startAt) >= Date.parse(lastWork.endAt));
    if (residenceAfter) {
      const dur = (Date.parse(residenceAfter.endAt) - Date.parse(residenceAfter.startAt)) / 60000;
      if (dur >= PRIVATE_RESIDENCE_DAY_END_MINUTES) {
        // commute-policy
        const dist = (lastWork.centerLat != null && lastWork.centerLng != null
            && residenceAfter.centerLat != null && residenceAfter.centerLng != null)
          ? Math.round(haversine(lastWork.centerLat, lastWork.centerLng,
                                 residenceAfter.centerLat, residenceAfter.centerLng))
          : 0;
        const longCommute = dist > COMMUTE_DISTANCE_THRESHOLD_METERS;
        const dayEndAt = longCommute ? residenceAfter.startAt : lastWork.endAt;
        const decision: DayEndDecision = {
          dayEndAt,
          reason: 'private_residence_confirmed',
          sourceSegmentId: longCommute ? residenceAfter.id : lastWork.id,
          commuteDistanceMeters: dist,
          longCommute,
          notes: [
            `residence stay ${Math.round(dur)} min ≥ ${PRIVATE_RESIDENCE_DAY_END_MINUTES}`,
            longCommute ? 'long_commute_dayEnd_at_residence_enter' : 'short_commute_dayEnd_at_last_work_end',
          ],
        };
        diag.dayEndDecision = decision;
        diag.privateResidenceConfirmedEnds += 1;
        if (!longCommute) diag.commuteExcludedEnds += 1;
        diag.examples.push({ reason: decision.reason, at: dayEndAt, note: `commute=${dist}m` });
        return { decision, diagnostics: diag };
      }
    }
  }

  // 3) Ingen färsk evidence efter sista work location.
  if (lastWork) {
    const lastPing = input.lastGpsPingAt ? Date.parse(input.lastGpsPingAt) : null;
    const lastWorkEnd = Date.parse(lastWork.endAt);
    const noFresh = lastPing == null || lastPing - lastWorkEnd >= 30 * 60_000; // 30 min stale
    if (noFresh) {
      const decision: DayEndDecision = {
        dayEndAt: lastWork.endAt,
        reason: 'no_fresh_evidence_after_last_work',
        sourceSegmentId: lastWork.id,
        commuteDistanceMeters: null,
        longCommute: false,
        notes: ['no fresh GPS after last work segment'],
      };
      diag.dayEndDecision = decision;
      diag.examples.push({ reason: decision.reason, at: decision.dayEndAt, note: 'stale' });
      return { decision, diagnostics: diag };
    }
  }

  // 4) Historisk dag — alltid sätt dayEnd vid sista work eller dayWindow.endUtc.
  if (input.isHistorical) {
    const dayEndAt = lastWork?.endAt ?? input.stockholmDayWindow.endUtc;
    const decision: DayEndDecision = {
      dayEndAt,
      reason: 'historical_day_end',
      sourceSegmentId: lastWork?.id ?? null,
      commuteDistanceMeters: null,
      longCommute: false,
      notes: ['historical_day_no_ongoing_blocks'],
    };
    diag.dayEndDecision = decision;
    diag.examples.push({ reason: decision.reason, at: dayEndAt, note: 'historical' });
    return { decision, diagnostics: diag };
  }

  // 5) Open active timer utan platsevidence — ignorera, dagen är inte stängd ännu.
  if (input.activeTimer && input.activeTimer.status === 'active' && !lastWork) {
    diag.staleOpenTimersIgnored += 1;
    const decision: DayEndDecision = {
      dayEndAt: null,
      reason: 'open_active_timer_ignored_no_evidence',
      sourceSegmentId: null,
      commuteDistanceMeters: null,
      longCommute: false,
      notes: ['open active_time_registration has no work-location evidence — does not keep day alive'],
    };
    diag.dayEndDecision = decision;
    diag.examples.push({ reason: decision.reason, at: null, note: 'no_place_evidence' });
    return { decision, diagnostics: diag };
  }

  // Fallback.
  const decision: DayEndDecision = {
    dayEndAt: lastWork?.endAt ?? null,
    reason: lastWork ? 'no_fresh_evidence_after_last_work' : 'unresolved',
    sourceSegmentId: lastWork?.id ?? null,
    commuteDistanceMeters: null,
    longCommute: false,
    notes: ['fallback'],
  };
  diag.dayEndDecision = decision;
  return { decision, diagnostics: diag };
}
