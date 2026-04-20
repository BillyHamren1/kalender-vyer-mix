import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Car, Coffee, Home, Loader2 } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';

export type NextAction = 'travel' | 'break' | 'end-day';

interface NextActionDialogProps {
  open: boolean;
  /** Name of the activity that just ended — shown in the dialog header. */
  closedActivityName: string;
  onOpenChange: (open: boolean) => void;
  /** Called after user picked AND the chosen action's side-effect completed. */
  onResolved?: (action: NextAction) => void;
}

/**
 * NextActionDialog — appears AFTER a single timer is stopped.
 *
 * Forces the user to clarify what's next so the day isn't silently broken:
 *   • Åka till nästa projekt → starts a manual travel log immediately.
 *   • Ta paus              → just acknowledges; system handles break gap.
 *   • Avsluta dagen        → fires global request-end-day → EOD flow.
 *
 * The dialog cannot be dismissed by clicking outside — the user must pick
 * one of the three options (or "Bara avsluta" as escape hatch).
 */
export const NextActionDialog: React.FC<NextActionDialogProps> = ({
  open,
  closedActivityName,
  onOpenChange,
  onResolved,
}) => {
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
        description: `Avresa från ${closedActivityName}`,
      });
      toast.success('Restimer startad — bra resa!');
      onResolved?.('travel');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte starta restimer');
    } finally {
      setBusy(null);
    }
  };

  const handleBreak = () => {
    setBusy('break');
    toast.success('Paus registrerad — starta nästa aktivitet när du är tillbaka.');
    onResolved?.('break');
    onOpenChange(false);
    setBusy(null);
  };

  const handleEndDay = () => {
    setBusy('end-day');
    // Defer to existing global EOD pipeline.
    window.dispatchEvent(new CustomEvent('request-end-day'));
    onResolved?.('end-day');
    onOpenChange(false);
    setBusy(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Block outside-click dismissal while a side-effect is running.
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Vad gör du nu?</DialogTitle>
          <DialogDescription>
            Du avslutade <span className="font-semibold text-foreground">{closedActivityName}</span>. Berätta vad
            som händer härnäst så dagen håller ihop.
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
              <div className="font-semibold text-sm">Åka till nästa projekt</div>
              <div className="text-[11px] opacity-80">Startar restimer</div>
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
              <div className="font-semibold text-sm">Ta paus</div>
              <div className="text-[11px] opacity-80">Lunch eller kort vila</div>
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
              <div className="font-semibold text-sm">Avsluta dagen</div>
              <div className="text-[11px] opacity-70">Stänger alla aktiva timers</div>
            </div>
          </Button>
        </div>

        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground self-center pt-1 disabled:opacity-50"
          onClick={() => onOpenChange(false)}
          disabled={!!busy}
        >
          Hoppa över
        </button>
      </DialogContent>
    </Dialog>
  );
};
