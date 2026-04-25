/**
 * workDayDecisions.ts
 * ───────────────────
 * Ren beslutslogik för arbetsdagsassistenten — utan React, utan timers,
 * utan IO. `nextAssistantDecision(state)` är en deterministisk funktion
 * som givet ett ögonblick av "vad systemet vet" returnerar antingen NÄSTA
 * fråga assistenten ska ställa, eller `null` om allt är lugnt.
 *
 * Varför separat fil?
 *   • Kontraktstesterna (src/test/workDayEngine.contract.test.ts) kan låsa
 *     beslutsregler utan att slåss mot setInterval/setState/jsdom.
 *   • `useWorkDayAssistant` blir en tunn wrapper som matar in state och
 *     surfaceaer resultatet — UI-koden ändras inte.
 *
 * VIKTIGT: Funktionen får ALDRIG ändra tid, skapa anomalies, eller skriva
 * till servern. Den producerar bara ett beslut. Side-effects (t.ex. att
 * skapa en `workday_flag` när vi visar `unclassified_anomaly`) sker i
 * hookens wrapper, så att beslutsregeln själv förblir ren.
 *
 * Se även:
 *   - mem://features/field-staff/workday-flags-v1
 *   - mem://features/field-staff/end-day-vs-end-activity-v1
 *   - mem://features/field-staff/work-session-engine-v1
 */

import type { ActiveTimer, GpsPosition } from '@/hooks/useGeofencing';
import { haversineDistance } from '@/hooks/useGeofencing';

// ── Konstanter speglar useWorkDayAssistant-policyn 1:1 ──
export const ACTIVITY_LEAVE_FAR_METERS = 300;
export const ACTIVITY_LEAVE_LONG_MINUTES = 10;
export const LONG_PASS_HOURS = 5;
export const DAYSTART_QUIET_HOURS_FROM = 4;
export const DAYSTART_QUIET_HOURS_TO = 11;
export const EVENING_FROM = 17;
export const EVENING_TO = 28; // wraps past midnight
export const LAST_WORKPLACE_GAP_MIN = 15;
export const LAST_WORKPLACE_GAP_MAX_HOURS = 12;

export const COOLDOWNS_MS: Record<DecisionKind, number> = {
  daystart: 8 * 3600 * 1000,
  activity_leave: 30 * 60 * 1000,
  last_workplace_for_day: 60 * 60 * 1000,
  long_pass_no_break: 60 * 60 * 1000,
  unclassified_anomaly: 24 * 3600 * 1000,
};

export type DecisionKind =
  | 'daystart'
  | 'activity_leave'
  | 'last_workplace_for_day'
  | 'long_pass_no_break'
  | 'unclassified_anomaly';

export interface DaystartDecision {
  kind: 'daystart';
  firstSignalIso: string;
  arrivedAtWorkplace: boolean;
}
export interface ActivityLeaveDecision {
  kind: 'activity_leave';
  timerKey: string;
  timer: ActiveTimer;
  distanceMeters: number;
  outsideSinceIso: string;
  outsideMinutes: number;
}
export interface LastWorkplaceForDayDecision {
  kind: 'last_workplace_for_day';
  lastExitIso: string;
  locationName: string | null;
}
export interface LongPassNoBreakDecision {
  kind: 'long_pass_no_break';
  timerKey: string;
  timer: ActiveTimer;
  passHours: number;
}
export interface UnclassifiedAnomalyDecision {
  kind: 'unclassified_anomaly';
  count: number;
  oldestStartedAtIso: string;
}

export type AssistantDecision =
  | DaystartDecision
  | ActivityLeaveDecision
  | LastWorkplaceForDayDecision
  | LongPassNoBreakDecision
  | UnclassifiedAnomalyDecision;

// ── State som regelmotorn behöver ──
export interface CachedTarget {
  key: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  type: 'fixed' | 'project' | 'booking';
}

export interface WorkDayState {
  /** Wall-clock now (ms). Injicerad så testerna kan styra tid. */
  now: number;
  enabled: boolean;
  latestPosition: GpsPosition | null;
  /** Aktiva timers som lista — färre antaganden om Map-iteration. */
  timers: Array<{ key: string; timer: ActiveTimer }>;
  /** Cachade geofence-targets (location, project, booking). */
  cachedTargets: CachedTarget[];
  /** Sista server-bekräftade workplace-exit, om någon. */
  lastExit: { iso: string; name: string | null } | null;
  /** Oklassade anomalies som väntar på klassning. */
  pendingAnomalies: { count: number; oldestStartedAtIso: string | null };
  /** Pågår en travel-session just nu? Suppressar `activity_leave`. */
  isTravelling: boolean;
  /** Senast visad timestamp per decision-kind. Tom Map → cooldown alltid expired. */
  lastShownByKind: Map<DecisionKind, number>;
  /** Tidpunkter då användaren steg ut ur respektive timer-zon. */
  outsideSinceByTimer: Map<string, number>;
  /** Första signifikanta GPS-signalen idag, om vi sett den. */
  firstSignalToday: { iso: string; arrivedAtWorkplace: boolean } | null;
}

// ─────────────────────────────────────────────────────────────────────
// Hjälpare (rena)
// ─────────────────────────────────────────────────────────────────────

export function isMorningWindow(d: Date): boolean {
  const h = d.getHours();
  return h >= DAYSTART_QUIET_HOURS_FROM && h < DAYSTART_QUIET_HOURS_TO;
}

export function isEveningWindow(d: Date): boolean {
  const h = d.getHours();
  const adjusted = h < DAYSTART_QUIET_HOURS_FROM ? h + 24 : h;
  return adjusted >= EVENING_FROM && adjusted < EVENING_TO;
}

export function cooldownExpired(
  kind: DecisionKind,
  now: number,
  lastShown: Map<DecisionKind, number>,
): boolean {
  const last = lastShown.get(kind) || 0;
  return now - last >= COOLDOWNS_MS[kind];
}

// ─────────────────────────────────────────────────────────────────────
// Huvudfunktion
// ─────────────────────────────────────────────────────────────────────

/**
 * Returnerar nästa fråga assistenten ska ställa, eller null om inget.
 * Sidoeffekter (mutera outsideSinceByTimer / lastShownByKind) sker INTE
 * här — det är ett medvetet val. Wrapper-hooken speglar det den behöver.
 *
  * Prioritetsordning (högst → lägst):
  *   1. activity_leave        (per aktiv timer, suppressas under travel)
  *   2. last_workplace_for_day (kvällsförslag att stänga dagen)
  *   3. daystart              (morgonhälsning)
  *
  * OBS: `unclassified_anomaly` visas inte längre proaktivt som popup.
  * OBS: `long_pass_no_break` triggas INTE proaktivt — rast hanteras endast
  * vid timer-stop via `breakPolicy` (StopBreakDecisionDialog) när passet >5h.
  * Användarbeslut: inga upprepade rast-påminnelser under arbetsdagen.
  */
export function nextAssistantDecision(state: WorkDayState): AssistantDecision | null {
  if (!state.enabled) return null;

  const { now } = state;
  const nowDate = new Date(now);

  // ── Activity-leave (per aktiv timer, suppressas under travel) ──
  if (state.latestPosition && state.timers.length > 0 && !state.isTravelling) {
    for (const { key, timer } of state.timers) {
      const target = state.cachedTargets.find((t) => t.key === key);
      if (!target) continue;

      const distance = haversineDistance(
        state.latestPosition.lat,
        state.latestPosition.lng,
        target.lat,
        target.lng,
      );
      const outsideThreshold = (target.radius || 150) + ACTIVITY_LEAVE_FAR_METERS;
      if (distance < outsideThreshold) continue;

      const since = state.outsideSinceByTimer.get(key);
      if (since === undefined) continue; // wrapper sätter denna nästa tick
      const outsideMin = (now - since) / 60_000;
      if (
        outsideMin >= ACTIVITY_LEAVE_LONG_MINUTES &&
        cooldownExpired('activity_leave', now, state.lastShownByKind)
      ) {
        return {
          kind: 'activity_leave',
          timerKey: key,
          timer,
          distanceMeters: Math.round(distance),
          outsideSinceIso: new Date(since).toISOString(),
          outsideMinutes: Math.round(outsideMin),
        };
      }
    }
  }

  // ── 4) Sista arbetsplatsen för dagen ──
  if (
    state.timers.length === 0 &&
    state.lastExit &&
    isEveningWindow(nowDate) &&
    cooldownExpired('last_workplace_for_day', now, state.lastShownByKind)
  ) {
    const exitMs = new Date(state.lastExit.iso).getTime();
    const gapMin = (now - exitMs) / 60_000;
    if (gapMin >= LAST_WORKPLACE_GAP_MIN && gapMin <= LAST_WORKPLACE_GAP_MAX_HOURS * 60) {
      return {
        kind: 'last_workplace_for_day',
        lastExitIso: state.lastExit.iso,
        locationName: state.lastExit.name,
      };
    }
  }

  // ── 5) Daystart-hälsning ──
  if (
    state.timers.length === 0 &&
    isMorningWindow(nowDate) &&
    state.firstSignalToday &&
    cooldownExpired('daystart', now, state.lastShownByKind)
  ) {
    return {
      kind: 'daystart',
      firstSignalIso: state.firstSignalToday.iso,
      arrivedAtWorkplace: state.firstSignalToday.arrivedAtWorkplace,
    };
  }

  return null;
}
