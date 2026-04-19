/**
 * useWorkSession — UNIFIED WORK-SESSION ENGINE
 * ============================================
 *
 * One time-reporting engine, three target types.
 *
 * Architectural decision (Prompt 2):
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
 *
 * ---------------------------------------------------------------------
 * SHARED CORE (identical for all three types)
 *   • startSession()             — optimistic local + enqueue server start
 *   • stopSession()              — prompt for break, then save-or-skip-then-stop
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
   *   1. Compute pass length.
   *   2. If pass > prompt threshold → open StopBreakDecisionDialog and
   *      WAIT for an explicit user decision (break / no_break / anomaly).
   *      Short passes are saved with break = 0 directly (no dialog).
   *   3. If the target produces a time_report (booking/project, and
   *      location only when createsTimeReport=true): SAVE FIRST via the
   *      hook's saveAndStopTimer. On failure → timer survives so the user
   *      can retry. NEVER clear local first.
   *   4. If the target does NOT produce a time_report (pure location
   *      presence): just close the server entry via
   *      stopLocationTimerWithoutReport. Same save-then-clear ordering.
   *   5. If the user picked "anomaly", create an end-of-day anomaly so
   *      admin can follow up — never silently fudge the numbers.
   */
  const stopSession = useCallback(
    async (target: WorkTarget): Promise<StopSessionResult> => {
      const key = resolveTargetKey(target);
      const timer = activeTimers.get(key);
      if (!timer) return { saved: false };

      const stopTime = new Date();
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
      if (shouldPromptForBreak(totalHours)) {
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
      try {
        if (shouldCreateTimeReport(target)) {
          const targetFields = resolveReportTargetFields(target);
          await saveAndStopTimer(key, {
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
        } else {
          await stopLocationTimerWithoutReport(key);
        }
      } catch (err) {
        // Save-then-stop guarantee: timer stays alive so the user can retry.
        console.warn('[WorkSession] stop failed, timer kept alive:', err);
        throw err;
      }

      // STEP 5 — anomaly is best-effort; report is already saved.
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
          });
        } catch (err) {
          console.warn('[WorkSession] anomaly persist failed (non-fatal):', err);
        }
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
