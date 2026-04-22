import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Clock, Check, Bell, X } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { STOP_TRAVEL_EVENT, type StopTravelEventDetail } from '@/hooks/useTravelDetection';
import type { LastShiftExitContext } from '@/hooks/useLastShiftEndDetection';
import type { GpsPosition } from '@/hooks/useGeofencing';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

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
  const { t } = useLanguage();
  const [busy, setBusy] = useState<'end' | 'continue' | 'snooze' | null>(null);

  const exitedAt = new Date(context.exitedAtIso);
  const shiftEnd = context.shiftEndIso ? new Date(context.shiftEndIso) : null;

  const handleEndDay = async () => {
    setBusy('end');
    try {
      if (latestPosition) {
        const detail: StopTravelEventDetail = {
          lat: latestPosition.lat,
          lng: latestPosition.lng,
          auto: true,
        };
        window.dispatchEvent(new CustomEvent(STOP_TRAVEL_EVENT, { detail }));
      }

      window.dispatchEvent(new CustomEvent('request-end-day'));

      try {
        await mobileApi.createWorkdayFlag({
          flag_type: 'unclear_day_end',
          flag_date: format(new Date(), 'yyyy-MM-dd'),
          title: 'Day ended after last shift',
          description:
            `Staff confirmed end of day at exit from last planned shift${
              shiftEnd ? ` (planned end ${format(shiftEnd, 'HH:mm')})` : ''
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
        console.warn('[LastShiftEnd] flag write failed:', err);
      }

      toast.success(t('lastShift.endingDay'));
      onDismiss({ suppress: true });
    } catch (err: any) {
      toast.error(err?.message || t('lastShift.couldNotEnd'));
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
          <DialogTitle>{t('lastShift.title')}</DialogTitle>
          <DialogDescription>
            {t('lastShift.body', { time: format(exitedAt, 'HH:mm') })}
            {shiftEnd && ' '}
            {shiftEnd && t('lastShift.plannedEnd', { time: format(shiftEnd, 'HH:mm') })}
            {t('lastShift.tail')}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Clock className="mr-2 inline h-4 w-4" />
          {t('lastShift.note')}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button onClick={handleEndDay} disabled={!!busy} className="w-full">
            <Check className="mr-2 h-4 w-4" />
            {busy === 'end' ? t('lastShift.ending') : t('lastShift.yesEnd')}
          </Button>
          <Button onClick={handleContinue} variant="outline" disabled={!!busy} className="w-full">
            <X className="mr-2 h-4 w-4" />
            {t('lastShift.noKeep')}
          </Button>
          <Button onClick={handleSnooze} variant="ghost" disabled={!!busy} className="w-full">
            <Bell className="mr-2 h-4 w-4" />
            {t('lastShift.snooze')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
