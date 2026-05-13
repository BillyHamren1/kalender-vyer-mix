// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
/**
 * useWorkSession — UNIFIED WORK-SESSION ENGINE
 * ============================================
 *
 * One time-reporting engine, three target types.
 *
 * Architectural decision (Prompt 2 + robustness Phase 1):
 *   • Booking, large-project and location timers MUST share the same
 *     start/stop/break/anomaly logic.
 *   • The ONLY thing that differs per type is which target id the
 *     resulting time_report is linked to (booking_id / large_project_id /
 *     location_id).
 *   • Server is source of truth for active timers. Local map is a cache.
 *   • No automatic break deduction — long shifts open
 *     StopBreakDecisionDialog and require an explicit user choice.
 *   • Save-then-stop is the only sanctioned conversion of an active timer
 *     into a time_report.
 *   • End-of-day context (custom end time, post-exit anomaly) is a first-
 *     class option on stopSession — callers (EOD dialog, banner, request-
 *     end-day handler) MUST NOT roll their own persistStop path.
 *
 * ---------------------------------------------------------------------
 * SHARED CORE (identical for all three types)
 *   • startSession()             — optimistic local + enqueue server start
 *   • stopSession(target, opts?) — prompt for break (unless caller passes
 *                                  an explicit choice), then save-or-skip-
 *                                  then-stop. Optionally records an
 *                                  end-of-day anomaly when caller supplies
 *                                  endOfDayContext.
 *   • cancelPendingSession()     — drop a still-unsynced start
 *   • dialog rendering           — <StopBreakDecisionDialog />
 *
 * TARGET-SPECIFIC MAPPING (the only allowed branch)
 *   • resolveTargetKey()         — booking_id | project-{id} | location-{id}
 *   • resolveReportPayload()     — adds booking_id OR large_project_id
 *   • shouldCreateTimeReport()   — false ONLY for pure location presence
 *
 * Anything else that wants to start/stop a timer in the mobile app MUST
 * go through this hook. Direct calls to mobileApi.startLocationTimer /
 * mobileApi.stopLocationTimer / mobileApi.createTimeReport from feature
 * code are the legacy shape and must be migrated.
 * ---------------------------------------------------------------------
 * RELATION TILL RESTID:
 *   Restid är inte den här hookens ansvar. Officiella modellen är att
 *   restid härleds från GAPET mellan två aktiviteter (stopp på en
 *   aktivitet → start på nästa). Live GPS-travel (useTravelDetection) är
 *   numera ett legacy/assist-spår. När en ny aktivitet startas dispatchas
 *   STOP_TRAVEL_EVENT för att stänga ev. öppen GPS-rad — men gap-tiden
 *   är den auktoritativa restidskällan, inte GPS-fart.
 * ---------------------------------------------------------------------
 */

import { useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import {
  // NOTE: `useGeofencing` is intentionally NOT imported here.
  // The hook is mounted ONCE by <GeofencingProvider>; this file consumes the
  // shared instance via useGeofencingContext(). Direct useGeofencing() calls
  // in feature code re-introduce the multi-GPS-watcher crash.
  haversineDistance,
  ENTER_RADIUS,
  getGpsSettings,
  type ActiveTimer,
} from '@/hooks/useGeofencing';
import { useGeofencingContext } from '@/contexts/GeofencingContext';
import { useStopBreakDecision } from '@/hooks/useStopBreakDecision';
import { takeVisits as takeProjectAddressVisits } from '@/lib/projectAddressVisits';
import { shouldPromptForBreak } from '@/utils/breakPolicy';
import { recordWorkSegmentStop } from '@/lib/lastWorkSegment';
import { StopBreakDecisionDialog } from '@/components/mobile-app/StopBreakDecisionDialog';
import React from 'react';

// ─────────────────────────────────────────────────────────────────────
// Target descriptors — the ONLY per-type variation allowed.
// ─────────────────────────────────────────────────────────────────────

export type WorkTarget =
  | { kind: 'booking'; bookingId: string; client: string }
  | { kind: 'project'; largeProjectId: string; name: string }
  | {
      kind: 'location';
      locationId: string;
      name: string;
      /**
       * UNIFICATION (Fas 1, 2026-04-24):
       *   Location timers (e.g. Lager) now produce time_reports by default —
       *   exactly like booking and large-project timers. This eliminates
       *   the historical Lager-vs-projekt split that left workdays without
       *   matching time entries.
       *
       *   The flag is kept (defaults to `true`) so a tiny set of legitimate
       *   non-work presence cases can still opt out — but feature code MUST
       *   NOT pass `false`. Enforced by `timerStartUnification.contract.test.ts`.
       */
      createsTimeReport?: boolean;
    };

/** Canonical local key for a target. Mirrors useGeofencing's key scheme. */
export function resolveTargetKey(target: WorkTarget): string {
  if (target.kind === 'location') return `location-${target.locationId}`;
  if (target.kind === 'project') return `project-${target.largeProjectId}`;
  return target.bookingId;
}

/**
 * Map a target to the booking_id / large_project_id fields used by
 * createTimeReport. Returns whatever combination the backend expects.
 *
 * Location targets are intentionally encoded as `booking_id: 'location-<id>'`
 * because the backend (`mobile-app-api.handleCreateTimeReport`) already
 * understands this prefix and resolves it to either the location's internal
 * project booking_id OR a `location_id` column on time_reports. This keeps
 * the unified write-path identical for all three target types.
 */
function resolveReportTargetFields(
  target: WorkTarget,
): { booking_id?: string; large_project_id?: string } {
  if (target.kind === 'project') {
    return { large_project_id: target.largeProjectId };
  }
  if (target.kind === 'booking') {
    return { booking_id: target.bookingId };
  }
  // location → encoded as 'location-<id>' so backend resolves correctly.
  return { booking_id: `location-${target.locationId}` };
}

function shouldCreateTimeReport(target: WorkTarget): boolean {
  // UNIFICATION (Fas 1): default to TRUE for all target types — including
  // location. Only explicit `createsTimeReport: false` skips the report.
  if (target.kind === 'location') return target.createsTimeReport !== false;
  return true;
}

/**
 * Build a WorkTarget from an existing ActiveTimer entry. Used by callers
 * (banner, request-end-day handler) that hold a raw ActiveTimer rather
 * than a typed target — keeps the per-type branch in ONE place.
 */
export function timerToTarget(key: string, timer: ActiveTimer): WorkTarget {
  if (timer.largeProjectId) {
    return {
      kind: 'project',
      largeProjectId: timer.largeProjectId,
      name: timer.client,
    };
  }
  if (timer.locationId) {
    return {
      kind: 'location',
      locationId: timer.locationId,
      name: timer.locationName || timer.client,
      // Banner timers for fixed locations historically wrote a time_report
      // (legacy persistStop did so unconditionally). Preserve that behaviour
      // so we don't silently start dropping presence-as-work entries.
      createsTimeReport: true,
    };
  }
  return { kind: 'booking', bookingId: key, client: timer.client };
}

// ─────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────

export interface StartSessionOptions {
  /** Backdated start (e.g. real geofence arrival timestamp). */
  startedAtIso?: string;
  /** Optional task this session is logged against. */
  taskId?: string;
  taskTitle?: string;
}

/**
 * End-of-day context. Set when the user is closing a timer LATER than
 * they actually left the workplace, so we both save the time report at
 * the chosen end-time AND record what they did between the geofence exit
 * and the chosen end-time as an anomaly for admin follow-up.
 */
export interface EndOfDayContext {
  /** ISO when the user left the workplace (geofence exit). */
  lastExitIso: string;
  /** ISO timestamp the user picked as actual end time. */
  endedAtIso: string;
  /**
   * Free-text describing what happened between lastExit and endedAt
   * (e.g. "Hämtade material på Bauhaus"). Only set when user did NOT
   * accept the suggested geofence-exit time.
   */
  workDescription?: string;
}

/**
 * Lets a caller skip the break dialog by providing the choice up-front.
 * Used by flows that already gathered the answer in their own UI (or
 * legitimately know the pass is too short to need one).
 */
export type ExplicitBreakChoice =
  | { kind: 'break'; breakHours: number }
  | { kind: 'no_break' }
  | { kind: 'anomaly'; note: string };

export interface StopSessionOptions {
  /** Override "now" as the stop time (used by EOD dialog). */
  stopAtIso?: string;
  /** Skip the dialog by passing an explicit decision. */
  breakChoice?: ExplicitBreakChoice;
  /** End-of-day post-exit context, see EndOfDayContext. */
  endOfDayContext?: EndOfDayContext;
}

export interface StopSessionResult {
  saved: boolean;
  hoursWorked?: number;
  /** True when the user closed the break dialog without choosing. */
  cancelled?: boolean;
}

export function useWorkSession(
  bookings: MobileBooking[],
  staffId?: string,
) {
  const geo = useGeofencingContext();
  const breakDecision = useStopBreakDecision();

  const {
    activeTimers,
    startTimer,
    saveAndStopTimer,
    stopLocationTimerWithoutReport,
    cancelPendingTimer,
    userPosition,
    orgLocations,
  } = geo;

  /**
   * START — disabled by single-timer-policy-v1.
   *
   * Mobile app owns only day start/stop.
   * Timeline allocation is owned by Time Engine.
   * GPS/geofence is evidence only, not a project timer.
   *
   * Tidigare skapade denna funktion en optimistisk lokal timer + skickade
   * start_location_timer till servern (via useGeofencing.startTimer →
   * timerSyncQueue). I single-timer-modellen får ingen aktivitets-,
   * projekt-, plats- eller bokningstimer startas från klienten. Endast
   * arbetsdagstimern (`active_time_registrations`) får startas, och bara
   * via `WorkDayPanel` → `mobileApi.startTimeRegistration`.
   *
   * Vi behåller signaturen så att äldre call-sites kompilerar, men gör
   * funktionen till en hård no-op som loggar en varning. Detta gör det
   * tekniskt omöjligt att mobilen skapar parallella timers.
   */
  const startSession = useCallback(
    (_target: WorkTarget, _opts: StartSessionOptions = {}): boolean => {
      if (typeof console !== 'undefined') {
        console.warn(
          '[useWorkSession] startSession is disabled by single-timer-policy-v1. ' +
          'The mobile app may only start/stop the workday via WorkDayPanel ' +
          '(mobileApi.startTimeRegistration).',
        );
      }
      return false;
    },
    [],
  );

  /**
   * STOP — same for all three target types.
   *
   *   1. Compute pass length using stopAtIso (default: now).
   *   2. Determine break:
   *        a) caller passed `breakChoice` → use it directly, no dialog
   *        b) pass below threshold → break = 0, no dialog
   *        c) otherwise → open StopBreakDecisionDialog and AWAIT a
   *           decision (break / no_break / anomaly). User dismissal
   *           returns { cancelled:true } and the timer stays alive.
   *   3. If the target produces a time_report: SAVE FIRST via the
   *      hook's saveAndStopTimer. On failure → timer survives so the user
   *      can retry. NEVER clear local first.
   *   4. If the target does NOT produce a time_report (pure location
   *      presence, createsTimeReport=false): just close the server entry.
   *   5. Persist anomalies (best-effort, non-fatal):
   *        • break-anomaly note → time_report_anomaly tagged to this report
   *        • endOfDayContext.workDescription → end-of-day anomaly bridging
   *          geofence-exit → user-stated end time (with best-effort GPS).
   *   6. Close any leftover open anomalies.
   */
  const stopSession = useCallback(
    async (
      target: WorkTarget,
      opts: StopSessionOptions = {},
    ): Promise<StopSessionResult> => {
      const key = resolveTargetKey(target);
      const timer = activeTimers.get(key);
      if (!timer) return { saved: false };

      const stopTime = opts.stopAtIso ? new Date(opts.stopAtIso) : new Date();
      const startTimeDate = parseISO(timer.startTime);
      let totalHours =
        (stopTime.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
      if (totalHours < 0) totalHours += 24;

      const contextLabel =
        target.kind === 'location'
          ? target.name
          : target.kind === 'project'
            ? target.name
            : (target as Extract<WorkTarget, { kind: 'booking' }>).client;

      // STEP 2 — explicit break decision, no auto-deduct.
      let breakHours = 0;
      let anomalyNote: string | undefined;
      if (opts.breakChoice) {
        if (opts.breakChoice.kind === 'break') breakHours = opts.breakChoice.breakHours;
        else if (opts.breakChoice.kind === 'anomaly') anomalyNote = opts.breakChoice.note;
      } else if (shouldPromptForBreak(totalHours)) {
        const decision = await breakDecision.ask({
          passHours: totalHours,
          context: contextLabel,
        });
        if (!decision) return { cancelled: true, saved: false };
        if (decision.kind === 'break') breakHours = decision.breakHours;
        else if (decision.kind === 'anomaly') anomalyNote = decision.note;
        // 'no_break' → leave breakHours = 0
      }

      const safeBreak = Math.max(0, breakHours);
      const hoursWorked = Math.max(
        0,
        Number((totalHours - safeBreak).toFixed(2)),
      );

      // STEP 3/4 — branch ONLY on whether a time_report should be created.
      // savedTimeReportId is `time_reports.id` (NOT location_time_entries.id).
      // This is the ONLY id valid for linking anomalies via `time_report_id`.
      let savedTimeReportId: string | undefined;
      try {
        if (shouldCreateTimeReport(target)) {
          const targetFields = resolveReportTargetFields(target);
          const stopped = await saveAndStopTimer(key, {
            ...targetFields,
            report_date: format(stopTime, 'yyyy-MM-dd'),
            start_time: format(startTimeDate, 'HH:mm'),
            end_time: format(stopTime, 'HH:mm'),
            hours_worked: hoursWorked,
            break_time: safeBreak,
            description: `Timer: ${contextLabel}${
              timer.establishmentTaskTitle
                ? ` — ${timer.establishmentTaskTitle}`
                : ''
            }`,
            establishment_task_id: timer.establishmentTaskId,
          });
          savedTimeReportId = stopped.timeReportId ?? undefined;

          // ── PER-ADDRESS BREAKDOWN (project targets only) ───────────
          // While the project timer ran, geofence enter/exit on individual
          // sub-booking addresses were recorded by useGeofencing into
          // localStorage. Now that the project-total time_report exists,
          // flush each visit interval as a subdivision time_report linked
          // to the parent. Subdivisions are metadata — never summed into
          // payroll/invoicing — so failures are non-fatal.
          if (target.kind === 'project' && savedTimeReportId) {
            try {
              const visits = takeProjectAddressVisits({
                largeProjectId: target.largeProjectId,
                closeOpenAtIso: stopTime.toISOString(),
              });
              for (const v of visits) {
                const enteredAt = new Date(v.enteredAtIso);
                const exitedAt = new Date(v.exitedAtIso!);
                const subHours = Number(
                  ((exitedAt.getTime() - enteredAt.getTime()) / 3_600_000).toFixed(2),
                );
                if (subHours <= 0) continue;
                try {
                  await mobileApi.createTimeReport({
                    booking_id: v.bookingId,
                    large_project_id: target.largeProjectId,
                    report_date: format(enteredAt, 'yyyy-MM-dd'),
                    start_time: format(enteredAt, 'HH:mm'),
                    end_time: format(exitedAt, 'HH:mm'),
                    hours_worked: subHours,
                    break_time: 0,
                    description: v.address
                      ? `Adress: ${v.address}`
                      : `Underbokning: ${v.bookingLabel ?? v.bookingId}`,
                    is_subdivision: true,
                    parent_time_report_id: savedTimeReportId,
                  });
                } catch (subErr) {
                  console.warn(
                    '[WorkSession] subdivision write failed (non-fatal):',
                    v.bookingId,
                    subErr,
                  );
                }
              }
            } catch (err) {
              console.warn('[WorkSession] subdivision flush failed (non-fatal):', err);
            }
          }

        } else {
          await stopLocationTimerWithoutReport(key);
        }
      } catch (err) {
        // Save-then-stop guarantee: timer stays alive so the user can retry.
        console.warn('[WorkSession] stop failed, timer kept alive:', err);
        throw err;
      }

      // STEP 5a — break-as-anomaly (user picked "markera som avvikelse").
      if (anomalyNote) {
        try {
          const targetFields = resolveReportTargetFields(target);
          await mobileApi.createEndOfDayAnomaly({
            started_at: startTimeDate.toISOString(),
            ended_at: stopTime.toISOString(),
            work_description: `Rast/avvikelse: ${anomalyNote}`,
            location_id:
              target.kind === 'location' ? target.locationId : undefined,
            booking_id: targetFields.booking_id,
            large_project_id: targetFields.large_project_id,
            time_report_id: savedTimeReportId,
          });
        } catch (err) {
          console.warn('[WorkSession] break-anomaly persist failed (non-fatal):', err);
        }
      }

      // STEP 5b — end-of-day post-exit context. Captures what happened
      // between the geofence exit and the user-stated end time.
      if (opts.endOfDayContext?.workDescription) {
        let lat: number | undefined;
        let lng: number | undefined;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('no geolocation'));
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000, maximumAge: 60000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // Position is best-effort; anomaly is still useful without it
        }

        try {
          const targetFields = resolveReportTargetFields(target);
          await mobileApi.createEndOfDayAnomaly({
            started_at: opts.endOfDayContext.lastExitIso,
            ended_at: stopTime.toISOString(),
            work_description: opts.endOfDayContext.workDescription,
            end_location_lat: lat,
            end_location_lng: lng,
            location_id:
              target.kind === 'location'
                ? target.locationId
                : timer.locationId || undefined,
            booking_id: targetFields.booking_id,
            large_project_id: targetFields.large_project_id,
            time_report_id: savedTimeReportId,
          });
        } catch (err) {
          console.warn('[WorkSession] end-of-day anomaly persist failed (non-fatal):', err);
        }
      }

      // STEP 6 — close leftover anomalies (best-effort).
      mobileApi
        .closeOpenAnomalies({ ended_at: stopTime.toISOString() })
        .catch((err) => {
          console.warn('[WorkSession] closeOpenAnomalies failed (non-fatal):', err);
        });

      // STEP 7 — registrera detta stopp som "senaste arbetssegment" så att
      // nästa aktivitetsstart kan beräkna gap → restids-candidate. Detta
      // är gap-modellen för restid (se src/lib/lastWorkSegment.ts).
      try {
        const targetId =
          target.kind === 'booking'
            ? target.bookingId
            : target.kind === 'project'
              ? target.largeProjectId
              : target.locationId;
        recordWorkSegmentStop({
          targetType: target.kind,
          targetId,
          targetLabel: contextLabel,
          stoppedAtIso: stopTime.toISOString(),
        });
      } catch (err) {
        console.warn('[WorkSession] recordWorkSegmentStop failed (non-fatal):', err);
      }

      return { saved: true, hoursWorked };
    },
    [
      activeTimers,
      breakDecision,
      saveAndStopTimer,
      stopLocationTimerWithoutReport,
    ],
  );

  /**
   * Resolve coordinates + display label for a target by looking up
   * bookings / orgLocations. Returns null when target has no usable coords.
   *
   *   booking  → bookings.find(b.id===bookingId).delivery_lat/lng
   *   project  → first sub-booking with coords (large_project_id match)
   *   location → orgLocations.find(l.id===locationId).lat/lng
   */
  const resolveTargetCoords = useCallback(
    (target: WorkTarget): { lat: number; lng: number; label: string } | null => {
      if (target.kind === 'booking') {
        const b = bookings.find((x) => x.id === target.bookingId);
        if (b?.delivery_latitude && b?.delivery_longitude) {
          return { lat: b.delivery_latitude, lng: b.delivery_longitude, label: target.client };
        }
        return null;
      }
      if (target.kind === 'project') {
        const sub = bookings.find(
          (x) =>
            x.large_project_id === target.largeProjectId &&
            x.delivery_latitude &&
            x.delivery_longitude,
        );
        if (sub) {
          return { lat: sub.delivery_latitude!, lng: sub.delivery_longitude!, label: target.name };
        }
        return null;
      }
      // location
      const loc = orgLocations.find((l) => l.id === target.locationId);
      if (loc?.latitude && loc?.longitude) {
        return { lat: loc.latitude, lng: loc.longitude, label: target.name };
      }
      return null;
    },
    [bookings, orgLocations],
  );

  /**
   * Centralised "are you really on site?" guard.
   *
   *   • No GPS / no target coords → start directly (we cannot guess).
   *   • Inside radius             → start directly.
   *   • Outside radius            → call onNeedConfirm with a confirm()
   *     callback. Caller renders a dialog and invokes confirm() if the
   *     user wants to start anyway. Returns true when started immediately,
   *     false when confirmation is pending.
   *
   * Radius matches the geofence detector (getGpsSettings().radius || ENTER_RADIUS).
   */
  const startSessionWithDistanceCheck = useCallback(
    (
      target: WorkTarget,
      opts: StartSessionOptions = {},
      onNeedConfirm?: (data: {
        placeName: string;
        distance: number;
        confirm: () => void;
      }) => void,
    ): boolean => {
      const coords = resolveTargetCoords(target);
      const radius = getGpsSettings().radius || ENTER_RADIUS;

      if (userPosition && coords) {
        const dist = haversineDistance(userPosition.lat, userPosition.lng, coords.lat, coords.lng);
        if (dist > radius && onNeedConfirm) {
          onNeedConfirm({
            placeName: coords.label,
            distance: dist,
            confirm: () => {
              startSession(target, opts);
            },
          });
          return false;
        }
      }
      return startSession(target, opts);
    },
    [resolveTargetCoords, userPosition, startSession],
  );

  /**
   * Drop a timer that has not yet synced to the server. Intentionally
   * the same shape regardless of target type.
   */
  const cancelPendingSession = useCallback(
    (target: WorkTarget): boolean => {
      return cancelPendingTimer(resolveTargetKey(target));
    },
    [cancelPendingTimer],
  );

  /** Look up the active timer for a target, if any. */
  const getActiveTimer = useCallback(
    (target: WorkTarget): ActiveTimer | undefined =>
      activeTimers.get(resolveTargetKey(target)),
    [activeTimers],
  );

  /**
   * UNIFIED STOP ENGINE (Prompt 7).
   *
   * The single sanctioned entry point for ANY caller that wants to stop
   * "the thing that's currently running" — no matter whether the timer
   * exists locally, only on the server, or both.
   *
   * Resolution order:
   *   1. If a local ActiveTimer matches the input → route through
   *      stopSession (full break-dialog, save-then-stop, anomalies,
   *      gap-derived-travel hooks).
   *   2. Otherwise, if a server open_entry id is provided → call
   *      mobileApi.stopOpenEntry (server creates the time_report and
   *      closes the LTE atomically).
   *   3. Always: refresh active_day_state, dispatch `timer-state-changed`,
   *      and surface a toast on failure (handled by callers via the
   *      thrown error).
   *
   * Every stop path in the app — manual stop, server-only stop, stale
   * timer save/discard, auto-switch, end-day, assistant leave — MUST go
   * through this verb. Callers may pass `skipReport` for the
   * "mark not work" path.
   */
  const stopAny = useCallback(
    async (input: {
      /** A typed target — preferred. Used to look up local timer. */
      target?: WorkTarget;
      /** Server-side open_entry id. Used as fallback when no local timer. */
      serverEntryId?: string;
      /** Optional override for the actual stop time (EOD dialog, stale cap). */
      stopAtIso?: string;
      /** Skip writing a time_report (banner "Inte arbete" / pure presence). */
      skipReport?: boolean;
      /** Pass an explicit break decision to bypass the dialog. */
      breakChoice?: ExplicitBreakChoice;
      /** End-of-day post-exit context (banner + assistant). */
      endOfDayContext?: EndOfDayContext;
      /** Free-text reason persisted on the LTE close (server path only). */
      stopReason?: string;
      stopSource?: string;
    }): Promise<{ saved: boolean; via: 'local' | 'server' | 'noop'; cancelled?: boolean }> => {
      const localTimer = input.target
        ? activeTimers.get(resolveTargetKey(input.target))
        : undefined;

      // Path 1 — local timer (fully unified flow).
      if (input.target && localTimer) {
        const targetForStop: WorkTarget = input.skipReport && input.target.kind === 'location'
          ? { ...input.target, createsTimeReport: false }
          : input.target;
        const res = await stopSession(targetForStop, {
          stopAtIso: input.stopAtIso,
          breakChoice: input.breakChoice,
          endOfDayContext: input.endOfDayContext,
        });
        // stopSession already clears local timer + dispatches via setActiveTimers.
        // Best-effort: poke active_day_state listeners.
        try { window.dispatchEvent(new Event('active-day-state-refresh')); } catch {}
        return { saved: !!res.saved, cancelled: res.cancelled, via: 'local' };
      }

      // Path 2 — server-only entry.
      if (input.serverEntryId) {
        await mobileApi.stopOpenEntryLegacy({
          entry_id: input.serverEntryId,
          stop_at: input.stopAtIso,
          skip_time_report: input.skipReport,
          stop_source: input.stopSource ?? 'user_manual',
          stop_reason: input.stopReason ?? 'unified_stop',
        });
        try { window.dispatchEvent(new Event('timer-state-changed')); } catch {}
        try { window.dispatchEvent(new Event('active-day-state-refresh')); } catch {}
        return { saved: !input.skipReport, via: 'server' };
      }

      return { saved: false, via: 'noop' };
    },
    [activeTimers, stopSession],
  );

  /**
   * The dialog element MUST be rendered by callers so the break prompt
   * is mounted in their tree. Returned as a ready-to-render fragment
   * so call-sites don't have to know about StopBreakDecisionDialog.
   */
  const dialogs = (
    <StopBreakDecisionDialog {...breakDecision.dialogProps} />
  );

  return {
    // pass-through from geofencing — call-sites usually need these too
    geo,
    activeTimers,

    // unified engine
    startSession,
    startSessionWithDistanceCheck,
    stopSession,
    stopAny,
    cancelPendingSession,
    getActiveTimer,
    resolveTargetCoords,

    // mount in tree
    dialogs,
  };
}
