/**
 * useStaleDayReminder — lugn påminnelse om gårdagen (eller äldre) är
 * `needs_review`.
 *
 * DESIGN
 * ──────
 * Ingen spam. Kör en enda toast per kalenderdag och användare:
 *   • första app-open varje dag (efter staff är inloggad)
 *   • när 'workday-ended' fyrar (användaren just avslutade en ny dag)
 *
 * Throttling sker via localStorage-nyckeln
 *   eventflow-stale-day-reminder-shown:<staffId>:<YYYY-MM-DD>
 * så vi visar max ETT meddelande per dag/staff oavsett triggers.
 *
 * Datakälla: `mobileApi.listWorkdaysReview` — vi tittar på workdays där
 * `review_status === 'needs_review'` och `day_key < idag`. Dagar ligger
 * kvar i listan tills de approveras eller självläker (via recompute), så
 * påminnelsen försvinner automatiskt när användaren rättat dagen.
 */
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { mobileApi } from '@/services/mobileApiService';

const SHOWN_PREFIX = 'eventflow-stale-day-reminder-shown:';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function alreadyShownToday(staffId: string): boolean {
  try {
    return localStorage.getItem(SHOWN_PREFIX + staffId + ':' + todayKey()) === '1';
  } catch {
    return false;
  }
}

function markShownToday(staffId: string) {
  try {
    localStorage.setItem(SHOWN_PREFIX + staffId + ':' + todayKey(), '1');
  } catch {
    /* ignore */
  }
}

export function useStaleDayReminder(enabled: boolean, staffId: string | undefined) {
  const navigate = useNavigate();
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (!enabled || !staffId) return;
    if (alreadyShownToday(staffId)) return;
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const res = await mobileApi.listWorkdaysReview({ days: 7 });
      const today = todayKey();
      const stale = (res.workdays || []).filter(
        (wd) => wd.review_status === 'needs_review' && wd.day_key < today,
      );
      if (stale.length === 0) return;

      // Mark BEFORE showing so a re-render race can't double-fire.
      markShownToday(staffId);

      const message =
        stale.length === 1
          ? 'Gårdagen är inte avstämd än. Vill du gå igenom den nu?'
          : `${stale.length} tidigare dagar är inte avstämda. Vill du gå igenom dem nu?`;

      toast(message, {
        duration: 12_000,
        action: {
          label: 'Granska',
          onClick: () => navigate('/m/day-review'),
        },
      });
    } catch (err) {
      console.warn('[useStaleDayReminder] check failed (silent):', err);
    } finally {
      checkingRef.current = false;
    }
  }, [enabled, staffId, navigate]);

  // Trigger 1: app open / staff becomes available.
  useEffect(() => {
    if (!enabled || !staffId) return;
    // Liten delay så vi inte krockar med andra startup-toasts.
    const id = window.setTimeout(check, 4_000);
    return () => window.clearTimeout(id);
  }, [enabled, staffId, check]);

  // Trigger 2: en ny arbetsdag avslutas → kanske finns äldre kvar att stämma.
  useEffect(() => {
    if (!enabled || !staffId) return;
    const onWorkdayEnded = () => {
      // Liten delay så EOD-toasten visas först.
      window.setTimeout(check, 2_500);
    };
    window.addEventListener('workday-ended', onWorkdayEnded);
    return () => window.removeEventListener('workday-ended', onWorkdayEnded);
  }, [enabled, staffId, check]);

  // Trigger 3: focus efter att appen varit i bakgrund (täcker iOS app-resume).
  useEffect(() => {
    if (!enabled || !staffId) return;
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, staffId, check]);
}
