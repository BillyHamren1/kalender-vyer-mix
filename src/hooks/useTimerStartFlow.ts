/**
 * useTimerStartFlow — UNIFIED START FLOW
 * ======================================
 *
 * THE ONLY sanctioned path to start a timer in the mobile app.
 *
 * All start sources (manual button, arrival popup, future geo-prompt acks)
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

export interface RequestStartOptions {
  /** Backdated start (e.g. arrival timestamp from popup). */
  startedAtIso?: string;
  /** Optional label for toasts / conflict dialog (defaults to target's own label). */
  label?: string;
}

interface PendingStart {
  target: WorkTarget;
  label: string;
  startedAtIso?: string;
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
      opts: { startedAtIso?: string; label: string },
    ): Promise<'started' | 'duplicate' | 'workday-failed'> => {
      // Starting a new activity timer ALWAYS ends an open travel row first.
      // This is one of the two sanctioned auto-stop triggers (the other is
      // geofence ENTER on a known place). Speed alone never stops travel.
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

      const ok = startSession(target, { startedAtIso: opts.startedAtIso });
      if (ok) {
        toast.success(`Timer startad: ${opts.label}`);
        return 'started';
      }
      toast.message('Timer redan aktiv för platsen');
      return 'duplicate';
    },
    [startSession, userPosition, ensureWorkDayActive],
  );

  const checkDistanceAndStart = useCallback(
    (target: WorkTarget, opts: { startedAtIso?: string; label: string }) => {
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
        checkDistanceAndStart(target, { startedAtIso: opts.startedAtIso, label });
        return 'started';
      }

      // switch — defer until user confirms in TimerConflictDialog
      setPendingStart({ target, label, startedAtIso: opts.startedAtIso });
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
    const { target, label, startedAtIso } = pendingStart;
    const { conflict } = conflictEval;
    setPendingStart(null);
    setConflictEval(null);

    const existing = activeTimers.get(conflict.key);
    if (!existing) {
      checkDistanceAndStart(target, { startedAtIso, label });
      return;
    }

    const stopTarget: WorkTarget = existing.locationId
      ? {
          kind: 'location',
          locationId: existing.locationId,
          name: existing.locationName || existing.client,
          createsTimeReport: false,
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
    checkDistanceAndStart(target, { startedAtIso, label });
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

  return {
    requestStart,
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
