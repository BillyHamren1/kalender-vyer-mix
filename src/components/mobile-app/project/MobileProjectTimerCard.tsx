import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseISO, format } from 'date-fns';
import { Play, Square, Clock, Loader2, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings, useMobileTimeReports, useInvalidateMobileData } from '@/hooks/useMobileData';
import { useWorkSession } from '@/hooks/useWorkSession';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { TimerConflictDialog } from '@/components/mobile-app/TimerConflictDialog';
import DistanceWarningDialog from '@/components/mobile-app/DistanceWarningDialog';

interface Props {
  largeProjectId: string;
  projectName: string;
}

const formatHours = (h: number) => h.toFixed(1).replace('.', ',');

/**
 * MobileProjectTimerCard
 * ----------------------
 * Det här kortet ger användaren en tydlig timer-yta INNE i ett stort projekt:
 *
 *   • "Pågår nu" — live-räknare för aktiv project-timer (samma key som
 *     GlobalActiveTimerBanner: `project-<id>`).
 *   • "Loggat idag" — summerad hours_worked från time_reports för dagens
 *     datum, för det här stora projektet, för inloggad personal. Filtrerar
 *     bort subdivisions (per-adress-metadata) så summan är samma som
 *     löne-/faktureringssanningen.
 *   • Stor Play / Stop-knapp som går genom samma unified-pipeline som alla
 *     andra startytor (useTimerStartFlow.requestStart + useWorkSession.stopSession).
 *
 * Följer policy:
 *   - workday-first (requestStart säkerställer workday)
 *   - break-dialog mountas via useWorkSession.dialogs
 *   - distance + conflict dialogs mountas här
 *   - subdivisions filtreras bort (project-time-subdivisions-v1)
 */
export const MobileProjectTimerCard = ({ largeProjectId, projectName }: Props) => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { data: timeReports = [] } = useMobileTimeReports();
  const { invalidateTimeReports } = useInvalidateMobileData();
  const { activeTimers, stopSession, dialogs } = useWorkSession(bookings, staff?.id);
  const {
    requestStart,
    cancelConflict,
    confirmSwitch,
    conflictEval,
    pendingLabel,
    distanceWarning,
    dismissDistanceWarning,
  } = useTimerStartFlow(bookings, staff?.id);

  const projectKey = `project-${largeProjectId}`;
  const currentTimer = activeTimers.get(projectKey);
  const [stopping, setStopping] = useState(false);

  // Sum hours_worked logged today on this large project.
  // Subdivisions are metadata only — never sum them or we'd double-count.
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const loggedTodayHours = useMemo(() => {
    return timeReports
      .filter(
        (r: any) =>
          r.large_project_id === largeProjectId &&
          r.report_date === todayKey &&
          !r.is_subdivision,
      )
      .reduce((sum: number, r: any) => sum + (Number(r.hours_worked) || 0), 0);
  }, [timeReports, largeProjectId, todayKey]);

  const liveSeconds = currentTimer
    ? Math.max(0, differenceInSeconds(new Date(), parseISO(currentTimer.startTime)))
    : 0;

  const handleStart = async () => {
    await requestStart(
      { kind: 'project', largeProjectId, name: projectName },
      { label: projectName },
    );
  };

  const handleStop = async () => {
    if (!currentTimer || stopping) return;
    setStopping(true);
    try {
      const res = await stopSession({
        kind: 'project',
        largeProjectId,
        name: projectName,
      });
      if (res.cancelled) return;
      if (res.saved) {
        invalidateTimeReports();
        const hours = res.hoursWorked ?? 0;
        toast.success(
          hours > 0
            ? `Tidrapport sparad: ${formatHours(hours)} h`
            : 'Timern stoppad',
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte stoppa timer');
    } finally {
      setStopping(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border bg-card p-4 shadow-md transition-all',
          currentTimer
            ? 'border-primary/40 ring-1 ring-primary/20'
            : 'border-primary/20',
        )}
      >
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Tidrapportering — projekt
          </span>
        </div>

        {/* UNIFIED MODEL: arbetsdagstimern är enda synliga rullande klocka.
            Här visar vi bara om tiden registreras på projektet just nu. */}
        {currentTimer ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-primary/70 font-bold">
                Tid registreras på projektet
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                {projectName}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Sedan {format(parseISO(currentTimer.startTime), 'HH:mm')}
                {currentTimer.isAutoStarted && ' (automatiskt)'}
              </p>
            </div>
            <button
              onClick={handleStop}
              disabled={stopping}
              className="shrink-0 h-12 px-4 rounded-2xl bg-card border border-destructive/40 text-destructive font-semibold flex items-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-60"
              title="Sluta registrera tid på projektet — arbetsdagen fortsätter"
            >
              {stopping ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              {stopping ? 'Sparar…' : 'Sluta här'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Inte aktiv på projektet
              </p>
              <p className="text-sm text-foreground/70 mt-0.5">
                Tryck för att registrera arbetsdagstid på projektet
              </p>
            </div>
            <button
              onClick={handleStart}
              className="shrink-0 h-14 px-5 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center gap-2 shadow-md active:scale-95 transition-all"
            >
              <Play className="w-5 h-5 ml-0.5" />
              Registrera här
            </button>
          </div>
        )}

        {/* Logged today */}
        <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loggat idag:</span>
          <span className="text-sm font-bold tabular-nums text-foreground">
            {formatHours(loggedTodayHours)} h
          </span>
          {loggedTodayHours > 0 && (
            <button
              onClick={() => navigate('/m/time-history')}
              className="ml-auto text-[11px] font-semibold text-primary active:opacity-70"
            >
              Visa
            </button>
          )}
        </div>
      </div>

      {/* Dialogs — must be mounted in the same tree */}
      <TimerConflictDialog
        open={!!conflictEval}
        evaluation={conflictEval}
        newTargetLabel={pendingLabel}
        onCancel={cancelConflict}
        onSwitch={confirmSwitch}
      />
      <DistanceWarningDialog
        open={!!distanceWarning}
        onOpenChange={(open) => {
          if (!open) dismissDistanceWarning();
        }}
        placeName={distanceWarning?.placeName || ''}
        distanceMeters={distanceWarning?.distance || 0}
        onConfirm={async (reason) => {
          if (!distanceWarning) return false;
          const status = await distanceWarning.onConfirm(reason);
          const ok = status === 'started' || status === 'already_running';
          if (ok) dismissDistanceWarning();
          return ok;
        }}
      />
      {dialogs}
    </>
  );
};

export default MobileProjectTimerCard;
