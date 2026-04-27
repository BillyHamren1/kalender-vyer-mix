import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Building2, Clock, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { useLanguage } from '@/i18n/LanguageContext';

export interface EndOfDayResult {
  endedAtIso: string;
  workDescription?: string;
  usedSuggestedExit: boolean;
}

interface EndOfDayStopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lastExitIso: string;
  locationName?: string | null;
  onConfirm: (result: EndOfDayResult) => Promise<void>;
  /**
   * Explicit cancel from user. Required so the host can decide what
   * "Avbryt" means (e.g. abort end-day queue vs. just close dialog).
   * Outside-click and Escape are routed here too — never closes silently.
   */
  onCancel: () => void;
}

const COMMENT_THRESHOLD_MIN = 10;

export const EndOfDayStopDialog: React.FC<EndOfDayStopDialogProps> = ({
  open,
  onOpenChange,
  lastExitIso,
  locationName,
  onConfirm,
}) => {
  const { t } = useLanguage();
  const [step, setStep] = useState<'ask' | 'custom'>('ask');
  const [submitting, setSubmitting] = useState(false);
  const [customTime, setCustomTime] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) {
      setStep('ask');
      setCustomTime(format(new Date(), 'HH:mm'));
      setDescription('');
      setSubmitting(false);
    }
  }, [open]);

  const exitDate = (() => {
    try { return parseISO(lastExitIso); } catch { return new Date(); }
  })();
  const exitTimeLabel = format(exitDate, 'HH:mm');

  const handleAcceptSuggested = async () => {
    setSubmitting(true);
    try {
      await onConfirm({ endedAtIso: lastExitIso, usedSuggestedExit: true });
    } finally {
      setSubmitting(false);
    }
  };

  const buildCustomIso = (): string | null => {
    if (!/^\d{2}:\d{2}$/.test(customTime)) return null;
    const [h, m] = customTime.split(':').map(Number);
    const candidate = new Date(exitDate);
    candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() <= exitDate.getTime() && h < 12) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.toISOString();
  };

  const customIso = buildCustomIso();
  const customDate = customIso ? new Date(customIso) : null;
  const customDurationMin = customDate ? differenceInMinutes(customDate, exitDate) : 0;
  const customTimeIsValid = customDate !== null && customDate.getTime() > exitDate.getTime();
  const requiresDescription = customDurationMin > COMMENT_THRESHOLD_MIN;
  const descriptionMissing = requiresDescription && !description.trim();
  const customCanSubmit = customTimeIsValid && !descriptionMissing;

  const handleSubmitCustom = async () => {
    if (!customCanSubmit || !customIso) return;
    setSubmitting(true);
    try {
      await onConfirm({
        endedAtIso: customIso,
        workDescription: description.trim() || undefined,
        usedSuggestedExit: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t('eod.title')}
          </DialogTitle>
          <DialogDescription>
            {step === 'ask' ? t('eod.askBody') : t('eod.customBody')}
          </DialogDescription>
        </DialogHeader>

        {step === 'ask' ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                {locationName ? t('eod.leftPlace', { place: locationName }) : t('eod.leftWorkplace')}
              </div>
              <div className="text-3xl font-bold tabular-nums text-foreground">
                {t('eod.atLabel')} {exitTimeLabel}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('eod.useAs', { time: exitTimeLabel })}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              {t('eod.youLeftAt', { time: exitTimeLabel })}
            </div>
            <div className="space-y-2">
              <Label htmlFor="eod-end-time">{t('eod.endTime')}</Label>
              <Input
                id="eod-end-time"
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="text-base"
              />
              {!customTimeIsValid && customTime && (
                <p className="text-xs text-destructive">
                  {t('eod.errAfter', { time: exitTimeLabel })}
                </p>
              )}
              {customTimeIsValid && (
                <p className="text-xs text-muted-foreground">
                  {t('eod.minsAfter', { mins: customDurationMin })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="eod-description">
                {t('eod.descLabel', { time: exitTimeLabel })}
                {requiresDescription && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Textarea
                id="eod-description"
                placeholder={t('eod.descPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[80px]"
              />
              {descriptionMissing && (
                <p className="text-xs text-destructive">
                  {t('eod.descRequired', { mins: COMMENT_THRESHOLD_MIN })}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          {step === 'ask' ? (
            <>
              <Button
                variant="outline"
                onClick={() => setStep('custom')}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {t('eod.noOther')}
              </Button>
              <Button
                onClick={handleAcceptSuggested}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {t('eod.yesUse', { time: exitTimeLabel })}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep('ask')}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {t('eod.back')}
              </Button>
              <Button
                onClick={handleSubmitCustom}
                disabled={!customCanSubmit || submitting}
                className="w-full sm:w-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {t('eod.save')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EndOfDayStopDialog;
