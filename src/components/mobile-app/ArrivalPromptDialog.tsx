import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface ArrivalPromptResult {
  /** ISO timestamp the user picked as start time */
  startedAtIso: string;
  /** True if user accepted the suggested arrival time */
  usedSuggestedArrival: boolean;
}

interface ArrivalPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO timestamp of geofence arrival */
  arrivedAtIso: string;
  /** Display name of the workplace */
  locationName: string;
  /** Called with the user's choice. Dialog stays open until promise resolves. */
  onConfirm: (result: ArrivalPromptResult) => Promise<void>;
  /** Called if user dismisses ("Inte nu") */
  onDismiss: () => Promise<void>;
}

/**
 * Asks the user "Du verkar ha anlänt — vill du starta dagen?".
 * Two main paths:
 *   - "Starta från {arrivalTime}" → use geofence arrival time
 *   - "Starta nu" → use current time
 * "Anpassa tid" reveals a small time-picker so the user can adjust manually.
 */
export const ArrivalPromptDialog: React.FC<ArrivalPromptDialogProps> = ({
  open,
  onOpenChange,
  arrivedAtIso,
  locationName,
  onConfirm,
  onDismiss,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customTime, setCustomTime] = useState('');

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setShowCustom(false);
      setCustomTime(format(new Date(), 'HH:mm'));
    }
  }, [open]);

  const arrivedDate = (() => {
    try { return parseISO(arrivedAtIso); } catch { return new Date(); }
  })();
  const arrivalLabel = format(arrivedDate, 'HH:mm');

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

  // Build a valid past-or-now timestamp from HH:mm input.
  // Night-shift safe: anchor to arrivalDate's calendar day; if HH:mm comes
  // BEFORE arrival on that day, roll to the next day. Reject any candidate
  // in the future (server also rejects, but fail-fast in UI is nicer).
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Starta dagen?
          </DialogTitle>
          <DialogDescription>
            Vi har märkt att du anlänt till arbetsplatsen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/40 p-4 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              {locationName}
            </div>
            <div className="text-3xl font-bold tabular-nums text-foreground">
              kl {arrivalLabel}
            </div>
          </div>

          {showCustom && (
            <div className="space-y-2">
              <Label htmlFor="arrival-custom-time">Egen starttid</Label>
              <Input
                id="arrival-custom-time"
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="text-base"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          {!showCustom ? (
            <>
              <Button
                variant="ghost"
                onClick={handleDismiss}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Inte nu
              </Button>
              <Button
                variant="outline"
                onClick={handleStartNow}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Starta nu
              </Button>
              <Button
                onClick={handleAcceptArrival}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Starta från {arrivalLabel}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setShowCustom(false)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Tillbaka
              </Button>
              <Button
                onClick={handleSubmitCustom}
                disabled={submitting || !/^\d{2}:\d{2}$/.test(customTime)}
                className="w-full sm:w-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Starta
              </Button>
            </>
          )}
        </DialogFooter>

        {!showCustom && (
          <button
            type="button"
            className="mt-2 text-xs text-muted-foreground underline self-center"
            onClick={() => setShowCustom(true)}
            disabled={submitting}
          >
            Anpassa tid
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ArrivalPromptDialog;
