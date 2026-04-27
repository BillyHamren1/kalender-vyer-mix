/**
 * useTimerStartFlow — UNIFIED START FLOW
 * ======================================
 *
 * THE ONLY sanctioned path to start an ACTIVITY timer in the mobile app.
 *
 * UNIFIED MODEL (Tidappen):
 *   1. Dagtimer (workday) = HUVUDSPÅR. Säkerställs här via ensureWorkDayActive
 *      vid första aktivitetsstart. Får också startas explicit av användaren
 *      via "Starta dagen". App-open startar ALDRIG dagen implicit.
 *   2. Aktivitetstid (projekt/plats/bokning) = INUTI dagen. Den här hooken
 *      ansvarar för aktivitetsstart — inte för att äga workday-livscykeln.
 *   3. "Avsluta dagen" = SEPARAT handling — sker via useWorkDay.end, inte här.
 *      Att stoppa en aktivitet avslutar ALDRIG dagen.
 *   4. Geofence = SIGNAL. Den här hooken är ACTION/DECISION-lagret som tar
 *      emot signaler (manuell knapp, ankomst-popup, geo arrival via
 *      tryStartFromArrival) och kör dem genom samma startkedja.
 *
 * All start sources (manual button, arrival popup, geofence arrival)
 * MUST go through `requestStart()` here. The flow is:
 *
 *   requestStart(target, label, opts?)
 *      │
 *      ├─ evaluateStartConflict(target, activeTimers)
 *      │     ├─ duplicate → no-op (silent)
 *      │     ├─ allow     → distance check (if GPS) → startSession(target)
 *      │     └─ switch    → expose conflict → caller renders TimerConflictDialog
 *      │                    → on confirm: stopSession(old) → startSession(new)
 *
 * Direct calls to `startTimer(...)` or `startSession(...)` from feature
 * code are forbidden — enforced by `timerStartUnification.contract.test.ts`.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { evaluateStartConflict, type StartEvaluation } from '@/lib/timerConcurrency';
import {
  useWorkSession,
  resolveTargetKey,
  type WorkTarget,
} from '@/hooks/useWorkSession';
import {
  useGeofencing,
  haversineDistance,
  ENTER_RADIUS,
} from '@/hooks/useGeofencing';
import { STOP_TRAVEL_EVENT, type StopTravelEventDetail } from '@/hooks/useTravelDetection';
import { useWorkDay } from '@/hooks/useWorkDay';
import type { MobileBooking } from '@/services/mobileApiService';
import { mobileApi } from '@/services/mobileApiService';
import {
  evaluateGap,
  readLastWorkSegment,
  clearLastWorkSegment,
} from '@/lib/lastWorkSegment';

/**
 * Gap-baserad restidshärledning.
 *
 * När en aktivitet startas tittar vi på det senaste stoppade
 * arbetssegmentet (lagrat av useWorkSession.stopSession). Är gapet
 * rimligt (10–180 min) anropar vi den centrala server-funktionen
 * `create_travel_from_gap`, som är idempotent och tillämpar reglerna:
 *   • <10 min   → skip (klienten filtrerar)
 *   • 10–180 min → 'work', skapas direkt
 *   • >180 min  → needs_review=true, skapas men kräver attest
 *
 * Servern dedupliceras på (staff, start, end, source='gap_derived'),
 * så även parallella anropare hamnar aldrig i dubbletter.
 *
 * Best-effort: fel loggas men blockerar aldrig start-flödet.
 */
async function maybeCreateGapTravel(
  nextStartIso: string,
  next: { targetType: 'project' | 'booking' | 'location'; targetId: string; label: string },
): Promise<void> {
  const prev = readLastWorkSegment();
  const decision = evaluateGap(nextStartIso, prev);

  if (decision.kind === 'no_previous' || decision.kind === 'cross_day') {
    return;
  }
  if (decision.kind === 'too_short') {
    console.log(`[GapTravel] gap ${decision.gapMin} min → too_short, skipping`);
    clearLastWorkSegment();
    return;
  }

  // candidate (10–180 min) ELLER needs_review (>180 min) — båda fallen
  // går till servern; servern avgör needs_review-flaggan.
  try {
    const res = await mobileApi.createTravelFromGap({
      previous_target_type: prev!.targetType,
      previous_target_id: prev!.targetId,
      previous_target_label: prev!.targetLabel,
      next_target_type: next.targetType,
      next_target_id: next.targetId,
      next_target_label: next.label,
      start_time: prev!.stoppedAtIso,
      end_time: nextStartIso,
    });
    if (res?.deduplicated) {
      console.log(`[GapTravel] gap already recorded (${decision.gapMin} min) — dedup hit`);
    } else if (res?.success) {
      console.log(
        `[GapTravel] created (${res.gap_minutes ?? decision.gapMin} min, needs_review=${res.needs_review ?? false})`,
      );
    } else if (res?.skipped) {
      console.log(`[GapTravel] server skipped: ${res.reason}`);
    }
  } catch (err: any) {
    console.warn('[GapTravel] createTravelFromGap failed (non-fatal):', err);
  } finally {
    // Rensa alltid efter ett beslut — varje gap utvärderas en gång.
    clearLastWorkSegment();
  }
}

export interface RequestStartOptions {
  /** Backdated start (e.g. arrival timestamp from popup). */
  startedAtIso?: string;
  /** Optional label for toasts / conflict dialog (defaults to target's own label). */
  label?: string;
  /** Optional task metadata persisted on the resulting time_report. */
  taskId?: string;
  taskTitle?: string;
}

interface PendingStart {
  target: WorkTarget;
  label: string;
  startedAtIso?: string;
  taskId?: string;
  taskTitle?: string;
}

interface DistanceWarning {
  placeName: string;
  distance: number;
  onConfirm: () => void;
}

export function useTimerStartFlow(
  bookings: MobileBooking[],
  staffId?: string,
) {
  const { activeTimers, userPosition } = useGeofencing(bookings, staffId);
  const { startSession, stopSession, resolveTargetCoords } = useWorkSession(
    bookings,
    staffId,
  );
  const { ensureActive: ensureWorkDayActive } = useWorkDay();

  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
  const [conflictEval, setConflictEval] = useState<
    Extract<StartEvaluation, { status: 'switch' }> | null
  >(null);
  const [distanceWarning, setDistanceWarning] =
    useState<DistanceWarning | null>(null);

  const labelFor = useCallback((target: WorkTarget): string => {
    if (target.kind === 'booking') return target.client;
    return target.name;
  }, []);

  /**
   * Actually create the timer through the unified engine.
   *
   * WORKDAY-FIRST (HARD REQUIREMENT):
   *   We ALWAYS await `ensureWorkDayActive()` before starting an activity.
   *   If the workday cannot be ensured (network/server error, no staff,
   *   etc.) the activity MUST NOT start. The workday is the primary
   *   signal — activity segments only exist on top of it. No soft-fail.
   *
   * Returns:
   *   'started'        — workday active + activity timer created
   *   'duplicate'      — same target already running (no-op)
   *   'workday-failed' — workday could not be ensured; activity NOT started
   */
  const performStart = useCallback(
    async (
      target: WorkTarget,
      opts: { startedAtIso?: string; label: string; taskId?: string; taskTitle?: string },
    ): Promise<'started' | 'duplicate' | 'workday-failed'> => {
      // Starting a new activity timer ALWAYS ends an open travel row first.
      // NOTE on the new official model: restid är primärt GAPET mellan två
      // aktiviteter (Projekt A stopp → Projekt B start). Live GPS-travel är
      // numera ett LEGACY/ASSIST-spår (se useTravelDetection). Att stänga
      // en eventuell öppen GPS-travel-rad här är fortsatt korrekt — det
      // hindrar dubbel-tid när gap-modellen ändå kommer att täcka resan.
      if (userPosition) {
        const detail: StopTravelEventDetail = {
          lat: userPosition.lat,
          lng: userPosition.lng,
          auto: true,
        };
        window.dispatchEvent(new CustomEvent(STOP_TRAVEL_EVENT, { detail }));
      }

      // WORKDAY-FIRST hard gate. Activity may not start without an active
      // workday. The server is idempotent so an already-open workday is a
      // cheap no-op; a real failure here means we genuinely have no
      // workday and must abort the activity start.
      let workday: Awaited<ReturnType<typeof ensureWorkDayActive>> = null;
      try {
        workday = await ensureWorkDayActive(opts.startedAtIso);
      } catch (err) {
        console.error('[StartFlow] ensureWorkDayActive threw:', err);
        workday = null;
      }
      if (!workday) {
        toast.error(
          'Kunde inte starta arbetsdagen. Försök igen — aktiviteten startades inte.',
        );
        return 'workday-failed';
      }

      const ok = startSession(target, {
        startedAtIso: opts.startedAtIso,
        taskId: opts.taskId,
        taskTitle: opts.taskTitle,
      });
      if (ok) {
        toast.success(`Timer startad: ${opts.label}`);
        // Gap-baserad restid: härleds från senaste stoppade arbetssegment
        // (se src/lib/lastWorkSegment.ts). Bästa-effort, fire-and-forget.
        const startIso = opts.startedAtIso ?? new Date().toISOString();
        const nextTargetId =
          target.kind === 'booking'
            ? target.bookingId
            : target.kind === 'project'
              ? target.largeProjectId
              : target.locationId;
        void maybeCreateGapTravel(startIso, {
          targetType: target.kind,
          targetId: nextTargetId,
          label: opts.label,
        });
        return 'started';
      }
      toast.message('Timer redan aktiv för platsen');
      return 'duplicate';
    },
    [startSession, userPosition, ensureWorkDayActive],
  );

  const checkDistanceAndStart = useCallback(
    (target: WorkTarget, opts: { startedAtIso?: string; label: string; taskId?: string; taskTitle?: string }) => {
      const coords = resolveTargetCoords(target);
      const doStart = () => { void performStart(target, opts); };
      if (!userPosition || !coords) {
        doStart();
        return;
      }
      const dist = haversineDistance(
        userPosition.lat,
        userPosition.lng,
        coords.lat,
        coords.lng,
      );
      if (dist > ENTER_RADIUS) {
        setDistanceWarning({
          placeName: coords.label || opts.label,
          distance: dist,
          onConfirm: doStart,
        });
      } else {
        doStart();
      }
    },
    [resolveTargetCoords, userPosition, performStart],
  );

  /**
   * Public entry-point. Returns one of:
   *   • 'started'    — timer was created (or distance dialog opened first)
   *   • 'duplicate'  — same target already running, nothing to do
   *   • 'conflict'   — TimerConflictDialog will be shown; resolution is async
   */
  const requestStart = useCallback(
    (
      target: WorkTarget,
      opts: RequestStartOptions = {},
    ): 'started' | 'duplicate' | 'conflict' => {
      const label = opts.label ?? labelFor(target);
      const evalResult = evaluateStartConflict(target, activeTimers);

      if (evalResult.status === 'duplicate') return 'duplicate';

      if (evalResult.status === 'allow') {
        checkDistanceAndStart(target, {
          startedAtIso: opts.startedAtIso,
          label,
          taskId: opts.taskId,
          taskTitle: opts.taskTitle,
        });
        return 'started';
      }

      // switch — defer until user confirms in TimerConflictDialog
      setPendingStart({
        target,
        label,
        startedAtIso: opts.startedAtIso,
        taskId: opts.taskId,
        taskTitle: opts.taskTitle,
      });
      setConflictEval(evalResult);
      return 'conflict';
    },
    [activeTimers, labelFor, checkDistanceAndStart],
  );

  const cancelConflict = useCallback(() => {
    setPendingStart(null);
    setConflictEval(null);
  }, []);

  /**
   * User picked "Stoppa & byt". Stop the conflicting timer through the
   * unified engine (same break-prompt + save-then-stop rules), then start
   * the new one.
   */
  const confirmSwitch = useCallback(async () => {
    if (!pendingStart || !conflictEval) return;
    const { target, label, startedAtIso, taskId, taskTitle } = pendingStart;
    const { conflict } = conflictEval;
    setPendingStart(null);
    setConflictEval(null);

    const existing = activeTimers.get(conflict.key);
    if (!existing) {
      checkDistanceAndStart(target, { startedAtIso, label, taskId, taskTitle });
      return;
    }

    const stopTarget: WorkTarget = existing.locationId
      ? {
          kind: 'location',
          locationId: existing.locationId,
          name: existing.locationName || existing.client,
        }
      : existing.largeProjectId
        ? {
            kind: 'project',
            largeProjectId: existing.largeProjectId,
            name: existing.client,
          }
        : { kind: 'booking', bookingId: conflict.key, client: existing.client };

    try {
      const res = await stopSession(stopTarget);
      if (res.cancelled) return;
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte stoppa pågående timer');
      return;
    }
    checkDistanceAndStart(target, { startedAtIso, label, taskId, taskTitle });
  }, [
    pendingStart,
    conflictEval,
    activeTimers,
    stopSession,
    checkDistanceAndStart,
  ]);

  /** True if this exact target already has a running timer. */
  const isActive = useCallback(
    (target: WorkTarget) => activeTimers.has(resolveTargetKey(target)),
    [activeTimers],
  );

  /**
   * Awaitable start used by the arrival-prompt confirm flow.
   *
   * Unlike `requestStart`, this resolves with the *actual* outcome of the
   * start chain (workday-ensure + activity start). The arrival prompt is a
   * helper — it must only be marked as resolved if the real start succeeded.
   *
   * - Skips the distance dialog (user has just confirmed they arrived).
   * - Treats a target-conflict as a "deferred" outcome so the caller can
   *   keep the prompt open until the conflict dialog resolves.
   *
   * Returns:
   *   'started'        — workday + activity started successfully
   *   'duplicate'      — same target already running (treat as success for arrival)
   *   'workday-failed' — workday could not be ensured; activity NOT started
   *   'conflict'       — conflict dialog opened; resolution is async
   */
  const tryStartFromArrival = useCallback(
    async (
      target: WorkTarget,
      opts: RequestStartOptions = {},
    ): Promise<'started' | 'duplicate' | 'workday-failed' | 'conflict'> => {
      const label = opts.label ?? labelFor(target);
      const evalResult = evaluateStartConflict(target, activeTimers);

      if (evalResult.status === 'duplicate') return 'duplicate';

      if (evalResult.status === 'switch') {
        // Defer to TimerConflictDialog; arrival caller must NOT mark resolved.
        setPendingStart({
          target,
          label,
          startedAtIso: opts.startedAtIso,
          taskId: opts.taskId,
          taskTitle: opts.taskTitle,
        });
        setConflictEval(evalResult);
        return 'conflict';
      }

      // allow → run the real start chain and surface its outcome.
      return performStart(target, {
        startedAtIso: opts.startedAtIso,
        label,
        taskId: opts.taskId,
        taskTitle: opts.taskTitle,
      });
    },
    [activeTimers, labelFor, performStart],
  );

  return {
    requestStart,
    tryStartFromArrival,
    cancelConflict,
    confirmSwitch,
    conflictEval,
    pendingLabel: pendingStart?.label ?? '',
    distanceWarning,
    dismissDistanceWarning: () => setDistanceWarning(null),
    isActive,
    activeTimers,
  };
}
