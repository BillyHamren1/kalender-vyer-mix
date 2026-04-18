import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Square, Building2, AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { EndOfDayStopDialog, type EndOfDayResult } from './EndOfDayStopDialog';

const TIMERS_KEY = 'eventflow-mobile-timers';
const PENDING_STOP_KEY = 'eventflow-pending-stop';
// Per-timer save state: keyed by timer key, holds a pending save that hasn't
// completed yet. Survives page reloads so the user can retry instead of losing
// the work session if createTimeReport failed mid-stop.
const PENDING_SAVES_KEY = 'eventflow-pending-saves';

function loadTimersFromStorage(): Map<string, ActiveTimer> {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

function deleteTimerFromStorage(key: string) {
  const current = loadTimersFromStorage();
  current.delete(key);
  localStorage.setItem(TIMERS_KEY, JSON.stringify(Array.from(current.entries())));
  window.dispatchEvent(new Event('timer-state-changed'));
}

interface PendingStop {
  key: string;
  timer: ActiveTimer;
  startTimeDate: Date;
  lastExitIso: string;
  locationName: string | null;
}

/**
 * A failed save we want to recover from.
 * Captured at the moment the user pressed Stop so the *original* end-time is
 * preserved across retries (we never use "now" again on retry).
 */
interface PendingSave {
  key: string;
  timer: ActiveTimer;
  startTimeIso: string;
  endTimeIso: string;
  endOfDay?: {
    lastExitIso: string;
    workDescription?: string;
    locationId?: string | null;
  };
  // Stable client-side dedupe id — we use it to suppress double saves while
  // a retry is in-flight (and could in the future be sent to the backend).
  dedupeId: string;
  lastError?: string;
  attempts: number;
  createdAt: string;
}

function loadPendingSaves(): Record<string, PendingSave> {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writePendingSaves(map: Record<string, PendingSave>) {
  if (Object.keys(map).length === 0) {
    localStorage.removeItem(PENDING_SAVES_KEY);
  } else {
    localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(map));
  }
  window.dispatchEvent(new Event('timer-state-changed'));
}

function upsertPendingSave(save: PendingSave) {
  const all = loadPendingSaves();
  all[save.key] = save;
  writePendingSaves(all);
}

function clearPendingSave(key: string) {
  const all = loadPendingSaves();
  delete all[key];
  writePendingSaves(all);
}

const GlobalActiveTimerBanner: React.FC = () => {
  const location = useLocation();
  const [timers, setTimers] = useState<Map<string, ActiveTimer>>(loadTimersFromStorage);
  const [pendingSaves, setPendingSaves] = useState<Record<string, PendingSave>>(loadPendingSaves);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
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
    const handler = () => {
      setTimers(loadTimersFromStorage());
      setPendingSaves(loadPendingSaves());
    };
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
   * Save the time report to the backend. SAVE-FIRST POLICY:
   *  1. The timer is NOT removed until createTimeReport succeeds.
   *  2. The save is registered as a `pending save` before the network call so
   *     if the app is killed mid-call the user can retry on next open.
   *  3. On failure, the timer (with its original start/end captured here) stays
   *     visible with a "Försök igen" button — no work time is lost.
   *  4. Concurrent saves for the same key are suppressed by `savingKeys`,
   *     preventing double reports from rapid taps.
   */
  const persistStop = useCallback(async (
    save: PendingSave,
  ): Promise<boolean> => {
    if (savingKeys.has(save.key)) {
      // Already in-flight — ignore this call (defensive against double-tap).
      return false;
    }
    setSavingKeys(prev => new Set(prev).add(save.key));

    // Register/refresh the pending save so a kill mid-flight can be recovered.
    upsertPendingSave(save);

    const startTimeDate = parseISO(save.startTimeIso);
    const stopTime = parseISO(save.endTimeIso);

    let totalHours = (stopTime.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
    if (totalHours < 0) totalHours += 24;
    const breakDeduction = totalHours > 5 ? 0.5 : 0;
    const hoursWorked = Math.max(0, Number((totalHours - breakDeduction).toFixed(2)));

    try {
      const tr = await mobileApi.createTimeReport({
        booking_id: save.key.startsWith('project-') ? undefined : save.key,
        report_date: format(stopTime, 'yyyy-MM-dd'),
        start_time: format(startTimeDate, 'HH:mm'),
        end_time: format(stopTime, 'HH:mm'),
        hours_worked: hoursWorked,
        break_time: breakDeduction,
        description: `Timer: ${save.timer.locationName || save.timer.client}${save.timer.establishmentTaskTitle ? ` — ${save.timer.establishmentTaskTitle}` : ''}`,
        establishment_task_id: save.timer.establishmentTaskId,
        large_project_id: save.timer.largeProjectId,
      });

      // SUCCESS: now safe to remove timer and clear pending save.
      deleteTimerFromStorage(save.key);
      clearPendingSave(save.key);

      // Best-effort server-side stop for location timers.
      if (save.timer.locationId) {
        mobileApi.stopLocationTimer({ location_id: save.timer.locationId }).catch(err => {
          console.warn('Failed to stop location timer on server:', err);
        });
      }

      toast.success(`Tidrapport sparad: ${hoursWorked}h`);

      // Optional: anomaly for end-of-day path.
      if (save.endOfDay && save.endOfDay.workDescription) {
        const trId = (tr as any)?.time_report?.id;
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
          // best-effort
        }

        await mobileApi.createEndOfDayAnomaly({
          started_at: save.endOfDay.lastExitIso,
          ended_at: stopTime.toISOString(),
          work_description: save.endOfDay.workDescription,
          end_location_lat: lat,
          end_location_lng: lng,
          location_id: save.endOfDay.locationId || save.timer.locationId || undefined,
          booking_id: save.key.startsWith('project-') ? undefined : save.key,
          large_project_id: save.timer.largeProjectId,
          time_report_id: trId,
        }).catch(err => {
          console.warn('Could not save end-of-day anomaly:', err);
        });
      }

      // Best-effort: close any orphan anomalies covering this work session.
      mobileApi.closeOpenAnomalies({ ended_at: stopTime.toISOString() }).catch(err => {
        console.warn('Failed to close open anomalies on stop:', err);
      });

      return true;
    } catch (err: any) {
      // FAILURE: keep timer visible AND keep the pending save with original end-time
      // so a retry uses the captured end-time, not a fresh "now".
      const message = err?.message || 'Kunde inte spara tidrapport';
      const updated: PendingSave = {
        ...save,
        attempts: save.attempts + 1,
        lastError: message,
      };
      upsertPendingSave(updated);
      toast.error(`${message} — tryck Försök igen för att spara om.`, { duration: 6000 });
      return false;
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(save.key);
        return next;
      });
    }
  }, [savingKeys]);

  const handleStop = useCallback(async (key: string, timer: ActiveTimer) => {
    if (savingKeys.has(key)) return; // double-tap guard

    const stopTime = new Date();
    const startTimeDate = parseISO(timer.startTime);

    // Look up the most recent geofence exit. If the user left the workplace
    // before stopping the timer, ask them to confirm/adjust their end-time.
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
        return; // wait for dialog confirmation
      }
    }

    // Direct save path — timer stays in storage until success.
    await persistStop({
      key,
      timer,
      startTimeIso: timer.startTime,
      endTimeIso: stopTime.toISOString(),
      dedupeId: `${key}:${timer.startTime}:${stopTime.toISOString()}`,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
  }, [persistStop, savingKeys]);

  const handleRetry = useCallback(async (key: string) => {
    const save = loadPendingSaves()[key];
    if (!save) return;
    await persistStop(save);
  }, [persistStop]);

  const handleDialogConfirm = useCallback(async (result: EndOfDayResult) => {
    if (!pendingStop) return;
    const stopTimeIso = result.endedAtIso;

    const ok = await persistStop({
      key: pendingStop.key,
      timer: pendingStop.timer,
      startTimeIso: pendingStop.startTimeDate.toISOString(),
      endTimeIso: stopTimeIso,
      endOfDay: result.usedSuggestedExit
        ? undefined
        : {
            lastExitIso: pendingStop.lastExitIso,
            workDescription: result.workDescription,
            locationId: pendingStop.timer.locationId || null,
          },
      dedupeId: `${pendingStop.key}:${pendingStop.startTimeDate.toISOString()}:${stopTimeIso}`,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    // Close dialog regardless — on failure the timer + retry chip remain in the banner.
    if (ok) setPendingStop(null);
    else setPendingStop(null); // user can retry from the timer banner now
  }, [pendingStop, persistStop]);

  if (location.pathname === '/m/report') return null;

  return (
    <>
      {timers.size > 0 && (
        <div className="px-5 pt-3 space-y-2">
          {Array.from(timers.entries()).map(([key, timer]) => (
            <TimerRow
              key={key}
              timerKey={key}
              timer={timer}
              onStop={handleStop}
              onRetry={handleRetry}
              isSaving={savingKeys.has(key)}
              pendingSave={pendingSaves[key]}
            />
          ))}
        </div>
      )}
      {pendingStop && (
        <EndOfDayStopDialog
          open={!!pendingStop}
          onOpenChange={(open) => {
            if (!open && pendingStop) {
              const stopTimeIso = new Date().toISOString();
              persistStop({
                key: pendingStop.key,
                timer: pendingStop.timer,
                startTimeIso: pendingStop.startTimeDate.toISOString(),
                endTimeIso: stopTimeIso,
                dedupeId: `${pendingStop.key}:${pendingStop.startTimeDate.toISOString()}:${stopTimeIso}`,
                attempts: 0,
                createdAt: new Date().toISOString(),
              });
              setPendingStop(null);
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
  onRetry: (key: string) => void;
  isSaving: boolean;
  pendingSave?: PendingSave;
}> = ({ timerKey, timer, onStop, onRetry, isSaving, pendingSave }) => {
  const elapsed = differenceInSeconds(new Date(), parseISO(timer.startTime));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const isLocation = !!timer.locationId;
  const hasFailedSave = !!pendingSave && !isSaving;

  return (
    <div
      className={`flex flex-col gap-2 p-3 rounded-2xl border ${
        hasFailedSave
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-primary/20 bg-primary/5'
      }`}
    >
      <div className="flex items-center gap-3">
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
        {hasFailedSave ? (
          <Button
            size="sm"
            variant="destructive"
            className="rounded-xl h-9 gap-1 text-xs font-semibold"
            onClick={() => onRetry(timerKey)}
            disabled={isSaving}
          >
            <RotateCw className="w-3 h-3" />
            Försök igen
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            className="rounded-xl h-9 gap-1 text-xs font-semibold"
            onClick={() => onStop(timerKey, timer)}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
            {isSaving ? 'Sparar…' : 'Stop'}
          </Button>
        )}
      </div>
      {hasFailedSave && pendingSave && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Tidrapporten sparades inte</p>
            <p className="text-destructive/80 break-words">
              {pendingSave.lastError} — sparas med slut {format(parseISO(pendingSave.endTimeIso), 'HH:mm')}.
              {pendingSave.attempts > 1 && ` Försök ${pendingSave.attempts}.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalActiveTimerBanner;
