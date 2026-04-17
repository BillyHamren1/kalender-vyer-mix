import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Building2, Clock, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';

export interface EndOfDayResult {
  /** ISO timestamp the user picked as end time */
  endedAtIso: string;
  /** Description of post-exit work, only set when user chose "Nej" */
  workDescription?: string;
  /** True when user accepted the suggested exit time */
  usedSuggestedExit: boolean;
}

interface EndOfDayStopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO timestamp of last geofence exit (suggested end-time) */
  lastExitIso: string;
  /** Optional name of the workplace they exited */
  locationName?: string | null;
  /** Called with the user's choice. Dialog stays open until promise resolves. */
  onConfirm: (result: EndOfDayResult) => Promise<void>;
}

const COMMENT_THRESHOLD_MIN = 10;

/**
 * Confirms end-of-day stop time when the user has left their workplace
 * before manually stopping the timer. Two paths:
 *  - "Ja" → use the geofence-exit time as end_time
 *  - "Nej" → user picks own end time + describes what they did
 */
export const EndOfDayStopDialog: React.FC<EndOfDayStopDialogProps> = ({
  open,
  onOpenChange,
  lastExitIso,
  locationName,
  onConfirm,
}) => {
  const [step, setStep] = useState<'ask' | 'custom'>('ask');
  const [submitting, setSubmitting] = useState(false);
  const [customTime, setCustomTime] = useState(''); // HH:mm
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

  // Build full ISO timestamp from time-of-day input, anchored to today
  // (or yesterday if the picked time is earlier than the exit time and that would put it before exit)
  const buildCustomIso = (): string | null => {
    if (!/^\d{2}:\d{2}$/.test(customTime)) return null;
    const [h, m] = customTime.split(':').map(Number);
    const candidate = new Date();
    candidate.setHours(h, m, 0, 0);
    // If user picked a time earlier than the geofence exit on the same date, assume it's still later
    // — but we still validate below.
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
            Sluttid för dagen
          </DialogTitle>
          <DialogDescription>
            {step === 'ask'
              ? 'Vi noterade när du lämnade arbetsplatsen. Stämmer det som sluttid?'
              : 'Ange din egen sluttid och vad du gjorde efter att du lämnade arbetsplatsen.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'ask' ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                {locationName ? `Du lämnade ${locationName}` : 'Du lämnade arbetsplatsen'}
              </div>
              <div className="text-3xl font-bold tabular-nums text-foreground">
                kl {exitTimeLabel}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Vill du använda <strong>{exitTimeLabel}</strong> som sluttid på din tidrapport?
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Du lämnade arbetsplatsen kl <strong>{exitTimeLabel}</strong>.
            </div>
            <div className="space-y-2">
              <Label htmlFor="eod-end-time">Sluttid</Label>
              <Input
                id="eod-end-time"
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="text-base"
              />
              {!customTimeIsValid && customTime && (
                <p className="text-xs text-destructive">
                  Sluttiden måste vara efter {exitTimeLabel}.
                </p>
              )}
              {customTimeIsValid && (
                <p className="text-xs text-muted-foreground">
                  {customDurationMin} min efter att du lämnade arbetsplatsen.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="eod-description">
                Vad gjorde du efter {exitTimeLabel}?
                {requiresDescription && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Textarea
                id="eod-description"
                placeholder="T.ex. Handlade på Bauhaus, hämtade material…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[80px]"
              />
              {descriptionMissing && (
                <p className="text-xs text-destructive">
                  Beskrivning krävs när tiden är längre än {COMMENT_THRESHOLD_MIN} min.
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
                Nej, annan tid
              </Button>
              <Button
                onClick={handleAcceptSuggested}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Ja, använd {exitTimeLabel}
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
                Tillbaka
              </Button>
              <Button
                onClick={handleSubmitCustom}
                disabled={!customCanSubmit || submitting}
                className="w-full sm:w-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Spara tidrapport
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EndOfDayStopDialog;
