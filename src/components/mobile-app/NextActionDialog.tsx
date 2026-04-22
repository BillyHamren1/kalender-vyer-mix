import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Car, Coffee, Home, Loader2 } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

export type NextAction = 'travel' | 'break' | 'end-day';

interface NextActionDialogProps {
  open: boolean;
  closedActivityName: string;
  onOpenChange: (open: boolean) => void;
  onResolved?: (action: NextAction) => void;
}

export const NextActionDialog: React.FC<NextActionDialogProps> = ({
  open,
  closedActivityName,
  onOpenChange,
  onResolved,
}) => {
  const { t } = useLanguage();
  const [busy, setBusy] = useState<NextAction | null>(null);

  const getCurrentPosition = (): Promise<GeolocationPosition | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    });

  const handleTravel = async () => {
    setBusy('travel');
    try {
      const pos = await getCurrentPosition();
      await mobileApi.createTravelLog({
        from_latitude: pos?.coords.latitude,
        from_longitude: pos?.coords.longitude,
        auto_detected: false,
        description: t('next.travelDescFrom', { place: closedActivityName }),
      });
      toast.success(t('next.travelStarted'));
      onResolved?.('travel');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || t('next.travelStartFail'));
    } finally {
      setBusy(null);
    }
  };

  const handleBreak = () => {
    setBusy('break');
    toast.success(t('next.breakRegistered'));
    onResolved?.('break');
    onOpenChange(false);
    setBusy(null);
  };

  const handleEndDay = () => {
    setBusy('end-day');
    window.dispatchEvent(new CustomEvent('request-end-day'));
    onResolved?.('end-day');
    onOpenChange(false);
    setBusy(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('next.title')}</DialogTitle>
          <DialogDescription>
            {t('next.body', { activity: closedActivityName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-2">
          <Button
            variant="default"
            className="w-full justify-start gap-3 h-12"
            onClick={handleTravel}
            disabled={!!busy}
          >
            {busy === 'travel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />}
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">{t('next.travel')}</div>
              <div className="text-[11px] opacity-80">{t('next.travelDesc')}</div>
            </div>
          </Button>

          <Button
            variant="secondary"
            className="w-full justify-start gap-3 h-12"
            onClick={handleBreak}
            disabled={!!busy}
          >
            {busy === 'break' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coffee className="w-4 h-4" />}
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">{t('next.break')}</div>
              <div className="text-[11px] opacity-80">{t('next.breakDesc')}</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-12"
            onClick={handleEndDay}
            disabled={!!busy}
          >
            {busy === 'end-day' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Home className="w-4 h-4" />}
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">{t('next.endDay')}</div>
              <div className="text-[11px] opacity-70">{t('next.endDayDesc')}</div>
            </div>
          </Button>
        </div>

        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground self-center pt-1 disabled:opacity-50"
          onClick={() => onOpenChange(false)}
          disabled={!!busy}
        >
          {t('next.skip')}
        </button>
      </DialogContent>
    </Dialog>
  );
};
