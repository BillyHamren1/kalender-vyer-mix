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
import { Building2, MapPin, Square, Clock, AlertTriangle } from 'lucide-react';
import type { ActivityLeaveDecision } from '@/hooks/useWorkDayAssistant';
import { format, parseISO } from 'date-fns';

/**
 * ActivityLeaveDialog
 * --------------------
 * Visas av WorkDayAssistant när tolkningen är: "användaren verkar lämna en
 * aktivitet". Den ändrar INGEN tid automatiskt — den bara erbjuder tre
 * tydliga val:
 *
 *   1. Avsluta aktivitet  → kör den vanliga stop-flödet (rastfråga vid behov)
 *   2. Fortsätt timern    → assistenten tystar sig, timern lever vidare
 *   3. Markera som glapp  → skapar en avvikelse för admin-uppföljning
 *
 * "Markera som glapp" är vägen ut när användaren faktiskt inte vet vad som
 * hänt — då gissar systemet INTE, det skapar en anomaly istället.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: ActivityLeaveDecision;
  submitting?: boolean;
  onStopActivity: () => void;
  onKeepRunning: () => void;
  onCreateAnomaly: () => void;
}

export const ActivityLeaveDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  decision,
  submitting,
  onStopActivity,
  onKeepRunning,
  onCreateAnomaly,
}) => {
  const isLocation = !!decision.timer.locationId;
  const label = decision.timer.locationName || decision.timer.client;

  let outsideSince = '—';
  try {
    outsideSince = format(parseISO(decision.outsideSinceIso), 'HH:mm');
  } catch {
    /* ignore */
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Verkar du lämnat aktiviteten?
          </DialogTitle>
          <DialogDescription>
            Vi ser att du varit ungefär {decision.distanceMeters} m utanför{' '}
            <strong>{label}</strong> sedan {outsideSince}{' '}
            ({decision.outsideMinutes} min). Timern är fortfarande igång.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 flex items-center gap-2">
          {isLocation ? (
            <Building2 className="h-4 w-4 text-primary" />
          ) : (
            <Clock className="h-4 w-4 text-primary" />
          )}
          <span className="text-sm font-semibold truncate">{label}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Vi gissar ingen tid åt dig. Välj vad som faktiskt hände — eller
          markera som glapp så följer admin upp.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={onStopActivity}
            disabled={submitting}
            className="w-full justify-center gap-2"
          >
            <Square className="h-4 w-4" />
            Avsluta aktiviteten
          </Button>
          <Button
            variant="outline"
            onClick={onKeepRunning}
            disabled={submitting}
            className="w-full"
          >
            Jag jobbar fortfarande — låt timern fortsätta
          </Button>
          <Button
            variant="ghost"
            onClick={onCreateAnomaly}
            disabled={submitting}
            className="w-full justify-center gap-2 text-muted-foreground"
          >
            <AlertTriangle className="h-4 w-4" />
            Markera som glapp för uppföljning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ActivityLeaveDialog;
