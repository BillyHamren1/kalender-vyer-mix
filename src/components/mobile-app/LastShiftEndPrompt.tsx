/**
 * LastShiftEndPrompt
 * ──────────────────
 * Visas när `useLastShiftEndDetection` har detekterat att personalen just
 * lämnat dagens sista planerade pass. Tre val:
 *
 *  1. Ja, avsluta dagen        → stoppar restimer + triggar EOD-flödet.
 *  2. Nej, jag jobbar vidare   → tystar prompten resten av dagen.
 *  3. Påminn senare (15 min)   → snooze.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Clock, Check, Bell, X } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { STOP_TRAVEL_EVENT, type StopTravelEventDetail } from '@/hooks/useTravelDetection';
import type { LastShiftExitContext } from '@/hooks/useLastShiftEndDetection';
import type { GpsPosition } from '@/hooks/useGeofencing';
import { toast } from 'sonner';

interface LastShiftEndPromptProps {
  context: LastShiftExitContext;
  latestPosition: GpsPosition | null;
  onDismiss: (opts?: { suppress?: boolean }) => void;
  onSnooze: (minutes: number) => void;
}

export default function LastShiftEndPrompt({
  context,
  latestPosition,
  onDismiss,
  onSnooze,
}: LastShiftEndPromptProps) {
  const [busy, setBusy] = useState<'end' | 'continue' | 'snooze' | null>(null);

  const exitedAt = new Date(context.exitedAtIso);
  const shiftEnd = context.shiftEndIso ? new Date(context.shiftEndIso) : null;

  const handleEndDay = async () => {
    setBusy('end');
    try {
      // 1. Stop the travel timer (classified as personal/unclassified — auto path).
      if (latestPosition) {
        const detail: StopTravelEventDetail = {
          lat: latestPosition.lat,
          lng: latestPosition.lng,
          auto: true,
        };
        window.dispatchEvent(new CustomEvent(STOP_TRAVEL_EVENT, { detail }));
      }

      // 2. Trigger the existing global EOD pipeline.
      window.dispatchEvent(new CustomEvent('request-end-day'));

      // 3. Log a workday flag (informational) — uses the closest existing
      // flag_type vocabulary entry. Title/description carry the specifics.
      try {
        await mobileApi.createWorkdayFlag({
          flag_type: 'unclear_day_end',
          flag_date: format(new Date(), 'yyyy-MM-dd'),
          title: 'Dagen avslutad efter sista pass',
          description:
            `Personalen bekräftade slutet av dagen vid avgång från sista planerade pass${
              shiftEnd ? ` (planerat slut ${format(shiftEnd, 'HH:mm')})` : ''
            }.`,
          severity: 'info',
          needs_user_input: false,
          assistant_decision_kind: 'ended_after_last_shift',
          related_booking_id: context.bookingId,
          related_large_project_id: context.largeProjectId,
          related_location_id: context.locationId,
          context: {
            exited_at: context.exitedAtIso,
            shift_end: context.shiftEndIso,
            kind: context.kind,
          },
        });
      } catch (err) {
        // Flag is best-effort; the EOD itself has already been triggered.
        console.warn('[LastShiftEnd] flag write failed:', err);
      }

      toast.success('Dagen avslutas');
      onDismiss({ suppress: true });
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte avsluta dagen');
      setBusy(null);
    }
  };

  const handleContinue = () => {
    setBusy('continue');
    onDismiss({ suppress: true });
  };

  const handleSnooze = () => {
    setBusy('snooze');
    onSnooze(15);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avsluta dagen?</DialogTitle>
          <DialogDescription>
            Du lämnade dagens sista planerade uppdrag kl{' '}
            <strong>{format(exitedAt, 'HH:mm', { locale: sv })}</strong>
            {shiftEnd && (
              <>
                {' '}(planerat slut {format(shiftEnd, 'HH:mm', { locale: sv })})
              </>
            )}
            . Restimer har startat — vill du avsluta arbetsdagen?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Clock className="mr-2 inline h-4 w-4" />
          Om du svarar <strong>Ja</strong> stoppas restimern och dagens
          aktiva timers stängs.
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={handleEndDay}
            disabled={!!busy}
            className="w-full"
          >
            <Check className="mr-2 h-4 w-4" />
            {busy === 'end' ? 'Avslutar…' : 'Ja, avsluta dagen'}
          </Button>
          <Button
            onClick={handleContinue}
            variant="outline"
            disabled={!!busy}
            className="w-full"
          >
            <X className="mr-2 h-4 w-4" />
            Nej, jag jobbar vidare
          </Button>
          <Button
            onClick={handleSnooze}
            variant="ghost"
            disabled={!!busy}
            className="w-full"
          >
            <Bell className="mr-2 h-4 w-4" />
            Påminn mig om 15 min
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
