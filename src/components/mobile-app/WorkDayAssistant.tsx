import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sun, Coffee, AlertCircle, MoonStar } from 'lucide-react';
import type {
  AssistantDecision,
  DaystartDecision,
  LongPassNoBreakDecision,
  LastWorkplaceForDayDecision,
  UnclassifiedAnomalyDecision,
  ActivityLeaveDecision,
} from '@/hooks/useWorkDayAssistant';
import { mobileApi } from '@/services/mobileApiService';
import { useWorkSession, type WorkTarget } from '@/hooks/useWorkSession';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { ActivityLeaveDialog } from './ActivityLeaveDialog';

/**
 * WorkDayAssistant
 * -----------------
 * UI-ytan för den proaktiva timer-assistenten (Prompt 4).
 *
 * Lyssnar på AssistantDecision från useWorkDayAssistant och visar ETT enda
 * dialogfönster åt gången baserat på beslut-typen:
 *
 *   • daystart                 → enkel hälsning + länk till jobben
 *   • activity_leave           → ActivityLeaveDialog (stop / keep / anomaly)
 *   • long_pass_no_break       → påminnelse om att stoppa & välja rast
 *   • last_workplace_for_day   → uppmaning att avsluta dagen
 *   • unclassified_anomaly     → uppmaning att klassificera glapp
 *
 * Komponenten gör INGA tidsberäkningar själv. Stop-flödet går genom samma
 * useWorkSession-motor som "Avsluta aktivitet"-knappen i bannern, så det
 * finns bara EN väg in i tidrapporteringen.
 */
interface Props {
  decision: AssistantDecision | null;
  onAcknowledge: () => void;
}

export const WorkDayAssistant: React.FC<Props> = ({ decision, onAcknowledge }) => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { stopSession, dialogs: workSessionDialogs } = useWorkSession(
    bookings,
    staff?.id,
  );
  const [submitting, setSubmitting] = useState(false);

  if (!decision) {
    // Render nothing visible, but keep mounting workSessionDialogs so the
    // break-decision dialog is in the tree if a stop-from-assistant kicks in.
    return <>{workSessionDialogs}</>;
  }

  // Helper: build a WorkTarget from an active timer.
  const targetFromTimer = (
    timerKey: string,
    timer: ActivityLeaveDecision['timer'] | LongPassNoBreakDecision['timer'],
  ): WorkTarget => {
    if (timer.locationId) {
      return {
        kind: 'location',
        locationId: timer.locationId,
        name: timer.locationName || timer.client,
        createsTimeReport: false,
      };
    }
    if (timer.largeProjectId) {
      return {
        kind: 'project',
        largeProjectId: timer.largeProjectId,
        name: timer.client,
      };
    }
    return { kind: 'booking', bookingId: timerKey, client: timer.client };
  };

  // ──────── DAYSTART ────────
  if (decision.kind === 'daystart') {
    const d = decision as DaystartDecision;
    return (
      <>
        <Dialog open onOpenChange={(o) => !o && onAcknowledge()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-primary" />
                God morgon!
              </DialogTitle>
              <DialogDescription>
                {d.arrivedAtWorkplace
                  ? 'Du verkar vara på en arbetsplats. Vill du börja dagens jobb?'
                  : 'Ny dag, nya tag. Vill du kolla vad som ligger på schemat?'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onAcknowledge} className="w-full sm:w-auto">
                Inte nu
              </Button>
              <Button
                onClick={() => {
                  navigate('/m/jobs');
                  onAcknowledge();
                }}
                className="w-full sm:w-auto"
              >
                Visa dagens jobb
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {workSessionDialogs}
      </>
    );
  }

  // ──────── ACTIVITY LEAVE ────────
  if (decision.kind === 'activity_leave') {
    const d = decision as ActivityLeaveDecision;
    const handleStopActivity = async () => {
      setSubmitting(true);
      try {
        const target = targetFromTimer(d.timerKey, d.timer);
        const res = await stopSession(target);
        if (res.cancelled) {
          // user backed out of break dialog — keep timer alive, dismiss assistant prompt
          onAcknowledge();
          return;
        }
        if (res.saved) {
          toast.success(
            target.kind === 'location'
              ? 'Aktivitet avslutad'
              : `Tidrapport sparad: ${res.hoursWorked}h`,
          );
        }
        onAcknowledge();
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte avsluta aktiviteten');
      } finally {
        setSubmitting(false);
      }
    };

    const handleKeepRunning = () => {
      onAcknowledge();
    };

    const handleCreateAnomaly = async () => {
      setSubmitting(true);
      try {
        await mobileApi.createEndOfDayAnomaly({
          started_at: d.outsideSinceIso,
          ended_at: new Date().toISOString(),
          work_description: `Användaren markerade glapp vid ${
            d.timer.locationName || d.timer.client
          } — assistant-detected leave (${d.distanceMeters} m / ${d.outsideMinutes} min utanför)`,
          location_id: d.timer.locationId || undefined,
          booking_id: d.timer.locationId || d.timer.largeProjectId ? undefined : d.timerKey,
          large_project_id: d.timer.largeProjectId || undefined,
        });
        toast.success('Glappet markerat — admin följer upp');
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte markera glappet');
      } finally {
        setSubmitting(false);
        onAcknowledge();
      }
    };

    return (
      <>
        <ActivityLeaveDialog
          open
          onOpenChange={(o) => !o && onAcknowledge()}
          decision={d}
          submitting={submitting}
          onStopActivity={handleStopActivity}
          onKeepRunning={handleKeepRunning}
          onCreateAnomaly={handleCreateAnomaly}
        />
        {workSessionDialogs}
      </>
    );
  }

  // ──────── LONG PASS WITHOUT BREAK ────────
  if (decision.kind === 'long_pass_no_break') {
    const d = decision as LongPassNoBreakDecision;
    return (
      <>
        <Dialog open onOpenChange={(o) => !o && onAcknowledge()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coffee className="h-5 w-5 text-primary" />
                Långt pass — har du tagit rast?
              </DialogTitle>
              <DialogDescription>
                Du har varit igång på <strong>{d.timer.locationName || d.timer.client}</strong>
                {' '}i ungefär {d.passHours.toFixed(1)} timmar. Vi drar ingen rast
                automatiskt — när du stoppar aktiviteten frågar vi dig om
                rasten där.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onAcknowledge} className="w-full sm:w-auto">
                Påminn senare
              </Button>
              <Button
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    const target = targetFromTimer(d.timerKey, d.timer);
                    const res = await stopSession(target);
                    if (res.saved) {
                      toast.success(`Tidrapport sparad: ${res.hoursWorked}h`);
                    }
                  } catch (err: any) {
                    toast.error(err?.message || 'Kunde inte avsluta');
                  } finally {
                    setSubmitting(false);
                    onAcknowledge();
                  }
                }}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Avsluta nu (svara om rast)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {workSessionDialogs}
      </>
    );
  }

  // ──────── LAST WORKPLACE FOR DAY ────────
  if (decision.kind === 'last_workplace_for_day') {
    const d = decision as LastWorkplaceForDayDecision;
    return (
      <>
        <Dialog open onOpenChange={(o) => !o && onAcknowledge()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MoonStar className="h-5 w-5 text-primary" />
                Verkar du klar för dagen?
              </DialogTitle>
              <DialogDescription>
                Vi ser att du lämnade {d.locationName || 'arbetsplatsen'} och
                inte har några aktiva aktiviteter. Vill du avsluta dagen så
                vi kan dubbelkolla att allt är registrerat?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onAcknowledge} className="w-full sm:w-auto">
                Inte än
              </Button>
              <Button
                onClick={() => {
                  // Use the global "Avsluta dagen" button on the banner.
                  // It runs the EOD reconciliation flow that already exists
                  // inside useWorkSession — no duplication here.
                  navigate('/m');
                  onAcknowledge();
                  toast.message('Tryck på "Avsluta dagen" i toppen för att stänga dagen.');
                }}
                className="w-full sm:w-auto"
              >
                Ta mig till "Avsluta dagen"
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {workSessionDialogs}
      </>
    );
  }

  // ──────── UNCLASSIFIED ANOMALIES ────────
  if (decision.kind === 'unclassified_anomaly') {
    const d = decision as UnclassifiedAnomalyDecision;
    return (
      <>
        <Dialog open onOpenChange={(o) => !o && onAcknowledge()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary" />
                {d.count === 1 ? 'Ett glapp att klassa' : `${d.count} glapp att klassa`}
              </DialogTitle>
              <DialogDescription>
                Vi har {d.count === 1 ? 'ett' : d.count} oklassat glapp i din
                arbetstid. Klassa dem som rast eller arbete så blir
                tidrapporten korrekt — vi gissar inte åt dig.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onAcknowledge} className="w-full sm:w-auto">
                Senare
              </Button>
              <Button
                onClick={() => {
                  navigate('/m/report');
                  onAcknowledge();
                }}
                className="w-full sm:w-auto"
              >
                Klassa nu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {workSessionDialogs}
      </>
    );
  }

  return <>{workSessionDialogs}</>;
};

export default WorkDayAssistant;
