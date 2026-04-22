import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useLanguage } from '@/i18n/LanguageContext';

export interface ArrivalPromptResult {
  startedAtIso: string;
  usedSuggestedArrival: boolean;
}

interface ArrivalPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arrivedAtIso: string;
  locationName: string;
  onConfirm: (result: ArrivalPromptResult) => Promise<void>;
  onDismiss: () => Promise<void>;
}

export const ArrivalPromptDialog: React.FC<ArrivalPromptDialogProps> = ({
  open,
  onOpenChange,
  arrivedAtIso,
  locationName,
  onConfirm,
  onDismiss,
}) => {
  const { t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customTime, setCustomTime] = useState('');

  const arrivedDate = (() => {
    try { return parseISO(arrivedAtIso); } catch { return new Date(); }
  })();
  const arrivalLabel = format(arrivedDate, 'HH:mm');

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setShowCustom(false);
      setCustomTime(format(arrivedDate, 'HH:mm'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, arrivedAtIso]);

  const handleAcceptArrival = async () => {
    setSubmitting(true);
    try {
      await onConfirm({ startedAtIso: arrivedAtIso, usedSuggestedArrival: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartNow = async () => {
    setSubmitting(true);
    try {
      await onConfirm({ startedAtIso: new Date().toISOString(), usedSuggestedArrival: false });
    } finally {
      setSubmitting(false);
    }
  };

  const buildCustomIso = (): string | null => {
    if (!/^\d{2}:\d{2}$/.test(customTime)) return null;
    const [h, m] = customTime.split(':').map(Number);
    const candidate = new Date(arrivedDate);
    candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() < arrivedDate.getTime() && h < 12) {
      candidate.setDate(candidate.getDate() + 1);
    }
    if (candidate.getTime() > Date.now()) return null;
    return candidate.toISOString();
  };
  const customIso = buildCustomIso();
  const customInvalid = !!customTime && customIso === null;

  const handleSubmitCustom = async () => {
    if (!customIso) return;
    setSubmitting(true);
    try {
      await onConfirm({ startedAtIso: customIso, usedSuggestedArrival: false });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    setSubmitting(true);
    try {
      await onDismiss();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {t('arrival.startDay')}
          </DialogTitle>
          <DialogDescription>{t('arrival.detected')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/40 p-4 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              {locationName}
            </div>
            <div className="text-3xl font-bold tabular-nums text-foreground">
              {t('eod.atLabel')} {arrivalLabel}
            </div>
          </div>

          {showCustom && (
            <div className="space-y-2">
              <Label htmlFor="arrival-custom-time">{t('arrival.customStart')}</Label>
              <Input
                id="arrival-custom-time"
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="text-base"
              />
              {customInvalid && (
                <p className="text-xs text-destructive">{t('arrival.errPast')}</p>
              )}
            </div>
          )}
        </div>

        {!showCustom ? (
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={handleAcceptArrival} disabled={submitting} className="w-full" size="lg">
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('arrival.startFrom', { time: arrivalLabel })}
            </Button>
            <Button variant="outline" onClick={handleStartNow} disabled={submitting} className="w-full">
              {t('arrival.startNow')}
            </Button>
            <Button variant="ghost" onClick={handleDismiss} disabled={submitting} className="w-full">
              {t('arrival.notNow')}
            </Button>
            <button
              type="button"
              className="mt-1 text-xs text-muted-foreground underline self-center"
              onClick={() => setShowCustom(true)}
              disabled={submitting}
            >
              {t('arrival.customizeTime')}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={handleSubmitCustom} disabled={submitting || !customIso} className="w-full" size="lg">
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('arrival.start')}
            </Button>
            <Button variant="outline" onClick={() => setShowCustom(false)} disabled={submitting} className="w-full">
              {t('arrival.back')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ArrivalPromptDialog;
