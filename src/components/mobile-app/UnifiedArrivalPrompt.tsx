import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, FolderOpen, Loader2, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { ArrivalTarget } from '@/types/arrivalTarget';

export interface ArrivalPromptResult {
  /** ISO timestamp the user picked as start time */
  startedAtIso: string;
  /** True if user accepted the suggested arrival time */
  usedSuggestedArrival: boolean;
}

interface UnifiedArrivalPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The arrival target. Same shape regardless of whether the user
   * arrived at a Lager, a stort projekt, or a vanlig bokning. The UI is
   * deliberately identical for all three kinds — only the icon changes.
   */
  target: ArrivalTarget;
  /** Called with the user's choice. Dialog stays open until promise resolves. */
  onConfirm: (result: ArrivalPromptResult) => Promise<void>;
  /** Called if user dismisses ("Inte nu") */
  onDismiss: () => Promise<void>;
}

/**
 * UnifiedArrivalPrompt — the single arrival dialog used for ALL arrival
 * targets (fixed locations, large projects, plain bookings).
 *
 * Replaces the old split between `ArrivalPromptDialog` (location-only) and
 * `GeofencePrompt` (booking/project). Same copy, same CTA stack, same
 * backdating semantics for every target kind. Only the leading icon
 * differs so users can recognize the place at a glance.
 */
export const UnifiedArrivalPrompt: React.FC<UnifiedArrivalPromptProps> = ({
  open,
  onOpenChange,
  target,
  onConfirm,
  onDismiss,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customTime, setCustomTime] = useState('');

  const arrivedDate = (() => {
    try { return parseISO(target.arrived_at); } catch { return new Date(); }
  })();
  const arrivalLabel = format(arrivedDate, 'HH:mm');

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setShowCustom(false);
      setCustomTime(format(arrivedDate, 'HH:mm'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target.arrived_at]);

  const handleAcceptArrival = async () => {
    setSubmitting(true);
    try {
      await onConfirm({ startedAtIso: target.arrived_at, usedSuggestedArrival: true });
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

  // Pick a leading icon by kind — visual hint only, behaviour is identical.
  const TargetIcon =
    target.kind === 'project' ? FolderOpen :
    target.kind === 'location' ? Building2 :
    MapPin;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        data-testid="unified-arrival-prompt"
        data-target-kind={target.kind}
      >
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
              <TargetIcon className="h-4 w-4" />
              {target.label}
            </div>
            {target.address && (
              <div className="text-xs text-muted-foreground">{target.address}</div>
            )}
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
              {customInvalid && (
                <p className="text-xs text-destructive">
                  Tiden måste vara i förflutet (max idag).
                </p>
              )}
            </div>
          )}
        </div>

        {!showCustom ? (
          <div className="mt-4 flex flex-col gap-2">
            <Button
              onClick={handleAcceptArrival}
              disabled={submitting}
              className="w-full"
              size="lg"
              data-testid="arrival-start-from-arrival"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Starta från {arrivalLabel}
            </Button>
            <Button
              variant="outline"
              onClick={handleStartNow}
              disabled={submitting}
              className="w-full"
              data-testid="arrival-start-now"
            >
              Starta nu
            </Button>
            <Button
              variant="ghost"
              onClick={handleDismiss}
              disabled={submitting}
              className="w-full"
              data-testid="arrival-dismiss"
            >
              Inte nu
            </Button>
            <button
              type="button"
              className="mt-1 text-xs text-muted-foreground underline self-center"
              onClick={() => setShowCustom(true)}
              disabled={submitting}
              data-testid="arrival-show-custom"
            >
              Anpassa tid
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <Button
              onClick={handleSubmitCustom}
              disabled={submitting || !customIso}
              className="w-full"
              size="lg"
              data-testid="arrival-submit-custom"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Starta
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCustom(false)}
              disabled={submitting}
              className="w-full"
            >
              Tillbaka
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UnifiedArrivalPrompt;
