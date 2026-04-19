/**
 * useWorkDayAssistant
 * ====================
 *
 * Proaktiv arbetsdagsassistent (Prompt 4).
 *
 * Bygger ett tunt TOLKNINGSLAGER ovanpå redan existerande råsignaler. Skapar
 * inga nya datakällor och rör inte tidrapporter eller löneberäkningar — den
 * sammanställer bara situationer och föreslår RÄTT FRÅGA vid RÄTT TILLFÄLLE.
 *
 * ─── Tre tydliga lager (dokumenterade här en gång — se Decision-typen) ───
 *
 *   1. RawSignal     — det rå systemet redan känner till:
 *                       • GpsPosition (från useBackgroundLocationReporter)
 *                       • activeTimers Map (från useGeofencing)
 *                       • geofence-targets cache i localStorage
 *                       • pending anomalies från servern
 *                       • last workplace-exit från servern
 *                       • klockan
 *
 *   2. Interpretation — assistantens HYPOTES om situationen:
 *                       • "användaren verkar börja arbetsdagen"
 *                       • "användaren verkar lämna en aktivitet"
 *                       • "användaren verkar lämna sista arbetsplatsen för dagen"
 *                       • "användaren har långt pass utan registrerad rast"
 *                       • "användaren har oklassade glapp att hantera"
 *                       Tolkningar är alltid SVAGA — vi kan ha fel.
 *
 *   3. Decision      — den UI-fråga assistenten faktiskt vill ställa just nu.
 *                       Aldrig en automatisk tidsändring. Antingen ställer vi
 *                       en fråga, eller så skapar vi en anomaly för uppföljning.
 *
 * INGENTING här konverterar tyst en tolkning till betald tid. Allt går via
 * användarens svar, eller via en anomaly om vi är osäkra.
 *
 * Throttling: varje decision-typ har en cooldown så vi inte spammar samma
 * fråga om GPS skvätter in/ut ur en zon. Cooldowns lagras per session i
 * en in-memory ref (avsiktligt INTE i localStorage — assistenten är inte
 * persistent och får börja om vid app-start).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import {
  type ActiveTimer,
  type GpsPosition,
  haversineDistance,
} from '@/hooks/useGeofencing';

// ─────────────────────────────────────────────────────────────────────
// Constants — tunable assistant policy
// ─────────────────────────────────────────────────────────────────────

const ACTIVITY_LEAVE_FAR_METERS = 300; // user must be ≥300 m outside the geofence
const ACTIVITY_LEAVE_LONG_MINUTES = 10; // ...and have been outside for ≥10 min
const LONG_PASS_HOURS = 5; // matches breakPolicy.BREAK_PROMPT_THRESHOLD_HOURS
const DAYSTART_QUIET_HOURS_FROM = 4; // 04:00–11:00 = morning window
const DAYSTART_QUIET_HOURS_TO = 11;
const EVENING_FROM = 17; // 17:00 onwards = "looks like end of day"
const EVENING_TO = 28; // wraps past midnight (24+4) so late-night still counts
const LAST_WORKPLACE_GAP_MIN = 15;
const LAST_WORKPLACE_GAP_MAX_HOURS = 12;

// Cooldown per decision type so we don't spam the same prompt.
const COOLDOWNS_MS: Record<DecisionKind, number> = {
  daystart: 8 * 3600 * 1000, // ask at most once per 8h
  activity_leave: 30 * 60 * 1000, // 30 min between leave-prompts per timer
  last_workplace_for_day: 60 * 60 * 1000, // once an hour at most
  long_pass_no_break: 60 * 60 * 1000, // remind hourly while open
  unclassified_anomaly: 4 * 3600 * 1000, // remind every 4h while open
};

const TICK_INTERVAL_MS = 30_000; // re-evaluate every 30s

// ─────────────────────────────────────────────────────────────────────
// Decision types — what UI surface should react to
// ─────────────────────────────────────────────────────────────────────

export type DecisionKind =
  | 'daystart'
  | 'activity_leave'
  | 'last_workplace_for_day'
  | 'long_pass_no_break'
  | 'unclassified_anomaly';

export interface DaystartDecision {
  kind: 'daystart';
  /** ISO of the first significant signal seen today (movement / arrival). */
  firstSignalIso: string;
  /** Did the assistant see an arrival at a known workplace too? */
  arrivedAtWorkplace: boolean;
}

export interface ActivityLeaveDecision {
  kind: 'activity_leave';
  /** Active timer key the user appears to have walked away from. */
  timerKey: string;
  timer: ActiveTimer;
  /** How far user is currently from the timer's geofence (meters). */
  distanceMeters: number;
  /** How long since they crossed out of the geofence (ISO + minutes). */
  outsideSinceIso: string;
  outsideMinutes: number;
}

export interface LastWorkplaceForDayDecision {
  kind: 'last_workplace_for_day';
  /** ISO of last server-recorded workplace exit. */
  lastExitIso: string;
  /** Friendly label of the workplace they left, if available. */
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
  /** Number of pending anomalies waiting for break/work classification. */
  count: number;
  /** Most recent anomaly's window so the UI can show a hint. */
  oldestStartedAtIso: string;
}

export type AssistantDecision =
  | DaystartDecision
  | ActivityLeaveDecision
  | LastWorkplaceForDayDecision
  | LongPassNoBreakDecision
  | UnclassifiedAnomalyDecision;

// ─────────────────────────────────────────────────────────────────────
// Hook input
// ─────────────────────────────────────────────────────────────────────

export interface WorkDayAssistantInput {
  /** Set to false to fully disable the assistant (e.g. user signed out). */
  enabled: boolean;
  /** Latest GPS sample, sourced from the existing background reporter. */
  latestPosition: GpsPosition | null;
  /** Active timers from useGeofencing — read-only here. */
  activeTimers: Map<string, ActiveTimer>;
  /**
   * Whether the user is currently in an active travel session
   * (useTravelDetection.travelState.isMoving).
   *
   * This is used as an INTERPRETIVE SIGNAL to suppress the
   * `activity_leave` decision: if the user is far from a worksite *and*
   * is currently travelling, the geofence-exit is naturally explained by
   * travel — we don't need to ask "verkar du lämnat aktiviteten?".
   *
   * Travel logs themselves remain semantically separate from time
   * reports. This flag does NOT change pay logic; it only prevents the
   * assistant from generating noise during legitimate movement.
   */
  isTravelling?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────

interface CachedTarget {
  key: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  type: 'fixed' | 'project' | 'booking';
}

const GEOFENCE_TARGETS_KEY = 'eventflow-geofence-targets';

function readCachedTargets(): CachedTarget[] {
  try {
    const raw = localStorage.getItem(GEOFENCE_TARGETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CachedTarget[];
  } catch {
    return [];
  }
}

function isMorningWindow(d: Date): boolean {
  const h = d.getHours();
  return h >= DAYSTART_QUIET_HOURS_FROM && h < DAYSTART_QUIET_HOURS_TO;
}

function isEveningWindow(d: Date): boolean {
  const h = d.getHours();
  // Map late-night (00–04) into the evening window via the +24 trick.
  const adjusted = h < DAYSTART_QUIET_HOURS_FROM ? h + 24 : h;
  return adjusted >= EVENING_FROM && adjusted < EVENING_TO;
}

// ─────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────

export function useWorkDayAssistant(input: WorkDayAssistantInput): {
  /** Currently surfaced decision, if any. UI renders dialogs based on this. */
  decision: AssistantDecision | null;
  /** Tell the assistant the user has handled this decision (clears it + cooldown). */
  acknowledge: () => void;
} {
  const { enabled, latestPosition, activeTimers, isTravelling = false } = input;

  // Outside-geofence trackers per timer key — when the user crossed out,
  // measured against the last cached target list.
  const outsideSinceRef = useRef<Map<string, number>>(new Map());

  // Cooldowns per decision kind — prevents prompt spam.
  const lastShownRef = useRef<Map<string, number>>(new Map());

  // First significant signal of the day — used by the daystart interpretation.
  const firstSignalTodayRef = useRef<{ iso: string; arrivedAtWorkplace: boolean } | null>(null);

  // The currently-surfaced decision (only one at a time — sequential).
  const [decision, setDecision] = useState<AssistantDecision | null>(null);

  // Server-side state we re-fetch on a slow tick so we don't hammer the API.
  const [pendingAnomalies, setPendingAnomalies] = useState<{
    count: number;
    oldestStartedAtIso: string | null;
  }>({ count: 0, oldestStartedAtIso: null });
  const [lastExit, setLastExit] = useState<{
    iso: string;
    name: string | null;
  } | null>(null);

  // Memoise activeTimers as an array for easier iteration.
  const timersList = useMemo(
    () => Array.from(activeTimers.entries()).map(([key, timer]) => ({ key, timer })),
    [activeTimers],
  );

  // ───── Slow tick: refresh server-derived signals ─────
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const refreshServer = async () => {
      try {
        const [anomaliesRes, exitRes] = await Promise.allSettled([
          mobileApi.listPendingAnomalies(),
          mobileApi.getLastWorkplaceExit(),
        ]);
        if (cancelled) return;

        if (anomaliesRes.status === 'fulfilled') {
          // Only count anomalies that aren't already classified.
          const open = (anomaliesRes.value.anomalies || []).filter(
            (a: any) => !a.classification,
          );
          const oldest = open.reduce<string | null>((acc, a) => {
            if (!acc) return a.started_at;
            return a.started_at < acc ? a.started_at : acc;
          }, null);
          setPendingAnomalies({
            count: open.length,
            oldestStartedAtIso: oldest,
          });
        }

        if (exitRes.status === 'fulfilled' && exitRes.value.last_exit?.exited_at) {
          setLastExit({
            iso: exitRes.value.last_exit.exited_at,
            name: exitRes.value.last_exit.location_name,
          });
        }
      } catch (err) {
        // Best-effort — assistant is optional UX, never throw upstream.
        console.warn('[Assistant] server refresh failed:', err);
      }
    };

    refreshServer();
    const id = window.setInterval(refreshServer, 2 * 60_000); // every 2 min
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshServer();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  // ───── Daystart capture: first significant signal of the calendar day ─────
  useEffect(() => {
    if (!enabled || !latestPosition) return;
    const today = new Date().toISOString().slice(0, 10);
    const prev = firstSignalTodayRef.current;
    if (prev && prev.iso.slice(0, 10) === today) return; // already captured today

    // Detect "arrival at a workplace" — user is inside any cached target.
    const targets = readCachedTargets();
    const arrivedAtWorkplace = targets.some((t) => {
      const d = haversineDistance(
        latestPosition.lat,
        latestPosition.lng,
        t.lat,
        t.lng,
      );
      return d <= (t.radius || 150);
    });

    firstSignalTodayRef.current = {
      iso: new Date(latestPosition.timestamp).toISOString(),
      arrivedAtWorkplace,
    };
  }, [enabled, latestPosition]);

  // ───── Main interpretation tick ─────
  useEffect(() => {
    if (!enabled) return;

    const evaluate = () => {
      // If a decision is already surfaced, don't replace it — UI handles it.
      if (decision) return;

      const now = Date.now();
      const nowDate = new Date(now);

      const isCooldownExpired = (kind: DecisionKind) => {
        const last = lastShownRef.current.get(kind) || 0;
        return now - last >= COOLDOWNS_MS[kind];
      };

      // ── 1) Unclassified anomalies waiting (server-derived) ──
      // Lowest urgency but highest signal-to-noise — the user already left
      // a gap in their work and admin needs the classification anyway.
      if (
        pendingAnomalies.count > 0 &&
        pendingAnomalies.oldestStartedAtIso &&
        isCooldownExpired('unclassified_anomaly')
      ) {
        const next: UnclassifiedAnomalyDecision = {
          kind: 'unclassified_anomaly',
          count: pendingAnomalies.count,
          oldestStartedAtIso: pendingAnomalies.oldestStartedAtIso,
        };
        setDecision(next);
        return;
      }

      // ── 2) Long pass without registered break ──
      // We can't see "registered break" because breaks are only entered AT
      // stop-time. Interpretation: timer has been open > LONG_PASS_HOURS.
      // We surface a gentle nudge — the user can stop now and answer the
      // break question, or dismiss and keep working.
      for (const { key, timer } of timersList) {
        if (timer.isStale) continue; // stale dialog handles this
        const passHours =
          (now - new Date(timer.startTime).getTime()) / 3600_000;
        if (passHours >= LONG_PASS_HOURS && isCooldownExpired('long_pass_no_break')) {
          const next: LongPassNoBreakDecision = {
            kind: 'long_pass_no_break',
            timerKey: key,
            timer,
            passHours,
          };
          setDecision(next);
          return;
        }
      }

      // ── 3) Activity-leave (per active timer) ──
      // Only fires if user is FAR (≥300 m outside the radius) AND has been
      // outside for ≥10 min — chosen explicitly to keep prompt count low.
      //
      // SUPPRESSED while a travel session is active: being far from a
      // worksite is naturally explained by travel, so we don't pile a
      // "verkar du lämnat aktiviteten?" prompt on top of the travel banner.
      // The travel log itself is the semantic record of that movement.
      if (latestPosition && timersList.length > 0 && !isTravelling) {
        const targets = readCachedTargets();
        for (const { key, timer } of timersList) {
          const target = targets.find((t) => t.key === key);
          if (!target) continue;

          const distance = haversineDistance(
            latestPosition.lat,
            latestPosition.lng,
            target.lat,
            target.lng,
          );
          const outsideThreshold = (target.radius || 150) + ACTIVITY_LEAVE_FAR_METERS;

          if (distance >= outsideThreshold) {
            // Track when they crossed out
            if (!outsideSinceRef.current.has(key)) {
              outsideSinceRef.current.set(key, now);
              continue; // need to be outside long enough — re-check next tick
            }
            const since = outsideSinceRef.current.get(key)!;
            const outsideMin = (now - since) / 60_000;
            if (
              outsideMin >= ACTIVITY_LEAVE_LONG_MINUTES &&
              isCooldownExpired('activity_leave')
            ) {
              const next: ActivityLeaveDecision = {
                kind: 'activity_leave',
                timerKey: key,
                timer,
                distanceMeters: Math.round(distance),
                outsideSinceIso: new Date(since).toISOString(),
                outsideMinutes: Math.round(outsideMin),
              };
              setDecision(next);
              return;
            }
          } else {
            // Came back inside — reset
            outsideSinceRef.current.delete(key);
          }
        }
      } else if (isTravelling) {
        // Reset all outside-since trackers while travelling so we don't
        // pop a leave-prompt the moment the travel banner clears.
        outsideSinceRef.current.clear();
      }

      // ── 4) Last workplace for the day ──
      // Interpretation: it's evening, the user has no active timers, and
      // there's a stale workplace-exit we never reconciled. We don't end
      // the day for them — we just SUGGEST they do it.
      if (
        timersList.length === 0 &&
        lastExit &&
        isEveningWindow(nowDate) &&
        isCooldownExpired('last_workplace_for_day')
      ) {
        const exitMs = new Date(lastExit.iso).getTime();
        const gapMin = (now - exitMs) / 60_000;
        if (
          gapMin >= LAST_WORKPLACE_GAP_MIN &&
          gapMin <= LAST_WORKPLACE_GAP_MAX_HOURS * 60
        ) {
          const next: LastWorkplaceForDayDecision = {
            kind: 'last_workplace_for_day',
            lastExitIso: lastExit.iso,
            locationName: lastExit.name,
          };
          setDecision(next);
          return;
        }
      }

      // ── 5) Daystart greeting ──
      // Lowest urgency. Surface only in the morning window and only if we
      // haven't shown it today and there are no active timers (otherwise
      // the user clearly already started without our help).
      if (
        timersList.length === 0 &&
        isMorningWindow(nowDate) &&
        firstSignalTodayRef.current &&
        isCooldownExpired('daystart')
      ) {
        const next: DaystartDecision = {
          kind: 'daystart',
          firstSignalIso: firstSignalTodayRef.current.iso,
          arrivedAtWorkplace: firstSignalTodayRef.current.arrivedAtWorkplace,
        };
        setDecision(next);
        return;
      }
    };

    evaluate();
    const id = window.setInterval(evaluate, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [
    enabled,
    decision,
    timersList,
    latestPosition,
    pendingAnomalies,
    lastExit,
  ]);

  const acknowledge = () => {
    if (!decision) return;
    lastShownRef.current.set(decision.kind, Date.now());
    setDecision(null);
  };

  return { decision, acknowledge };
}
