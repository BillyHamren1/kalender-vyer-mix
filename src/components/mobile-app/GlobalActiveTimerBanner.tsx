import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Square, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { EndOfDayStopDialog, type EndOfDayResult } from './EndOfDayStopDialog';
import { StopBreakDecisionDialog, type StopBreakDecision } from './StopBreakDecisionDialog';
import { useStopBreakDecision } from '@/hooks/useStopBreakDecision';
import { shouldPromptForBreak } from '@/utils/breakPolicy';

const TIMERS_KEY = 'eventflow-mobile-timers';
const PENDING_STOP_KEY = 'eventflow-pending-stop';

function loadTimersFromStorage(): Map<string, ActiveTimer> {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

interface PendingStop {
  key: string;
  timer: ActiveTimer;
  startTimeDate: Date;
  lastExitIso: string;
  locationName: string | null;
}

const GlobalActiveTimerBanner: React.FC = () => {
  const location = useLocation();
  const [timers, setTimers] = useState<Map<string, ActiveTimer>>(loadTimersFromStorage);
  const [, setTick] = useState(0);
  const [pendingStop, setPendingStop] = useState<PendingStop | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(loadTimersFromStorage());
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = () => setTimers(loadTimersFromStorage());
    window.addEventListener('timer-state-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('timer-state-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  // C8 — Restore any pending-stop dialog state if app was killed mid-confirmation
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_STOP_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.key && parsed.timer && parsed.startTimeIso && parsed.lastExitIso) {
        setPendingStop({
          key: parsed.key,
          timer: parsed.timer,
          startTimeDate: parseISO(parsed.startTimeIso),
          lastExitIso: parsed.lastExitIso,
          locationName: parsed.locationName ?? null,
        });
      }
    } catch {
      // ignore corrupt state
      localStorage.removeItem(PENDING_STOP_KEY);
    }
  }, []);

  // Persist pending-stop to localStorage so it survives app kill
  useEffect(() => {
    if (!pendingStop) {
      localStorage.removeItem(PENDING_STOP_KEY);
      return;
    }
    try {
      localStorage.setItem(PENDING_STOP_KEY, JSON.stringify({
        key: pendingStop.key,
        timer: pendingStop.timer,
        startTimeIso: pendingStop.startTimeDate.toISOString(),
        lastExitIso: pendingStop.lastExitIso,
        locationName: pendingStop.locationName,
      }));
    } catch {}
  }, [pendingStop]);

  /**
   * Persists the time report and (if needed) the end-of-day anomaly.
   * Used by both the direct-stop path and the dialog-confirmed path.
   *
   * IMPORTANT: ingen automatisk rast. Anroparen MÅSTE skicka in
   * `breakHours` (0 om ingen rast eller för korta pass) som ett resultat
   * av ett uttryckligt användarbeslut via StopBreakDecisionDialog.
   * `breakAnomalyNote` skapar en time_report_anomaly för admin-uppföljning
   * när användaren valde "markera som avvikelse" i stället för att gissa.
   */
  const persistStop = useCallback(async (
    key: string,
    timer: ActiveTimer,
    startTimeDate: Date,
    stopTime: Date,
    breakHours: number,
    breakAnomalyNote?: string,
    endOfDay?: { lastExitDate: Date; workDescription?: string; locationId?: string | null },
  ) => {
    let totalHours = (stopTime.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
    if (totalHours < 0) totalHours += 24;
    const safeBreak = Math.max(0, breakHours || 0);
    const hoursWorked = Math.max(0, Number((totalHours - safeBreak).toFixed(2)));

    try {
      const tr = await mobileApi.createTimeReport({
        booking_id: key.startsWith('project-') ? undefined : key,
        report_date: format(stopTime, 'yyyy-MM-dd'),
        start_time: format(startTimeDate, 'HH:mm'),
        end_time: format(stopTime, 'HH:mm'),
        hours_worked: hoursWorked,
        break_time: safeBreak,
        description: `Timer: ${timer.locationName || timer.client}${timer.establishmentTaskTitle ? ` — ${timer.establishmentTaskTitle}` : ''}`,
        establishment_task_id: timer.establishmentTaskId,
        large_project_id: timer.largeProjectId,
      });
      toast.success(`Tidrapport sparad: ${hoursWorked}h`);
      const trId = (tr as any)?.time_report?.id;

      // Användarvalt: "markera som avvikelse". Sparas som end-of-day anomaly
      // så admin kan följa upp i stället för att vi gissar rast.
      if (breakAnomalyNote) {
        await mobileApi.createEndOfDayAnomaly({
          started_at: startTimeDate.toISOString(),
          ended_at: stopTime.toISOString(),
          work_description: `Rast/avvikelse: ${breakAnomalyNote}`,
          location_id: timer.locationId || undefined,
          booking_id: key.startsWith('project-') ? undefined : key,
          large_project_id: timer.largeProjectId,
          time_report_id: trId,
        }).catch(err => {
          console.warn('Could not save break anomaly:', err);
        });
      }

      // If this is an end-of-day "Nej" path with custom end-time + description,
      // create an anomaly capturing what happened between the geofence exit
      // and the user-stated end time.
      if (endOfDay && endOfDay.workDescription) {
        // Try to capture current GPS for the position of the absence
        let lat: number | undefined;
        let lng: number | undefined;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('no geolocation'));
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000, maximumAge: 60000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // Position is best-effort; anomaly is still useful without it
        }

        await mobileApi.createEndOfDayAnomaly({
          started_at: endOfDay.lastExitDate.toISOString(),
          ended_at: stopTime.toISOString(),
          work_description: endOfDay.workDescription,
          end_location_lat: lat,
          end_location_lng: lng,
          location_id: endOfDay.locationId || timer.locationId || undefined,
          booking_id: key.startsWith('project-') ? undefined : key,
          large_project_id: timer.largeProjectId,
          time_report_id: trId,
        }).catch(err => {
          console.warn('Could not save end-of-day anomaly:', err);
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte spara tidrapport');
      // Re-throw so caller knows persistence failed and keeps timer alive
      throw err;
    }
  }, []);

  /**
   * Save-then-stop: server is source of truth.
   * Timer must NOT be removed locally before time_report is safely persisted.
   * On error: timer stays active locally and on server so user can retry.
   */
  const clearTimerLocally = useCallback((key: string) => {
    const current = loadTimersFromStorage();
    current.delete(key);
    localStorage.setItem(TIMERS_KEY, JSON.stringify(Array.from(current.entries())));
    setTimers(current);
    window.dispatchEvent(new Event('timer-state-changed'));
  }, []);

  // Promise-baserad rast-dialog (uttryckligt användarbeslut, ingen auto-rast).
  const breakDecision = useStopBreakDecision();

  /**
   * Avgör break_time enligt beslutsdokumentet:
   *  - korta pass (<= tröskel): break = 0, ingen dialog
   *  - långa pass: öppna dialog, vänta på explicit val
   *  - om användaren avbryter dialogen: returnera null så stopp inte sker
   */
  const resolveBreakChoice = useCallback(
    async (passHours: number, context: string | null):
      Promise<{ breakHours: number; anomalyNote?: string } | null> => {
      if (!shouldPromptForBreak(passHours)) {
        return { breakHours: 0 };
      }
      const decision = await breakDecision.ask({ passHours, context });
      if (!decision) return null;
      if (decision.kind === 'break')    return { breakHours: decision.breakHours };
      if (decision.kind === 'no_break') return { breakHours: 0 };
      return { breakHours: 0, anomalyNote: decision.note };
    },
    [breakDecision],
  );

  const handleStop = useCallback(async (key: string, timer: ActiveTimer) => {
    const stopTime = new Date();
    const startTimeDate = parseISO(timer.startTime);

    let lastExit: { exited_at: string; location_id: string | null; location_name: string | null } | null = null;
    try {
      const res = await mobileApi.getLastWorkplaceExit();
      lastExit = res.last_exit;
    } catch (err) {
      console.warn('Could not fetch last workplace exit:', err);
    }

    if (lastExit?.exited_at) {
      const exitDate = parseISO(lastExit.exited_at);
      const gapMin = (stopTime.getTime() - exitDate.getTime()) / 60000;
      const isWithinSession = exitDate.getTime() > startTimeDate.getTime();
      if (isWithinSession && gapMin >= 2) {
        setPendingStop({
          key,
          timer,
          startTimeDate,
          lastExitIso: lastExit.exited_at,
          locationName: lastExit.location_name,
        });
        return;
      }
    }

    // Be om explicit rast-beslut innan vi sparar något.
    let totalHours = (stopTime.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
    if (totalHours < 0) totalHours += 24;
    const choice = await resolveBreakChoice(totalHours, timer.locationName || timer.client);
    if (!choice) return; // användaren avbröt — timer lever vidare

    try {
      await persistStop(key, timer, startTimeDate, stopTime, choice.breakHours, choice.anomalyNote);
    } catch (err: any) {
      console.warn('[Stop] persistStop failed, timer stays active:', err);
      return;
    }

    mobileApi.closeOpenAnomalies({ ended_at: stopTime.toISOString() }).catch(err => {
      console.warn('Failed to close open anomalies on stop:', err);
    });
    if (timer.locationId) {
      try {
        await mobileApi.stopLocationTimer({ location_id: timer.locationId });
      } catch (err) {
        console.warn('Failed to stop location timer on server (timer cleared locally anyway):', err);
      }
    }
    clearTimerLocally(key);
  }, [persistStop, clearTimerLocally, resolveBreakChoice]);

  const handleDialogConfirm = useCallback(async (result: EndOfDayResult) => {
    if (!pendingStop) return;
    const stopTime = new Date(result.endedAtIso);
    const lastExitDate = parseISO(pendingStop.lastExitIso);

    let totalHours = (stopTime.getTime() - pendingStop.startTimeDate.getTime()) / (1000 * 60 * 60);
    if (totalHours < 0) totalHours += 24;
    const choice = await resolveBreakChoice(
      totalHours,
      pendingStop.timer.locationName || pendingStop.timer.client,
    );
    if (!choice) return;

    try {
      await persistStop(
        pendingStop.key,
        pendingStop.timer,
        pendingStop.startTimeDate,
        stopTime,
        choice.breakHours,
        choice.anomalyNote,
        result.usedSuggestedExit
          ? undefined
          : {
              lastExitDate,
              workDescription: result.workDescription,
              locationId: pendingStop.timer.locationId || null,
            },
      );
    } catch (err) {
      console.warn('[Stop] dialog persistStop failed, timer stays active:', err);
      return;
    }

    if (pendingStop.timer.locationId) {
      try {
        await mobileApi.stopLocationTimer({ location_id: pendingStop.timer.locationId });
      } catch (err) {
        console.warn('Failed to stop location timer on server (cleared locally anyway):', err);
      }
    }
    clearTimerLocally(pendingStop.key);
    setPendingStop(null);
  }, [pendingStop, persistStop, clearTimerLocally, resolveBreakChoice]);

  if (location.pathname === '/m/report') return null;

  return (
    <>
      {timers.size > 0 && (
        <div className="px-5 pt-3 space-y-2">
          {Array.from(timers.entries()).map(([key, timer]) => (
            <TimerRow key={key} timerKey={key} timer={timer} onStop={handleStop} />
          ))}
        </div>
      )}
      {pendingStop && (
        <EndOfDayStopDialog
          open={!!pendingStop}
          onOpenChange={(open) => {
            // Closing without confirming = treat as "use now as end time".
            // Save-then-stop: only clear timer if persistStop succeeds.
            if (!open && pendingStop) {
              const stopTime = new Date();
              const ps = pendingStop;
              persistStop(ps.key, ps.timer, ps.startTimeDate, stopTime)
                .then(async () => {
                  if (ps.timer.locationId) {
                    try { await mobileApi.stopLocationTimer({ location_id: ps.timer.locationId }); } catch {}
                  }
                  clearTimerLocally(ps.key);
                  setPendingStop(null);
                })
                .catch(() => {
                  // keep dialog & timer for retry
                });
            }
          }}
          lastExitIso={pendingStop.lastExitIso}
          locationName={pendingStop.locationName}
          onConfirm={handleDialogConfirm}
        />
      )}
    </>
  );
};

const TimerRow: React.FC<{
  timerKey: string;
  timer: ActiveTimer;
  onStop: (key: string, timer: ActiveTimer) => void;
}> = ({ timerKey, timer, onStop }) => {
  const elapsed = differenceInSeconds(new Date(), parseISO(timer.startTime));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const isLocation = !!timer.locationId;

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border border-primary/20 bg-primary/5">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate text-foreground flex items-center gap-1.5">
          {isLocation && <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />}
          {timer.locationName || timer.client}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Started {format(parseISO(timer.startTime), 'HH:mm')}
          {timer.isAutoStarted && ' (auto)'}
        </p>
      </div>
      <div className="font-mono font-extrabold text-base tabular-nums text-primary">
        {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </div>
      <Button
        size="sm"
        variant="destructive"
        className="rounded-xl h-9 gap-1 text-xs font-semibold"
        onClick={() => onStop(timerKey, timer)}
      >
        <Square className="w-3 h-3" />
        Stop
      </Button>
    </div>
  );
};

export default GlobalActiveTimerBanner;
