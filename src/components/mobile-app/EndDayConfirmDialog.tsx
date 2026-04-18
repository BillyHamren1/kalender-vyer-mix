import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Building2, Clock, Loader2, MoonStar } from 'lucide-react';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { format, parseISO } from 'date-fns';

/**
 * EndDayConfirmDialog
 * --------------------
 * Architectural decision (Prompt 3): vi skiljer EXPLICIT mellan:
 *   • "Avsluta aktivitet" — stoppar EN aktiv signal, dagen lever vidare.
 *   • "Avsluta dagen"     — stänger ALLA aktiva signaler enligt samma
 *                           kärnflöde (rastfråga per pass + save-then-stop)
 *                           och kör därefter end-of-day-rekoncilieringen
 *                           (sista geofence-exit + ev. anomaly för glapp).
 *
 * Den här dialogen är endast bekräftelse + transparens innan dagens
 * avslut körs. Inga gissningar — användaren ser exakt vilka signaler
 * som kommer att stängas och kan backa.
 */
interface EndDayConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active signals that will be closed when user confirms. */
  activeTimers: Array<{ key: string; timer: ActiveTimer }>;
  /** True while endDay() is running. Dialog stays mounted but disabled. */
  submitting: boolean;
  onConfirm: () => void;
}

export const EndDayConfirmDialog: React.FC<EndDayConfirmDialogProps> = ({
  open,
  onOpenChange,
  activeTimers,
  submitting,
  onConfirm,
}) => {
  const count = activeTimers.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MoonStar className="h-5 w-5 text-primary" />
            Avsluta dagen?
          </DialogTitle>
          <DialogDescription>
            {count === 0
              ? 'Du har inga aktiva signaler just nu, men vi kontrollerar ändå om det finns något som behöver städas upp.'
              : count === 1
                ? 'Vi avslutar din aktiva signal nedan. Du blir tillfrågad om rast om passet är långt, och vi kontrollerar sluttid mot din senaste utgång från en arbetsplats.'
                : `Vi avslutar samtliga ${count} aktiva signaler nedan en i taget. Du blir tillfrågad om rast för varje långt pass, och vi kontrollerar sluttid mot din senaste utgång från en arbetsplats.`}
          </DialogDescription>
        </DialogHeader>

        {count > 0 && (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {activeTimers.map(({ key, timer }) => {
              let started = '';
              try {
                started = format(parseISO(timer.startTime), 'HH:mm');
              } catch {
                started = '—';
              }
              const isLocation = !!timer.locationId;
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2"
                >
                  {isLocation ? (
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate text-foreground">
                      {timer.locationName || timer.client}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Startad {started}
                      {timer.establishmentTaskTitle ? ` · ${timer.establishmentTaskTitle}` : ''}
                      {timer.pendingSync ? ' · synkar' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Stoppar något oväntat? Tryck <strong>Avbryt</strong> — inget tas bort.
          Vill du bara avsluta en enskild signal, använd knappen{' '}
          <strong>Avsluta aktivitet</strong> bredvid den i listan.
        </p>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Avbryt
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {count > 0 ? 'Ja, avsluta dagen' : 'Kontrollera ändå'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EndDayConfirmDialog;
