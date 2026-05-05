/**
 * AutoArrivalNotice — icke-blockerande banner som visas när systemet
 * automatiskt har startat workday + activity-timer från geofence-arrival.
 *
 * Lyssnar på CustomEvent('auto-arrival-started') från MobileGlobalOverlays
 * och visar:
 *   "Arbetsdag och timer startades 08:01 från Workman Event AB"
 *
 * Actions:
 *   - Ändra              → öppnar tidredigering
 *   - Detta var inte arbete → skapar workday_flag och stoppar timer (cancel)
 *   - Byt projekt/plats  → går till /m/jobs
 *   - Stoppa             → triggar end-day via existerande EOD-flöde
 *   - Stäng              → bara dölj notisen (auto-fade efter 30s)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { WorkTarget } from '@/hooks/useWorkSession';
import { AutoStartCorrectionDialog, type AutoStartCorrectionContext } from './AutoStartCorrectionDialog';

interface NoticeState {
  kind: 'location' | 'project' | 'booking';
  targetId: string;
  label: string;
  arrivedAtIso: string;
  workTarget?: WorkTarget;
  workdayOnly?: boolean;
  /** False when staff is not assigned for today → show "Oplanerad aktivitet"-badge. */
  isPlannedToday?: boolean;
}

const AUTO_HIDE_MS = 45_000;

export const AutoArrivalNotice: React.FC = () => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { stopSession } = useWorkSession(bookings, staff?.id);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    const onStarted = (e: Event) => {
      const detail = (e as CustomEvent).detail as NoticeState;
      setNotice({ ...detail, workdayOnly: false });
    };
    const onWorkdayOnly = (e: Event) => {
      const detail = (e as CustomEvent).detail as NoticeState;
      setNotice({ ...detail, workdayOnly: true });
    };
    window.addEventListener('auto-arrival-started', onStarted);
    window.addEventListener('auto-arrival-workday-only', onWorkdayOnly);
    return () => {
      window.removeEventListener('auto-arrival-started', onStarted);
      window.removeEventListener('auto-arrival-workday-only', onWorkdayOnly);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [notice]);

  const arrivalHHmm = notice
    ? (() => { try { return format(parseISO(notice.arrivedAtIso), 'HH:mm'); } catch { return ''; } })()
    : '';

  const dismiss = useCallback(() => setNotice(null), []);

  const handleNotWork = useCallback(async () => {
    if (!notice) return;
    try {
      // Flagga som review och stoppa timern utan time_report.
      await mobileApi.createWorkdayFlag({
        flag_type: 'geofence_presence_mismatch',
        flag_date: notice.arrivedAtIso.slice(0, 10),
        title: `Felaktig auto-start: ${notice.label}`,
        description: 'Användaren markerade auto-startad arrival som "inte arbete".',
        severity: 'warning',
        needs_user_input: false,
        related_booking_id: notice.kind === 'booking' ? notice.targetId : undefined,
        related_large_project_id: notice.kind === 'project' ? notice.targetId : undefined,
        related_location_id: notice.kind === 'location' ? notice.targetId : undefined,
        context: { source: 'auto_arrival_user_rejected', arrived_at: notice.arrivedAtIso },
      });
      if (notice.workTarget) {
        await stopSession(notice.workTarget, { discard: true } as any).catch(() => {});
      }
      toast.message('Auto-start ångrad — markerad för granskning');
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte ångra auto-start');
    } finally {
      setNotice(null);
    }
  }, [notice, stopSession]);

  const handleStop = useCallback(() => {
    window.dispatchEvent(new CustomEvent('request-end-day'));
    setNotice(null);
  }, []);

  const handleSwitch = useCallback(() => {
    navigate('/m/jobs');
    setNotice(null);
  }, [navigate]);

  const handleEdit = useCallback(() => {
    navigate('/m/time-report');
    setNotice(null);
  }, [navigate]);

  if (!notice) return null;

  return (
    <div className="sticky top-0 z-40 px-2 pt-2">
      <Card className="border-primary/40 bg-primary/5 p-3 shadow-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {notice.workdayOnly
                ? `Arbetsdag startad ${arrivalHHmm} från ${notice.label}`
                : `Arbetsdag och timer startades ${arrivalHHmm} från ${notice.label}`}
            </p>
            {notice.isPlannedToday === false && (
              <span className="mt-1 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Oplanerad aktivitet – auto-startad från GPS
              </span>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              Auto-startat från GPS. Ändra om något är fel.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleEdit}>Ändra</Button>
              <Button size="sm" variant="outline" onClick={handleSwitch}>Byt projekt/plats</Button>
              <Button size="sm" variant="ghost" onClick={handleNotWork}>Inte arbete</Button>
              <Button size="sm" variant="ghost" onClick={handleStop}>Stoppa</Button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Stäng notis"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>
  );
};

export default AutoArrivalNotice;
