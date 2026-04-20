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
 */

import { useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import {
  useGeofencing,
  ActiveTimer,
  haversineDistance,
  ENTER_RADIUS,
  getGpsSettings,
} from '@/hooks/useGeofencing';
import { useStopBreakDecision } from '@/hooks/useStopBreakDecision';
import { shouldPromptForBreak } from '@/utils/breakPolicy';
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
       * Pure fixed-location presence (e.g. Lager) does NOT produce a
       * time_report on stop — it just closes the server entry. This is
       * the only intentional behavioural difference between target types.
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
  // Location presence timers don't tag a booking or project.
  return {};
}

function shouldCreateTimeReport(target: WorkTarget): boolean {
  if (target.kind === 'location') return target.createsTimeReport === true;
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
  const geo = useGeofencing(bookings, staffId);
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
   * START — same for all three target types.
   * Maps target → key + start args, then defers to the server-anchored
   * sync queue inside useGeofencing.
   */
  const startSession = useCallback(
    (target: WorkTarget, opts: StartSessionOptions = {}): boolean => {
      const key = resolveTargetKey(target);

      // SOFT LOCK: only block re-starting the same key. Parallel timers
      // across different target types are valid signals.
      if (activeTimers.has(key)) return false;

      if (target.kind === 'booking') {
        return startTimer(
          target.bookingId,
          target.client,
          false,
          opts.taskId,
          opts.taskTitle,
          undefined,
          undefined,
          undefined,
          opts.startedAtIso,
        );
      }
      if (target.kind === 'project') {
        return startTimer(
          key,
          target.name,
          false,
          opts.taskId,
          opts.taskTitle,
          undefined,
          undefined,
          target.largeProjectId,
          opts.startedAtIso,
        );
      }
      // location
      return startTimer(
        key,
        target.name,
        false,
        opts.taskId,
        opts.taskTitle,
        target.locationId,
        target.name,
        undefined,
        opts.startedAtIso,
      );
    },
    [activeTimers, startTimer],
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
      let savedReportId: string | undefined;
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
          savedReportId = (stopped as any)?.serverEntryId;
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
            time_report_id: savedReportId,
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
            time_report_id: savedReportId,
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
    stopSession,
    cancelPendingSession,
    getActiveTimer,

    // mount in tree
    dialogs,
  };
}
