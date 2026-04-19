/**
 * timerRole
 * =========
 *
 * The CANONICAL place where we classify an active timer's role in the
 * workday engine. Every stop surface (banner, time-report page, location
 * detail) MUST go through this helper to decide what kind of stop to
 * perform. No other module is allowed to inspect `key.startsWith('…')`
 * or `timer.locationId` to make that call.
 *
 * Architectural decision (Prompt 2):
 *
 *   We picked the **hybrid** model:
 *     - A `location` timer is by default a PURE PRESENCE signal:
 *           • no time_report on stop
 *           • closing it just closes the open location_time_entries row
 *           • used for fixed-location signals like "Lager" presence
 *     - A `location` timer MAY be promoted to a REPORTABLE WORK SESSION
 *       at start time by setting `presenceOnly: false`. From that point on
 *       it follows the same save-then-stop rules as booking/project timers.
 *     - Booking and project timers are ALWAYS reportable. There is no
 *       "presence-only" mode for them — there is no signal to record
 *       without a time report.
 *
 * The role is FROZEN at start time on the ActiveTimer (see
 * useGeofencing.startTimer + ActiveTimer.presenceOnly). Stop surfaces
 * read it back; they never re-derive it from screen context. This is
 * what makes "stopping the same timer from any screen produces the same
 * result" hold.
 */
import type { ActiveTimer } from '@/hooks/useGeofencing';
import type { WorkTarget } from '@/hooks/useWorkSession';

export type TimerKind = 'booking' | 'project' | 'location';

export interface TimerRole {
  kind: TimerKind;
  /** True when stopping should NOT create a time_report (pure presence). */
  presenceOnly: boolean;
}

/**
 * Decide an active timer's role from its persisted shape alone. Pure —
 * no DOM, no globals.
 *
 * Order of precedence:
 *   1. locationId  → location timer.
 *      • presenceOnly = timer.presenceOnly ?? true
 *        (legacy timers without the flag default to PRESENCE — that's
 *         how location timers always behaved before this refactor; we
 *         do not silently start producing time_reports for them.)
 *   2. largeProjectId → project timer (always reportable).
 *   3. otherwise → booking timer (always reportable).
 */
export function getTimerRole(timer: ActiveTimer): TimerRole {
  if (timer.locationId) {
    return {
      kind: 'location',
      presenceOnly: timer.presenceOnly ?? true,
    };
  }
  if (timer.largeProjectId) {
    return { kind: 'project', presenceOnly: false };
  }
  return { kind: 'booking', presenceOnly: false };
}

/**
 * Map (timer + key) → the WorkTarget the unified engine expects.
 *
 * `key` is the canonical local map key (booking id, `project-<id>`,
 * `location-<id>`). For booking timers we trust the key over
 * timer.bookingId because the latter is sometimes set to the local key
 * itself (project / location synthetic ids) — see useGeofencing.
 */
export function buildStopTarget(key: string, timer: ActiveTimer): WorkTarget {
  const role = getTimerRole(timer);

  if (role.kind === 'location') {
    return {
      kind: 'location',
      locationId: timer.locationId!,
      name: timer.locationName || timer.client,
      createsTimeReport: !role.presenceOnly,
    };
  }
  if (role.kind === 'project') {
    return {
      kind: 'project',
      largeProjectId: timer.largeProjectId!,
      name: timer.client,
    };
  }
  return { kind: 'booking', bookingId: key, client: timer.client };
}
