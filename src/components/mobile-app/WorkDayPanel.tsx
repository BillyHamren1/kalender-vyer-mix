import React, { useEffect, useMemo, useState } from 'react';
import { differenceInSeconds, parseISO, format, isSameDay } from 'date-fns';
import {
  Sun,
  Play,
  Square,
  Loader2,
  Activity,
  Pause,
  CheckCircle2,
  Repeat,
  Plane,
  Briefcase,
  Eye,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useWorkDay } from '@/hooks/useWorkDay';
import { useGeofencingContextOptional } from '@/contexts/GeofencingContext';
import { useActiveDayState } from '@/hooks/useActiveDayState';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { clearWorkdayEnded } from '@/services/workdayState';
import StartDayDialog, { type StartDaySelection } from './StartDayDialog';
import { mobileApi } from '@/services/mobileApiService';

/**
 * WorkDayPanel — den enda synliga "huvud-timer"-ytan i Tidappen.
 *
 * UNIFIED MODEL:
 *   • Endast arbetsdagstimern rullar synligt.
 *   • Aktivt projekt/plats/resa visas som status-label, inte egen klocka.
 *   • Tre tydliga states: ej startad / pågår / avslutad idag.
 *
 * Monteras högst upp på startsidan (/m/jobs). Andra komponenter
 * (WorkDayHeaderTimer, GlobalActiveTimerBanner) lever vidare för
 * cross-page-status, men detta är den primära panelen.
 */
const formatHMS = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatTotal = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
};

const getActivityLabel = (timer?: {
  locationName?: string;
  client?: string;
  establishmentTaskTitle?: string;
}): string => {
  if (!timer) return 'Ej fördelat';
  return (
    timer.establishmentTaskTitle ||
    timer.locationName ||
    timer.client ||
    'Aktivitet'
  );
};

export const WorkDayPanel: React.FC = () => {
  const navigate = useNavigate();
  const { current, start } = useWorkDay();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const geo = useGeofencingContextOptional();
  const { state: activeDayState } = useActiveDayState();
  const { requestStart } = useTimerStartFlow(bookings, staff?.id);

  const [, setTick] = useState(0);
  const [starting, setStarting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const workdayOpen = !!current && !current.ended_at;
  const startIso = current?.started_at ?? null;
  const endedIso = current?.ended_at ?? null;
  const endedToday =
    !!endedIso && !!startIso && isSameDay(parseISO(endedIso), new Date());

  // 1Hz tick only when workday is running.
  useEffect(() => {
    if (!workdayOpen) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [workdayOpen]);

  const elapsedSeconds = useMemo(() => {
    if (!startIso || !workdayOpen) return 0;
    return Math.max(0, differenceInSeconds(new Date(), parseISO(startIso)));
  }, [startIso, workdayOpen]);

  const totalSeconds = useMemo(() => {
    if (!startIso || !endedIso) return 0;
    return Math.max(0, differenceInSeconds(parseISO(endedIso), parseISO(startIso)));
  }, [startIso, endedIso]);

  // Active activity (project/location/booking) — used as a status label.
  const activeTimer = useMemo(() => {
    if (geo?.activeTimers && geo.activeTimers.size > 0) {
      const first = geo.activeTimers.values().next().value as
        | {
            locationName?: string;
            client?: string;
            establishmentTaskTitle?: string;
            largeProjectId?: string;
          }
        | undefined;
      if (first) return first;
    }
    const serverEntry = activeDayState?.open_entries?.[0];
    if (serverEntry) return { locationName: serverEntry.target_label };
    return null;
  }, [geo?.activeTimers, activeDayState?.open_entries]);

  // Locations that may show as projects (eg. Lager) — surfaced in the dialog.
  const startDayLocations = useMemo(
    () =>
      (geo?.orgLocations ?? [])
        .filter((loc: any) => loc.show_as_project === true)
        .map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          address: loc.address ?? null,
        })),
    [geo?.orgLocations],
  );

  /* ============================================================
   * Handlers
   * ============================================================ */

  const handleStartDay = async () => {
    if (starting || workdayOpen) return;
    // Open the picker so the user can choose project/location explicitly.
    setDialogOpen(true);
  };

  const handleDialogConfirm = async (selection: StartDaySelection) => {
    setStarting(true);
    try {
      clearWorkdayEnded();
      if (selection.kind === 'target') {
        const result = await requestStart(selection.target, {
          label: selection.label,
          startedAtIso: selection.startedAtIso,
        });
        if (result === 'started' || result === 'already_running') {
          toast.success(`Arbetsdag startad på ${selection.label}`);
          setDialogOpen(false);
        } else if (result === 'conflict') {
          setDialogOpen(false);
        }
        return;
      }
      // Presence-only — workday startar utan projekt; geofence/backend
      // kopplar projekt/plats automatiskt på arbetsplats.
      if (selection.kind === 'presence') {
        const wd = await start(selection.startedAtIso ? { startedAtIso: selection.startedAtIso } : {});
        if (!wd) {
          toast.error('Kunde inte starta arbetsdagen. Försök igen.');
          return;
        }
        toast.success('Arbetsdag startad. Plats moniteras.');
        setDialogOpen(false);
        return;
      }
      // Manual text → start workday only + flag.
      const wd = await start(selection.startedAtIso ? { startedAtIso: selection.startedAtIso } : {});
      if (!wd) {
        toast.error('Kunde inte starta arbetsdagen. Försök igen.');
        return;
      }
      try {
        await mobileApi.createWorkdayFlag({
          flag_type: 'unclear_start_target',
          flag_date: new Date().toISOString().slice(0, 10),
          title: 'Oklart startprojekt',
          description: selection.text,
          severity: 'warning',
          needs_user_input: false,
          context: { entered_text: selection.text, source: 'workday_panel_manual', startedAtIso: selection.startedAtIso ?? null },
        });
      } catch (err) {
        console.warn('[WorkDayPanel] createWorkdayFlag failed (non-fatal):', err);
      }
      toast.success('Arbetsdag startad. Arbetsledare kopplar projekt åt dig.');
      setDialogOpen(false);
    } finally {
      setStarting(false);
    }
  };

  const handleSwitchProject = () => {
    setDialogOpen(true);
  };

  const handleEndDay = () => {
    // Re-uses the existing end-day flow handled by GlobalActiveTimerBanner.
    window.dispatchEvent(new CustomEvent('request-end-day'));
  };

  /* ============================================================
   * Render
   * ============================================================ */

  // STATE 3 — Workday ended today
  if (!workdayOpen && endedToday) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-md">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Arbetsdag avslutad
          </span>
        </div>
        <div className="text-2xl font-extrabold tracking-tight text-foreground">
          {format(parseISO(startIso!), 'HH:mm')}–{format(parseISO(endedIso!), 'HH:mm')}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Totalt <span className="font-semibold text-foreground">{formatTotal(totalSeconds)}</span>
        </p>
        <button
          onClick={() => navigate('/m/report')}
          className="mt-4 w-full h-12 rounded-2xl bg-secondary text-secondary-foreground font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
        >
          <Eye className="w-4 h-4" />
          Visa min dag
        </button>
      </div>
    );
  }

  // STATE 1 — Workday not started
  if (!workdayOpen) {
    return (
      <>
        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-md text-center">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-2xl bg-primary/10 mb-3">
            <Sun className="w-6 h-6 text-primary" />
          </div>
          <p className="text-base font-bold text-foreground">Arbetsdag ej startad</p>
          <p className="text-xs text-muted-foreground mt-1">
            Starta dagen och välj var du börjar.
          </p>
          <button
            onClick={handleStartDay}
            disabled={starting}
            className="mt-5 w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-all disabled:opacity-60"
          >
            {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
            {starting ? 'Startar…' : 'Starta arbetsdag'}
          </button>
        </div>
        <StartDayDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onConfirm={handleDialogConfirm}
          bookings={bookings}
          locations={startDayLocations}
          starting={starting}
        />
      </>
    );
  }

  // STATE 2 — Workday in progress
  return (
    <>
      <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-lg ring-1 ring-primary/10">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Sun className="w-4 h-4 text-primary" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              Arbetsdag pågår
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">
            Startad {format(parseISO(startIso!), 'HH:mm')}
          </span>
        </div>

        {/* Big clock */}
        <div className="text-center py-2">
          <div className="font-mono font-extrabold text-5xl tabular-nums tracking-tight text-foreground leading-none">
            {formatHMS(elapsedSeconds)}
          </div>
        </div>

        {/* Activity status */}
        <div className="mt-5 rounded-2xl border border-border/60 bg-background/60 p-3.5">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Tid registreras just nu på
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            {activeTimer ? (
              <Activity className="w-4 h-4 text-primary shrink-0" />
            ) : (
              <Pause className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <p
              className={cn(
                'text-base font-bold truncate',
                activeTimer ? 'text-foreground' : 'text-muted-foreground italic',
              )}
            >
              {getActivityLabel(activeTimer || undefined)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={handleSwitchProject}
            className="h-11 rounded-2xl bg-secondary text-secondary-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            {activeTimer ? <Repeat className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
            {activeTimer ? 'Byt projekt' : 'Välj projekt'}
          </button>
          <button
            onClick={() => {
              // Travel/övrigt registreras enklast via /m/report tills vi har
              // dedikerade flows. Här tar vi användaren rakt dit.
              navigate('/m/report');
            }}
            className="h-11 rounded-2xl bg-secondary text-secondary-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
            title="Markera resa eller övrigt arbete"
          >
            <Plane className="w-4 h-4" />
            Resa / övrigt
          </button>
        </div>

        <button
          onClick={handleEndDay}
          className="mt-2 w-full h-12 rounded-2xl border border-destructive/40 bg-destructive/5 text-destructive font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
        >
          <Square className="w-4 h-4" />
          Avsluta arbetsdag
        </button>
      </div>

      <StartDayDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDialogConfirm}
        bookings={bookings}
        locations={startDayLocations}
        starting={starting}
      />
    </>
  );
};

export default WorkDayPanel;
