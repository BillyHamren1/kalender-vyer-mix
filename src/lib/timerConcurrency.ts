/**
 * timerConcurrency
 * ================
 *
 * INVOCATION RULE: this engine is called from EXACTLY ONE place —
 * `useTimerStartFlow` (src/hooks/useTimerStartFlow.ts). Direct calls to
 * `startTimer(...)` / `startSession(...)` from feature code that bypass
 * `requestStart()` are forbidden and fail the contract test
 * `src/test/timerStartUnification.contract.test.ts`.
 *
 * Pure rule engine for "may I start this new timer right now?".
 *
 * Replaces the old "max one timer total" hard-block. Concurrency is
 * now decided by ONE active work signal at a time:
 *
 *   • A `location` (presence) timer may NOT run in parallel with a booking
 *     or project timer. Starting the new one is a SWITCH.
 *   • Only one `booking` work timer at a time. Starting another booking
 *     timer is a SWITCH (must be confirmed by the user).
 *   • Only one `project` work timer at a time. Same switch rule.
 *   • A `booking` and a `project` work timer may NOT both be active.
 *   • Re-starting the same target is always a no-op.
 *
 * The output of `evaluateStartConflict` is consumed by mobile screens
 * to either:
 *   - start immediately (`status: 'allow'`)
 *   - open a switch-confirmation dialog (`status: 'switch'`)
 *   - silently ignore (`status: 'duplicate'`)
 */

import type { ActiveTimer } from '@/hooks/useGeofencing';
import { resolveTargetKey, type WorkTarget } from '@/hooks/useWorkSession';

export type StartTargetKind = WorkTarget['kind'];

export interface ConflictingTimer {
  /** Local key in the activeTimers map (booking id, `location-…`, `project-…`). */
  key: string;
  /** Best-effort human label for the prompt. */
  label: string;
  /** What kind of timer is currently running and now blocks the new start. */
  kind: StartTargetKind;
}

export type StartEvaluation =
  | {
      /** Free to start — no conflict, just call startSession. */
      status: 'allow';
    }
  | {
      /** The exact same target is already running. UI should no-op. */
      status: 'duplicate';
    }
  | {
      /**
       * Another timer of an incompatible kind is already running.
       * UI should ask the user to confirm a switch (stop old, start new).
       */
      status: 'switch';
      conflict: ConflictingTimer;
      /** Short reason for the dialog body. */
      reason:
        | 'one_active_timer_at_a_time'
        | 'one_booking_at_a_time'
        | 'one_project_at_a_time'
        | 'booking_vs_project'
        | 'one_location_at_a_time';
    };

function timerKindFromActive(t: ActiveTimer): StartTargetKind {
  if (t.locationId) return 'location';
  if (t.largeProjectId) return 'project';
  return 'booking';
}

function labelFor(t: ActiveTimer): string {
  return t.locationName || t.client || 'pågående timer';
}

/**
 * Decide whether starting `target` is allowed, a switch, or a duplicate.
 *
 * Inputs are pure data so this function is trivially testable.
 */
export function evaluateStartConflict(
  target: WorkTarget,
  activeTimers: Map<string, ActiveTimer>,
): StartEvaluation {
  const targetKey = resolveTargetKey(target);

  // Same target already running → no-op.
  if (activeTimers.has(targetKey)) {
    return { status: 'duplicate' };
  }

  // Walk the active timers and look for the first incompatible one.
  // Policy: ONE active timer at a time, regardless of whether it was started
  // manually or by system assistance. The same target remains a duplicate;
  // every different active target becomes a switch.
  for (const [key, timer] of activeTimers) {
    const kind = timerKindFromActive(timer);

    if (target.kind === 'location') {
      return {
        status: 'switch',
        reason:
          kind === 'location'
            ? 'one_location_at_a_time'
            : 'one_active_timer_at_a_time',
        conflict: { key, label: labelFor(timer), kind },
      };
    }

    if (target.kind === 'booking') {
      if (kind === 'location') {
        return {
          status: 'switch',
          reason: 'one_active_timer_at_a_time',
          conflict: { key, label: labelFor(timer), kind },
        };
      }
      if (kind === 'booking') {
        return {
          status: 'switch',
          reason: 'one_booking_at_a_time',
          conflict: { key, label: labelFor(timer), kind },
        };
      }
      if (kind === 'project') {
        return {
          status: 'switch',
          reason: 'booking_vs_project',
          conflict: { key, label: labelFor(timer), kind },
        };
      }
    }

    // target.kind === 'project'
    if (kind === 'location') {
      return {
        status: 'switch',
        reason: 'one_active_timer_at_a_time',
        conflict: { key, label: labelFor(timer), kind },
      };
    }
    if (kind === 'project') {
      return {
        status: 'switch',
        reason: 'one_project_at_a_time',
        conflict: { key, label: labelFor(timer), kind },
      };
    }
    if (kind === 'booking') {
      return {
        status: 'switch',
        reason: 'booking_vs_project',
        conflict: { key, label: labelFor(timer), kind },
      };
    }
  }

  return { status: 'allow' };
}
