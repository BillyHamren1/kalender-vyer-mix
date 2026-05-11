/**
 * EndDayButton — single in-line "Avsluta dag"-knapp för Time-appens
 * personalvy. Används både i TodayTab och i StaffDayDetailSheet (när
 * dagens datum är öppet).
 *
 * Hård regel:
 *   - Använder ENDAST `mobileApi.stopTimeRegistration` (Time Engine v2).
 *   - Får inte blockeras av GPS/geofence/aktivitet/sync-state. Endast
 *     loading-state under request.
 *   - Backend (`stop_time_registration`) skapar suppression när
 *     stop_source = 'user_manual' så geofence-motorn inte auto-startar
 *     direkt igen samma dag.
 */
import React, { useState } from 'react';
import { Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { mobileApi } from '@/services/mobileApiService';
import { useActiveTimerStatus } from '@/hooks/useActiveTimerStatus';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

interface Props {
  /** Sannolikhet att en arbetsdag är öppen — styrs av snapshot.workday.isOpen. */
  workdayOpen: boolean;
  /** Anropas efter lyckat stopp (för att refresha snapshot). */
  onStopped?: () => void;
  /** Visuell variant. */
  size?: 'lg' | 'md';
  className?: string;
}

export const EndDayButton: React.FC<Props> = ({
  workdayOpen, onStopped, size = 'lg', className,
}) => {
  const { staff } = useMobileAuth();
  const { data: timer } = useActiveTimerStatus(!!staff);
  const [stopping, setStopping] = useState(false);

  if (!workdayOpen) return null;

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const res = await mobileApi.stopTimeRegistration({
        registration_id: timer.timerId ?? undefined,
        stop_source: 'user_manual',
      });
      if (res?.success === false) {
        toast.error('Kunde inte avsluta arbetsdagen. Försök igen.');
        return;
      }
      toast.success('Arbetsdagen avslutad');
      try {
        window.dispatchEvent(new Event('timer-state-changed'));
        window.dispatchEvent(new Event('workday-ended'));
      } catch { /* ignore */ }
      onStopped?.();
    } catch (err) {
      console.warn('[EndDayButton] stopTimeRegistration failed:', err);
      toast.error('Kunde inte avsluta arbetsdagen. Försök igen.');
    } finally {
      setStopping(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleStop}
      disabled={stopping}
      className={cn(
        'w-full rounded-2xl bg-destructive text-destructive-foreground',
        'flex items-center justify-center gap-2 font-extrabold',
        'active:opacity-80 transition-opacity disabled:opacity-60',
        size === 'lg' ? 'py-3.5 text-sm' : 'py-2.5 text-[13px]',
        className,
      )}
    >
      {stopping ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Avslutar…
        </>
      ) : (
        <>
          <Square className="w-4 h-4 fill-current" />
          Avsluta dag
        </>
      )}
    </button>
  );
};

export default EndDayButton;
