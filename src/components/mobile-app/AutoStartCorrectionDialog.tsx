// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
/**
 * AutoStartCorrectionDialog — easy corrections for auto-started timers.
 *
 * Surfaces the four explicit actions required by the auto-arrival
 * correction policy (prompt 6):
 *
 *   1. "Detta var inte arbete"  → reject (workday_flag + assistant_event,
 *      raw GPS preserved, timer cancelled / time_report rejected).
 *   2. "Byt projekt/plats"      → navigate to job picker.
 *   3. "Justera starttid"       → audit-only flag for admin follow-up.
 *      (We do not silently mutate a running server entry — the flag
 *      lets admin apply the correction on the time_report.)
 *   4. "Stoppa från annan tid"  → stopSession with custom stopAtIso.
 *
 * All actions emit an audit `assistant_event` with metadata
 * `source='auto_arrival_user_correction'` and the chosen `correction_kind`
 * so admin can see the rejection / adjustment in history.
 */
import React, { useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import type { WorkTarget } from '@/hooks/useWorkSession';
import { useWorkSession } from '@/hooks/useWorkSession';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export interface AutoStartCorrectionContext {
  kind: 'location' | 'project' | 'booking';
  targetId: string;
  label: string;
  arrivedAtIso: string;
  workTarget?: WorkTarget;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: AutoStartCorrectionContext | null;
}

type Mode = 'menu' | 'adjust_start' | 'stop_at';

export const AutoStartCorrectionDialog: React.FC<Props> = ({ open, onOpenChange, context }) => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { stopSession } = useWorkSession(bookings, staff?.id);
  const [mode, setMode] = useState<Mode>('menu');
  const [pickedTime, setPickedTime] = useState<string>(''); // HH:mm
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!open) {
      setMode('menu');
      setPickedTime('');
      setBusy(false);
    } else if (context) {
      try { setPickedTime(format(parseISO(context.arrivedAtIso), 'HH:mm')); } catch {}
    }
  }, [open, context]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const audit = useCallback(async (correctionKind: string, extra: Record<string, unknown> = {}) => {
    if (!context) return;
    await mobileApi.assistantEvents.create({
      event_type: 'arrival',
      target_type: context.kind,
      target_id: context.targetId,
      target_label: context.label,
      happened_at: context.arrivedAtIso,
      source: 'geofence',
      suggested_action: `correction_${correctionKind}`,
      metadata: {
        source: 'auto_arrival_user_correction',
        correction_kind: correctionKind,
        original_arrival_at: context.arrivedAtIso,
        ...extra,
      },
    }).catch(() => {});
  }, [context]);

  // 1. Reject — "Detta var inte arbete"
  const handleNotWork = useCallback(async () => {
    if (!context) return;
    setBusy(true);
    try {
      await mobileApi.createWorkdayFlag({
        flag_type: 'geofence_presence_mismatch',
        flag_date: context.arrivedAtIso.slice(0, 10),
        title: `Felaktig auto-start avvisad: ${context.label}`,
        description: 'Användaren markerade auto-startad arrival som "inte arbete". Råa GPS-pings sparas; markera tidrapport/timer som rejected.',
        severity: 'warning',
        needs_user_input: false,
        related_booking_id: context.kind === 'booking' ? context.targetId : undefined,
        related_large_project_id: context.kind === 'project' ? context.targetId : undefined,
        related_location_id: context.kind === 'location' ? context.targetId : undefined,
        context: { source: 'auto_arrival_user_rejected', arrived_at: context.arrivedAtIso },
      });
      await audit('rejected_not_work', { resolution_status: 'rejected_by_user' });
      if (context.workTarget) {
        await stopSession(context.workTarget, { discard: true } as any).catch(() => {});
      }
      toast.message('Auto-start avvisad — sparas i historik som "inte arbete"');
      close();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte avvisa auto-start');
    } finally {
      setBusy(false);
    }
  }, [context, audit, stopSession, close]);

  // 2. Switch
  const handleSwitch = useCallback(async () => {
    await audit('switch_target');
    navigate('/m/jobs');
    close();
  }, [audit, navigate, close]);

  // 3. Adjust start — audit-flag (admin applies it on the time_report).
  const handleAdjustStart = useCallback(async () => {
    if (!context || !pickedTime) return;
    setBusy(true);
    try {
      const date = context.arrivedAtIso.slice(0, 10);
      const newIso = new Date(`${date}T${pickedTime}:00`).toISOString();
      await mobileApi.createWorkdayFlag({
        flag_type: 'unclear_start_target',
        flag_date: date,
        title: `Justera auto-start: ${context.label}`,
        description: `Användaren begär att starttiden flyttas från ${format(parseISO(context.arrivedAtIso), 'HH:mm')} till ${pickedTime}.`,
        severity: 'info',
        needs_user_input: true,
        related_booking_id: context.kind === 'booking' ? context.targetId : undefined,
        related_large_project_id: context.kind === 'project' ? context.targetId : undefined,
        related_location_id: context.kind === 'location' ? context.targetId : undefined,
        context: {
          source: 'auto_arrival_user_correction',
          requested_start_at: newIso,
          original_arrival_at: context.arrivedAtIso,
        },
      });
      await audit('adjust_start_time', { requested_start_at: newIso });
      toast.success(`Önskad starttid registrerad: ${pickedTime}`);
      close();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte registrera ändring');
    } finally {
      setBusy(false);
    }
  }, [context, pickedTime, audit, close]);

  // 4. Stop at custom time — stopSession with stopAtIso.
  const handleStopAt = useCallback(async () => {
    if (!context || !context.workTarget || !pickedTime) return;
    setBusy(true);
    try {
      const date = context.arrivedAtIso.slice(0, 10);
      const stopIso = new Date(`${date}T${pickedTime}:00`).toISOString();
      const res = await stopSession(context.workTarget, { stopAtIso: stopIso });
      if (res?.cancelled) {
        toast.message('Avbruten');
      } else if (res?.saved) {
        await audit('stop_at_custom_time', { stop_at: stopIso });
        toast.success(`Stoppad ${pickedTime}`);
      } else {
        toast.error('Kunde inte stoppa timern');
      }
      close();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte stoppa');
    } finally {
      setBusy(false);
    }
  }, [context, pickedTime, audit, stopSession, close]);

  if (!context) return null;

  const arrivalHHmm = (() => {
    try { return format(parseISO(context.arrivedAtIso), 'HH:mm'); } catch { return ''; }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Korrigera auto-start</DialogTitle>
          <DialogDescription>
            Auto-startad {arrivalHHmm} på <span className="font-medium">{context.label}</span>
          </DialogDescription>
        </DialogHeader>

        {mode === 'menu' && (
          <div className="grid gap-2 py-2">
            <Button variant="outline" disabled={busy} onClick={handleNotWork}>
              Detta var inte arbete
            </Button>
            <Button variant="outline" disabled={busy} onClick={handleSwitch}>
              Byt projekt/plats
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setMode('adjust_start')}>
              Justera starttid
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setMode('stop_at')}>
              Stoppa från annan tid
            </Button>
          </div>
        )}

        {(mode === 'adjust_start' || mode === 'stop_at') && (
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="auto-correction-time">
                {mode === 'adjust_start' ? 'Ny starttid' : 'Sluttid'}
              </Label>
              <Input
                id="auto-correction-time"
                type="time"
                value={pickedTime}
                onChange={(e) => setPickedTime(e.target.value)}
                disabled={busy}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setMode('menu')}>
                Tillbaka
              </Button>
              <Button
                disabled={busy || !pickedTime}
                onClick={mode === 'adjust_start' ? handleAdjustStart : handleStopAt}
              >
                {mode === 'adjust_start' ? 'Spara ändring' : 'Stoppa'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AutoStartCorrectionDialog;
