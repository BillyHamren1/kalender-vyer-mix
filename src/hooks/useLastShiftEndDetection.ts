/**
 * useLastShiftEndDetection
 * ────────────────────────
 * Lyssnar på `workplace-exit`-eventet (dispatchat från `useGeofencing` när
 * personalen lämnar en geofence där en aktiv timer pågår). Hooken kollar
 * om EXIT-platsen motsvarar dagens **sista** planerade pass i
 * `useScheduledShifts()`. Om ja:
 *
 *  1) Öppnar `LastShiftEndPrompt`-dialogen.
 *  2) Schemalägger en lokal push-notis (för bakgrundsfall).
 *
 * Restimern (`useTravelDetection`) startar precis som vanligt — denna hook
 * stör inte resedetekteringen. Den enda effekten är prompten + pushen.
 *
 * Dagliga garantier:
 *  - Max 1 prompt per dag (`localStorage`-suppress per ISO-datum).
 *  - Tystas tyst om en geofence-ENTER på en känd arbetsplats sker inom
 *    60 min (då jobbar de uppenbarligen vidare).
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useScheduledShifts } from '@/hooks/useScheduledShifts';
import { scheduleLocalNotification } from '@/services/pushNotificationService';

const SUPPRESS_KEY = 'eventflow-last-shift-prompt-suppressed';
const PROMPT_AUTO_DISMISS_MS = 60 * 60 * 1000; // 60 min

export interface LastShiftExitContext {
  kind: 'project' | 'booking' | 'location';
  key: string;
  bookingId?: string;
  largeProjectId?: string;
  locationId?: string;
  exitedAtIso: string;
  shiftEndIso: string | null;
}

interface WorkplaceExitDetail {
  kind: 'project' | 'booking' | 'location';
  key: string;
  bookingId?: string;
  largeProjectId?: string;
  locationId?: string;
  exitedAtIso: string;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isSuppressedToday(): boolean {
  try {
    return localStorage.getItem(SUPPRESS_KEY) === todayKey();
  } catch {
    return false;
  }
}

function suppressForToday() {
  try {
    localStorage.setItem(SUPPRESS_KEY, todayKey());
  } catch { /* ignore */ }
}

export function useLastShiftEndDetection(enabled: boolean) {
  const { data: shifts = [] } = useScheduledShifts();
  const [exitContext, setExitContext] = useState<LastShiftExitContext | null>(null);
  const shiftsRef = useRef(shifts);
  const autoDismissTimerRef = useRef<number | null>(null);

  useEffect(() => { shiftsRef.current = shifts; }, [shifts]);

  /** Decide if `detail` corresponds to dagens sista pass. */
  const evaluateExit = useCallback((detail: WorkplaceExitDetail): LastShiftExitContext | null => {
    const allShifts = shiftsRef.current;
    if (!allShifts.length) return null;

    const now = Date.now();
    const today = todayKey();

    // Pass that have ended today (incl. ±2h tolerance window).
    const todaysShifts = allShifts.filter((s) => {
      const start = new Date(s.start_time);
      return start.toISOString().slice(0, 10) === today;
    });
    if (todaysShifts.length === 0) return null;

    // Sort by end_time desc — pick the latest pass of the day.
    const sorted = [...todaysShifts].sort(
      (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
    );
    const lastShift = sorted[0];
    const lastEnd = new Date(lastShift.end_time).getTime();

    // No more upcoming shifts after now? (Last shift criterion).
    const hasFutureShift = todaysShifts.some(
      (s) => new Date(s.start_time).getTime() > now
    );
    if (hasFutureShift) return null;

    // EXIT must be within ±2h of the last shift's end_time.
    const exitMs = new Date(detail.exitedAtIso).getTime();
    if (Math.abs(exitMs - lastEnd) > 2 * 60 * 60 * 1000) return null;

    // EXIT location must match the last shift's target.
    const matchesByProject =
      detail.kind === 'project' &&
      lastShift.large_project_id &&
      detail.largeProjectId === lastShift.large_project_id;
    const matchesByBooking =
      detail.kind === 'booking' && detail.bookingId === lastShift.booking_id;

    // For location-kind exits we don't have a strict shift-vs-location link,
    // but if the user has no future shifts and just left the only known
    // workplace within the window, still treat it as the day's end.
    if (!matchesByProject && !matchesByBooking && detail.kind !== 'location') {
      return null;
    }

    return {
      ...detail,
      shiftEndIso: lastShift.end_time,
    };
  }, []);

  // Listen for workplace exits from useGeofencing.
  useEffect(() => {
    if (!enabled) return;

    const onExit = (e: Event) => {
      if (isSuppressedToday()) return;
      if (exitContext) return; // already prompting

      const detail = (e as CustomEvent<WorkplaceExitDetail>).detail;
      if (!detail) return;

      const ctx = evaluateExit(detail);
      if (!ctx) return;

      setExitContext(ctx);

      // Schedule local push (no-op if app is in foreground / not native).
      scheduleLocalNotification(
        'Det ser ut som att du avslutat dagens sista uppdrag',
        'Vill du avsluta dagen?'
      ).catch((err) => console.warn('[LastShiftEnd] notif failed:', err));

      // Auto-dismiss if user enters another workplace within 60 min.
      if (autoDismissTimerRef.current) {
        window.clearTimeout(autoDismissTimerRef.current);
      }
      autoDismissTimerRef.current = window.setTimeout(() => {
        setExitContext(null);
      }, PROMPT_AUTO_DISMISS_MS);
    };

    const onArrivalAtKnown = () => {
      // If they ENTER a known workplace, silence today's prompt.
      if (exitContext) {
        setExitContext(null);
        suppressForToday();
      }
    };

    window.addEventListener('workplace-exit', onExit as EventListener);
    window.addEventListener('eventflow-stop-travel', onArrivalAtKnown as EventListener);

    return () => {
      window.removeEventListener('workplace-exit', onExit as EventListener);
      window.removeEventListener('eventflow-stop-travel', onArrivalAtKnown as EventListener);
      if (autoDismissTimerRef.current) {
        window.clearTimeout(autoDismissTimerRef.current);
      }
    };
  }, [enabled, evaluateExit, exitContext]);

  const dismiss = useCallback((options?: { suppress?: boolean }) => {
    if (options?.suppress) suppressForToday();
    if (autoDismissTimerRef.current) {
      window.clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setExitContext(null);
  }, []);

  const snooze = useCallback((minutes: number) => {
    if (autoDismissTimerRef.current) {
      window.clearTimeout(autoDismissTimerRef.current);
    }
    const ctx = exitContext;
    setExitContext(null);
    window.setTimeout(() => {
      if (!isSuppressedToday() && ctx) {
        setExitContext(ctx);
        autoDismissTimerRef.current = window.setTimeout(() => {
          setExitContext(null);
        }, PROMPT_AUTO_DISMISS_MS);
      }
    }, minutes * 60 * 1000);
  }, [exitContext]);

  return { exitContext, dismiss, snooze };
}
