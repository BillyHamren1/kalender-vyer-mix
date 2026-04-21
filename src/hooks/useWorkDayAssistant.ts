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
import {
  nextAssistantDecision,
  ACTIVITY_LEAVE_FAR_METERS,
  DAYSTART_QUIET_HOURS_FROM,
  DAYSTART_QUIET_HOURS_TO,
  EVENING_FROM,
  EVENING_TO,
  type CachedTarget,
  type AssistantDecision as PureAssistantDecision,
  type DecisionKind as PureDecisionKind,
} from '@/lib/workDayDecisions';
import { hasWorkdayEndedToday } from '@/services/workdayState';

// ─────────────────────────────────────────────────────────────────────
// Constants no longer duplicated here — see src/lib/workDayDecisions.ts
// ─────────────────────────────────────────────────────────────────────

const TICK_INTERVAL_MS = 30_000; // re-evaluate every 30s
const LAST_WORKPLACE_PROMPTED_KEY_PREFIX = 'eventflow-last-workplace-prompted-';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasLastWorkplacePromptBeenHandledToday(): boolean {
  try {
    return localStorage.getItem(LAST_WORKPLACE_PROMPTED_KEY_PREFIX + todayKey()) === '1';
  } catch {
    return false;
  }
}

function markLastWorkplacePromptHandledToday() {
  try {
    localStorage.setItem(LAST_WORKPLACE_PROMPTED_KEY_PREFIX + todayKey(), '1');
  } catch {
    /* ignore */
  }
}

// Re-export pure types so existing UI imports keep working.
export type DecisionKind = PureDecisionKind;
export type AssistantDecision = PureAssistantDecision;
export type {
  DaystartDecision,
  ActivityLeaveDecision,
  LastWorkplaceForDayDecision,
  LongPassNoBreakDecision,
  UnclassifiedAnomalyDecision,
} from '@/lib/workDayDecisions';

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
  /**
   * When true, suppress NEW prompts (e.g. arrival dialog, stale-timer dialog,
   * travel-completed dialog or end-of-day flow is already showing). Existing
   * decision stays surfaced — we just don't elbow our way in front of another
   * critical prompt. Mobile layout passes this in.
   */
  isQuiet?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers (CachedTarget type lives in workDayDecisions.ts)
// ─────────────────────────────────────────────────────────────────────

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
  const { enabled, latestPosition, activeTimers, isTravelling = false, isQuiet = false } = input;

  // Outside-geofence trackers per timer key — when the user crossed out,
  // measured against the last cached target list.
  const outsideSinceRef = useRef<Map<string, number>>(new Map());

  // Cooldowns per decision kind — prevents prompt spam.
  const lastShownRef = useRef<Map<PureDecisionKind, number>>(new Map());

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
  // The wrapper handles only the SIDE-EFFECTS that the pure decision engine
  // can't (or shouldn't): updating outsideSince trackers, persisting an
  // unclassified-anomaly flag to the server, and committing setDecision.
  // The actual rule resolution is delegated to nextAssistantDecision so the
  // contract suite can lock the rules without mocking React.
  useEffect(() => {
    if (!enabled) return;

    const evaluate = () => {
      // If a decision is already surfaced, don't replace it — UI handles it.
      if (decision) return;
      // Suppress new prompts while another critical dialog/flow is open.
      if (isQuiet) return;

      const now = Date.now();

      // Side-effect 1: outsideSince tracking (the pure engine reads this map
      // but does not mutate it — keeps the rule deterministic from inputs).
      const targets = readCachedTargets();
      if (latestPosition && timersList.length > 0 && !isTravelling) {
        for (const { key } of timersList) {
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
            if (!outsideSinceRef.current.has(key)) {
              outsideSinceRef.current.set(key, now);
            }
          } else {
            outsideSinceRef.current.delete(key);
          }
        }
      } else if (isTravelling) {
        outsideSinceRef.current.clear();
      }

      // Side-effect 2: ask the pure rule engine what to do next.
      const next = nextAssistantDecision({
        now,
        enabled,
        latestPosition,
        timers: timersList,
        cachedTargets: targets as CachedTarget[],
        lastExit,
        pendingAnomalies,
        isTravelling,
        lastShownByKind: lastShownRef.current,
        outsideSinceByTimer: outsideSinceRef.current,
        firstSignalToday: firstSignalTodayRef.current,
      });

      if (!next) return;

      // Side-effect 3: last_workplace_for_day is special — once the user has
      // answered that evening prompt, we must not resurrect it again the same
      // day just because the assistant re-evaluates every 30s.
      if (
        next.kind === 'last_workplace_for_day' &&
        (hasLastWorkplacePromptBeenHandledToday() || hasWorkdayEndedToday())
      ) {
        return;
      }

      // Side-effect 4: no-op for unclassified anomalies.
      // The user explicitly rejected proactive glapp-popups, so anomaly
      // follow-up lives in explicit/manual views instead of assistant prompts.

      setDecision(next);
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
    isTravelling,
    isQuiet,
  ]);

  const acknowledge = () => {
    if (!decision) return;
    lastShownRef.current.set(decision.kind, Date.now());
    if (decision.kind === 'last_workplace_for_day') {
      markLastWorkplacePromptHandledToday();
    }
    setDecision(null);
  };

  return { decision, acknowledge };
}
