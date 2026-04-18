import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Square, Building2, MoonStar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { useWorkSession, type WorkTarget } from '@/hooks/useWorkSession';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { EndDayConfirmDialog } from './EndDayConfirmDialog';

/**
 * GlobalActiveTimerBanner
 * ------------------------
 * Architectural decision (Prompt 3): två explicita stoppvägar i UI:t.
 *
 *   • "Avsluta aktivitet" (per rad)  → useWorkSession.stopSession(target)
 *       Stänger EN signal. Dagen lever vidare. Långt pass = rastfråga.
 *
 *   • "Avsluta dagen" (global)       → useWorkSession.endDay()
 *       Iterar samtliga aktiva signaler genom samma kärnflöde, och kör
 *       därefter en end-of-day-rekonciliering mot senaste geofence-exit
 *       (anomaly skapas om användaren behöver beskriva glappet).
 *
 * Inget autorast, inget tyst stopp. Båda vägarna går genom det enhetliga
 * useWorkSession-motorn — banner-komponenten är bara UI på toppen.
 */
const GlobalActiveTimerBanner: React.FC = () => {
  const location = useLocation();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();

  const {
    activeTimers,
    stopSession,
    endDay,
    dialogs,
  } = useWorkSession(bookings, staff?.id);

  // Force re-render every second so timer rows tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Snapshot of timers for the confirm dialog (stable list during stop loop).
  const timerEntries = useMemo(
    () => Array.from(activeTimers.entries()).map(([key, timer]) => ({ key, timer })),
    [activeTimers],
  );

  const [showEndDayConfirm, setShowEndDayConfirm] = useState(false);
  const [endingDay, setEndingDay] = useState(false);

  // ───── "Avsluta aktivitet" — per timer ─────
  const handleStopActivity = async (key: string, timer: ActiveTimer) => {
    const target: WorkTarget = timer.locationId
      ? {
          kind: 'location',
          locationId: timer.locationId,
          name: timer.locationName || timer.client,
          createsTimeReport: false,
        }
      : timer.largeProjectId
        ? {
            kind: 'project',
            largeProjectId: timer.largeProjectId,
            name: timer.client,
          }
        : { kind: 'booking', bookingId: key, client: timer.client };

    try {
      const res = await stopSession(target);
      if (res.cancelled) return; // user backed out — timer stays alive
      if (res.saved) {
        if (target.kind === 'location') {
          toast.success('Aktivitet avslutad');
        } else {
          toast.success(`Tidrapport sparad: ${res.hoursWorked}h`);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte avsluta aktiviteten');
    }
  };

  // ───── "Avsluta dagen" — alla timers + EOD-rekonciliering ─────
  const handleEndDay = async () => {
    setEndingDay(true);
    try {
      const result = await endDay();
      setShowEndDayConfirm(false);

      if (result.attempted === 0 && !result.reconciliationShown) {
        toast.info('Dagen är redan stängd — inga aktiva signaler.');
        return;
      }
      if (result.failed > 0) {
        toast.error(
          `Dagen avslutad delvis: ${result.saved} sparade, ${result.failed} kvar — försök igen om en stund.`,
        );
        return;
      }
      if (result.cancelled > 0) {
        toast.warning(
          `Dagen avslutad delvis: ${result.saved} sparade, ${result.cancelled} avbrutna.`,
        );
        return;
      }
      if (result.saved > 0) {
        toast.success(`Dagen avslutad — ${result.saved} ${result.saved === 1 ? 'aktivitet' : 'aktiviteter'} sparad${result.saved === 1 ? '' : 'e'}.`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte avsluta dagen');
    } finally {
      setEndingDay(false);
    }
  };

  if (location.pathname === '/m/report') return null;

  const hasTimers = timerEntries.length > 0;

  return (
    <>
      {hasTimers && (
        <div className="px-5 pt-3 space-y-2">
          {timerEntries.map(({ key, timer }) => (
            <TimerRow
              key={key}
              timerKey={key}
              timer={timer}
              onStopActivity={handleStopActivity}
            />
          ))}

          {/* Global "Avsluta dagen" — explicit, separate from per-row stop. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEndDayConfirm(true)}
            className="w-full rounded-xl h-9 gap-1.5 text-xs font-semibold border-primary/30 hover:bg-primary/5"
          >
            <MoonStar className="w-3.5 h-3.5" />
            Avsluta dagen
          </Button>
        </div>
      )}

      <EndDayConfirmDialog
        open={showEndDayConfirm}
        onOpenChange={(o) => !endingDay && setShowEndDayConfirm(o)}
        activeTimers={timerEntries}
        submitting={endingDay}
        onConfirm={handleEndDay}
      />

      {dialogs}
    </>
  );
};

const TimerRow: React.FC<{
  timerKey: string;
  timer: ActiveTimer;
  onStopActivity: (key: string, timer: ActiveTimer) => void;
}> = ({ timerKey, timer, onStopActivity }) => {
  const elapsed = differenceInSeconds(new Date(), parseISO(timer.startTime));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const isLocation = !!timer.locationId;

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border border-primary/20 bg-primary/5">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate text-foreground flex items-center gap-1.5">
          {isLocation && <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />}
          {timer.locationName || timer.client}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Startad {format(parseISO(timer.startTime), 'HH:mm')}
          {timer.isAutoStarted && ' (auto)'}
        </p>
      </div>
      <div className="font-mono font-extrabold text-base tabular-nums text-primary">
        {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </div>
      <Button
        size="sm"
        variant="destructive"
        className="rounded-xl h-9 gap-1 text-xs font-semibold"
        onClick={() => onStopActivity(timerKey, timer)}
      >
        <Square className="w-3 h-3" />
        Avsluta aktivitet
      </Button>
    </div>
  );
};

export default GlobalActiveTimerBanner;
