/**
 * useStaleDayReminder — lugn påminnelse om ofärdig tidigare dag.
 *
 * MÅL:
 *   Om en TIDIGARE dag (gårdagen eller äldre, dvs ej idag) har
 *   `review_status === 'needs_review'`, visa en mjuk toast som länkar
 *   till `/m/day-review`. Får aldrig spamma — throttlas per (datum)
 *   via localStorage.
 *
 * TRIGGERS:
 *   1. App open / hook mount (när staff finns)
 *   2. App foreground (document visibilitychange → visible)
 *   3. Avslut av ny arbetsdag — custom event 'workday-ended' som
 *      `syncWorkDayEnd` kan skicka (eller någon annan stop-flow).
 *
 * THROTTLE:
 *   localStorage-key `eventflow-stale-day-reminder-shown` håller
 *   { dayKey, shownAtIso }. Samma dayKey påminns max var 4:e timme.
 */
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { mobileApi } from '@/services/mobileApiService';

const THROTTLE_KEY = 'eventflow-stale-day-reminder-shown';
const THROTTLE_MS = 4 * 60 * 60 * 1000; // 4 h
const TOAST_ID = 'stale-day-reminder';

type ThrottleState = { dayKey: string; shownAtIso: string } | null;

function readThrottle(): ThrottleState {
  try {
    const raw = localStorage.getItem(THROTTLE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeThrottle(dayKey: string) {
  try {
    localStorage.setItem(
      THROTTLE_KEY,
      JSON.stringify({ dayKey, shownAtIso: new Date().toISOString() }),
    );
  } catch {
    /* no-op */
  }
}

function shouldShow(dayKey: string): boolean {
  const state = readThrottle();
  if (!state) return true;
  if (state.dayKey !== dayKey) return true;
  const ageMs = Date.now() - new Date(state.shownAtIso).getTime();
  return ageMs >= THROTTLE_MS;
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const yesterdayKey = () =>
  new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

export function useStaleDayReminder(enabled: boolean) {
  const navigate = useNavigate();
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (!enabled || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const res = await mobileApi.listWorkdaysReview({ days: 7 });
      const workdays = res?.workdays || [];
      const today = todayKey();

      // Endast TIDIGARE dagar (inte idag) som fortfarande needs_review.
      const stale = workdays
        .filter(
          (w: any) =>
            w.day_key && w.day_key !== today && w.review_status === 'needs_review',
        )
        .sort((a: any, b: any) => (b.day_key || '').localeCompare(a.day_key || ''));

      if (stale.length === 0) return;

      // Visa påminnelsen för senaste ofärdiga dagen (oftast gårdagen).
      const target = stale[0];
      if (!shouldShow(target.day_key)) return;

      const isYesterday = target.day_key === yesterdayKey();
      const message = isYesterday
        ? 'Gårdagen är inte avstämd än.'
        : 'En tidigare dag är inte avstämd än.';

      writeThrottle(target.day_key);

      toast(message, {
        id: TOAST_ID,
        description: 'Vill du gå igenom den nu?',
        duration: 8000,
        action: {
          label: 'Öppna',
          onClick: () => navigate(`/m/day-review?day=${encodeURIComponent(target.day_key)}`),
        },
      });
    } catch (err) {
      console.warn('[StaleDayReminder] check failed:', err);
    } finally {
      checkingRef.current = false;
    }
  }, [enabled, navigate]);

  // 1. App open / mount
  useEffect(() => {
    if (!enabled) return;
    // Liten delay så vi inte krockar med initial auth/refresh-toasts.
    const t = window.setTimeout(() => { void check(); }, 2500);
    return () => window.clearTimeout(t);
  }, [enabled, check]);

  // 2. App foreground (visibilitychange → visible)
  useEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [enabled, check]);

  // 3. Workday ended (annat flöde stängde dagen → kolla om gårdagen ligger kvar)
  useEffect(() => {
    if (!enabled) return;
    const onEnded = () => { void check(); };
    window.addEventListener('workday-ended', onEnded);
    return () => window.removeEventListener('workday-ended', onEnded);
  }, [enabled, check]);

  return { recheck: check };
}
