/**
 * useWorkSession — UNIFIED WORK-SESSION ENGINE
 * ============================================
 *
 * One time-reporting engine, three target types.
 *
 * Architectural decision (Prompt 2 + 3):
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
 *   • Two distinct stop verbs at the UI level:
 *       - stopSession(target)  → "Avsluta aktivitet" (one signal, day stays open)
 *       - endDay()             → "Avsluta dagen"     (close ALL signals, then
 *                                                     reconcile workplace exit
 *                                                     and create anomalies for
 *                                                     anything we can't be sure of)
 *
 * ---------------------------------------------------------------------
 * SHARED CORE (identical for all three types)
 *   • startSession()             — optimistic local + enqueue server start
 *   • stopSession()              — prompt for break, then save-or-skip-then-stop
 *   • cancelPendingSession()     — drop a still-unsynced start
 *   • endDay()                   — stopSession across ALL active timers + EOD
 *   • dialog rendering           — break + end-of-day prompts
 *
 * TARGET-SPECIFIC MAPPING (the only allowed branch)
 *   • resolveTargetKey()         — booking_id | project-{id} | location-{id}
 *   • resolveReportPayload()     — adds booking_id OR large_project_id
 *   • shouldCreateTimeReport()   — false ONLY for pure location presence
 * ---------------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import {
  useGeofencing,
  ActiveTimer,
} from '@/hooks/useGeofencing';
import { useStopBreakDecision } from '@/hooks/useStopBreakDecision';
import { shouldPromptForBreak } from '@/utils/breakPolicy';
import { StopBreakDecisionDialog } from '@/components/mobile-app/StopBreakDecisionDialog';
import { EndOfDayStopDialog, type EndOfDayResult } from '@/components/mobile-app/EndOfDayStopDialog';

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
 * Reverse-engineer a WorkTarget from an ActiveTimer + key. Used by
 * endDay() so we can iterate the live timer map without forcing call-sites
 * to pass target descriptors for things they didn't start themselves
 * (e.g. an auto-started location presence timer).
 */
function targetFromTimer(key: string, timer: ActiveTimer): WorkTarget {
  if (timer.locationId) {
    return {
      kind: 'location',
      locationId: timer.locationId,
      name: timer.locationName || timer.client,
      // EndDay treats location presence as pure presence — no time_report.
      // The user already used "Avsluta aktivitet" on the timer screen if
      // they wanted to convert presence to a logged report.
      createsTimeReport: false,
    };
  }
  if (timer.largeProjectId) {
    return {
      kind: 'project',
      largeProjectId: timer.largeProjectId,
      name: timer.client,
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

export interface StopSessionResult {
  saved: boolean;
  hoursWorked?: number;
  /** True when the user closed the break dialog without choosing. */
  cancelled?: boolean;
}

export interface EndDayResult {
  /** Number of timers we attempted to stop. */
  attempted: number;
  /** Number that successfully saved + cleared. */
  saved: number;
  /** Number the user cancelled mid-flow (timer kept alive). */
  cancelled: number;
  /** Number that errored (timer kept alive — user can retry). */
  failed: number;
  /** True if the EOD reconciliation dialog was shown to the user. */
  reconciliationShown: boolean;
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

  // ───── End-of-day reconciliation dialog state ─────
  // After every active timer has been stopped, we check if the user left
  // their last workplace before stopping. If so we open EndOfDayStopDialog
  // to let them confirm the real end-time and (when relevant) describe
  // what they did between geofence-exit and stop. If they don't reply
  // we DO NOT silently fudge anything — we just leave the dialog open.
  const [eodPrompt, setEodPrompt] = useState<{
    lastExitIso: string;
    locationName: string | null;
  } | null>(null);

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
   * END THE DAY — explicit "I'm done for today" verb.
   *
   * Distinct from stopSession() which closes ONE activity. endDay():
   *
   *   1. Snapshots all currently-active timers.
   *   2. Runs stopSession() on each one through the SAME unified core
   *      — break prompt per long pass, save-then-stop, anomaly when the
   *      user picks "markera som avvikelse". Order is sequential because
   *      the dialogs would otherwise race.
   *   3. After all stops are attempted, fetches the staff member's last
   *      workplace exit. If there's a meaningful gap (≥ 2 min) between
   *      that exit and "now", opens EndOfDayStopDialog so the user can
   *      either confirm the geofence-exit time or describe what they did
   *      between the exit and now (which is persisted as an end-of-day
   *      anomaly via createEndOfDayAnomaly).
   *   4. NEVER silently discards or modifies time. If a timer fails to
   *      save it stays alive and can be retried — same guarantee as the
   *      single-activity stop.
   */
  const endDay = useCallback(async (): Promise<EndDayResult> => {
    // 1) Snapshot — clone so we iterate a stable list even though the
    // map mutates as we clear timers.
    const snapshot = Array.from(activeTimers.entries()).map(([key, timer]) => ({
      key,
      timer,
      target: targetFromTimer(key, timer),
    }));

    let saved = 0;
    let cancelled = 0;
    let failed = 0;

    // 2) Stop each activity sequentially through the unified core. The
    // break dialog needs the user's full attention — running these in
    // parallel would visually stack dialogs and cause race conditions.
    for (const { target } of snapshot) {
      try {
        const res = await stopSession(target);
        if (res.cancelled) cancelled += 1;
        else if (res.saved) saved += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }

    // 3) End-of-day reconciliation against last geofence-exit.
    let reconciliationShown = false;
    try {
      const res = await mobileApi.getLastWorkplaceExit();
      const lastExit = res.last_exit;
      if (lastExit?.exited_at) {
        const exitDate = parseISO(lastExit.exited_at);
        const gapMin = (Date.now() - exitDate.getTime()) / 60000;
        // Only ask about the gap if it's meaningful AND today (not e.g.
        // a stale exit from yesterday morning that shouldn't trigger UI).
        if (gapMin >= 2 && gapMin <= 12 * 60) {
          setEodPrompt({
            lastExitIso: lastExit.exited_at,
            locationName: lastExit.location_name,
          });
          reconciliationShown = true;
        }
      }
    } catch (err) {
      console.warn('[WorkSession] EOD reconciliation lookup failed:', err);
    }

    // 4) Close any open background-anomaly windows so the day is tidy.
    // This is independent of the EOD dialog: anomalies opened by the
    // background tracker are conceptually "the day is over now".
    mobileApi
      .closeOpenAnomalies({ ended_at: new Date().toISOString() })
      .catch((err) => console.warn('[WorkSession] closeOpenAnomalies failed:', err));

    return {
      attempted: snapshot.length,
      saved,
      cancelled,
      failed,
      reconciliationShown,
    };
  }, [activeTimers, stopSession]);

  /**
   * Confirm callback for EndOfDayStopDialog. Persists the post-exit
   * description as an anomaly so admin sees exactly what happened
   * between the geofence exit and the user-stated end time. We do NOT
   * touch any time_reports here — they were already saved during endDay().
   */
  const handleEodConfirm = useCallback(
    async (result: EndOfDayResult) => {
      if (!eodPrompt) return;
      const exitDate = parseISO(eodPrompt.lastExitIso);
      const stopTime = new Date(result.endedAtIso);
      // "Ja, använd geofence-exit" → no anomaly needed (exit already
      // captured by background tracker; nothing unaccounted for).
      if (result.usedSuggestedExit || !result.workDescription) {
        setEodPrompt(null);
        return;
      }
      try {
        // Best-effort GPS for the anomaly endpoint.
        let lat: number | undefined;
        let lng: number | undefined;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('no geolocation'));
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 4000,
              maximumAge: 60_000,
            });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // best-effort
        }
        await mobileApi.createEndOfDayAnomaly({
          started_at: exitDate.toISOString(),
          ended_at: stopTime.toISOString(),
          work_description: result.workDescription,
          end_location_lat: lat,
          end_location_lng: lng,
        });
      } catch (err) {
        console.warn('[WorkSession] EOD anomaly persist failed (non-fatal):', err);
      } finally {
        setEodPrompt(null);
      }
    },
    [eodPrompt],
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
   * The dialogs MUST be rendered by callers so the prompts are mounted
   * in their tree. Returned as a ready-to-render fragment so call-sites
   * don't have to know which dialogs the engine uses internally.
   */
  const dialogs = (
    <>
      <StopBreakDecisionDialog {...breakDecision.dialogProps} />
      {eodPrompt && (
        <EndOfDayStopDialog
          open={!!eodPrompt}
          onOpenChange={(open) => {
            // Closing without confirming = user wants to handle it later.
            // No silent fallback — they can re-open via "Avsluta dagen".
            if (!open) setEodPrompt(null);
          }}
          lastExitIso={eodPrompt.lastExitIso}
          locationName={eodPrompt.locationName}
          onConfirm={handleEodConfirm}
        />
      )}
    </>
  );

  return {
    // pass-through from geofencing — call-sites usually need these too
    geo,
    activeTimers,

    // unified engine
    startSession,
    stopSession,
    endDay,
    cancelPendingSession,
    getActiveTimer,

    // mount in tree
    dialogs,
  };
}
