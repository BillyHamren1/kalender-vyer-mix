/**
 * useStaleDayCorrection
 * ─────────────────────
 * Picks up `auto_closed_*` workday_flags written by the nightly cron and
 * surfaces them in StaleDayCorrectionDialog so the staff member can
 * confirm or correct the actual end-of-day time.
 *
 * Polls on focus + every 60s; subscribes via realtime when available.
 */
import { useCallback, useEffect, useState } from 'react';
import { mobileApi, type WorkdayFlag } from '@/services/mobileApiService';
import { toast } from 'sonner';

const AUTO_CLOSED_KINDS = new Set([
  'auto_closed_overnight',
  'auto_closed_travel',
  'auto_closed_report',
]);

export interface StaleDayContext {
  flag: WorkdayFlag;
  provisionalEndIso: string;
  suggestions: Array<{
    kind: 'left_workplace' | 'stopped_en_route' | 'arrived_home';
    label: string;
    time_iso: string;
  }>;
}

export function useStaleDayCorrection(enabled: boolean) {
  const [pending, setPending] = useState<StaleDayContext | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await mobileApi.listWorkdayFlags({ resolved: false });
      const candidate = (res.flags || []).find(
        (f) => AUTO_CLOSED_KINDS.has(f.flag_type) && f.needs_user_input,
      );
      if (!candidate) {
        setPending(null);
        return;
      }
      const ctx: any = candidate.context || {};
      setPending({
        flag: candidate,
        provisionalEndIso: ctx.provisional_end_iso || new Date().toISOString(),
        suggestions: Array.isArray(ctx.suggested_end_times) ? ctx.suggested_end_times : [],
      });
    } catch (err) {
      console.warn('[useStaleDayCorrection] refresh failed', err);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return;
    const id = window.setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, refresh]);

  const confirm = useCallback(
    async (chosenEndIso: string) => {
      if (!pending) return;
      setSubmitting(true);
      try {
        await mobileApi.correctStaleDayEnd({
          flag_id: pending.flag.id,
          chosen_end_iso: chosenEndIso,
        });
        toast.success('Tack — sluttiden uppdaterad.');
        setPending(null);
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte uppdatera sluttid');
      } finally {
        setSubmitting(false);
      }
    },
    [pending],
  );

  const dismiss = useCallback(() => {
    setPending(null);
  }, []);

  return { pending, submitting, confirm, dismiss, refresh };
}
