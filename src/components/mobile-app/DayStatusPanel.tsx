import React, { useMemo, useState } from 'react';
import { differenceInSeconds, parseISO } from 'date-fns';
import {
  Sun, Clock, MapPin, Square, ArrowRightLeft, Pencil, X,
  Loader2, WifiOff, Building2, Briefcase, Truck, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mobileApi, MobileTimeReport } from '@/services/mobileApiService';
import { useActiveDayState, type ActiveDayOpenEntry } from '@/hooks/useActiveDayState';
import { useWorkSession } from '@/hooks/useWorkSession';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { extractUTCTime } from '@/utils/dateUtils';
import { formatHoursMinutes } from '@/utils/formatHours';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Props {
  todayReports: MobileTimeReport[];
  onChanged?: () => void;
}

function useTick(intervalMs = 1000) {
  const [, setT] = useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function statusCopy(entry: ActiveDayOpenEntry): { label: string; tone: 'ok' | 'warn' | 'muted'; Icon: any } {
  switch (entry.status) {
    case 'active_on_site':
      return { label: 'På plats', tone: 'ok', Icon: MapPin };
    case 'active_but_left_site':
      return { label: 'Lämnat platsen', tone: 'warn', Icon: ArrowRightLeft };
    case 'active_signal_lost':
      return { label: 'Signal saknas', tone: 'warn', Icon: WifiOff };
    default:
      // Differentiate booking/project/location
      if (entry.target_kind === 'large_project') return { label: 'På projekt', tone: 'ok', Icon: Briefcase };
      if (entry.target_kind === 'booking') return { label: 'På uppdrag', tone: 'ok', Icon: Briefcase };
      if (entry.target_kind === 'location') return { label: 'På plats', tone: 'ok', Icon: Building2 };
      return { label: 'Aktiv', tone: 'muted', Icon: Clock };
  }
}

const toneClass = (tone: 'ok' | 'warn' | 'muted') =>
  tone === 'ok'
    ? 'text-primary bg-primary/10 border-primary/20'
    : tone === 'warn'
      ? 'text-warning bg-warning/10 border-warning/30'
      : 'text-muted-foreground bg-muted/40 border-border';

export const DayStatusPanel: React.FC<Props> = ({ todayReports, onChanged }) => {
  useTick(1000);
  const { state, refresh } = useActiveDayState();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<null | 'stop' | 'not_work'>(null);
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { stopAny, dialogs: workSessionDialogs } = useWorkSession(bookings, staff?.id);

  const wd = state?.workday;
  const open = state?.open_entries ?? [];
  const primary = open[0] || null;

  // ── Lönegrundande hittills (today's confirmed time_reports + active elapsed) ─
  const reportedMinutes = useMemo(() => {
    return todayReports.reduce((sum, r) => sum + (Number(r.hours_worked || 0) * 60), 0);
  }, [todayReports]);
  const activeMinutes = primary
    ? Math.max(0, Math.floor(differenceInSeconds(new Date(), parseISO(primary.entered_at)) / 60))
    : 0;
  const totalMinutes = Math.round(reportedMinutes + activeMinutes);

  const workdayElapsed = wd?.started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(wd.started_at).getTime()) / 1000))
    : 0;
  const workdayHHMM = wd?.started_at ? extractUTCTime(wd.started_at) : null;

  const pingAgeMin = state?.latest_ping_age_ms != null
    ? Math.floor(state.latest_ping_age_ms / 60000)
    : null;

  const buildTargetForEntry = (entry: ActiveDayOpenEntry) => {
    if (entry.target_kind === 'large_project' && entry.target_id) {
      return { kind: 'project' as const, largeProjectId: entry.target_id, name: entry.target_label };
    }
    if (entry.target_kind === 'booking' && entry.target_id) {
      return { kind: 'booking' as const, bookingId: entry.target_id, client: entry.target_label };
    }
    if (entry.target_kind === 'location' && entry.target_id) {
      return { kind: 'location' as const, locationId: entry.target_id, name: entry.target_label };
    }
    return undefined;
  };

  const handleStop = async () => {
    if (!primary || busy) return;
    setBusy('stop');
    try {
      await stopAny({
        target: buildTargetForEntry(primary),
        serverEntryId: primary.id,
        stopReason: 'day_status_stop',
      });
      toast.success('Timer stoppad');
      await refresh();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte stoppa');
    } finally {
      setBusy(null);
    }
  };

  const handleNotWork = async () => {
    if (!primary || busy) return;
    if (!confirm('Markera som ej arbete? Ingen tidrapport sparas och den öppna posten stängs.')) return;
    setBusy('not_work');
    try {
      await stopAny({
        target: buildTargetForEntry(primary),
        serverEntryId: primary.id,
        skipReport: true,
        stopReason: 'mark_not_work',
      });
      toast.success('Markerat som ej arbete');
      await refresh();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte uppdatera');
    } finally {
      setBusy(null);
    }
  };

  // ── Empty state — no workday at all ─────────────────────────────────
  if (!wd && open.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Idag</p>
        <p className="text-sm text-muted-foreground">
          Ingen arbetsdag startad. Använd "Starta dagen" eller börja en aktivitet.
        </p>
      </section>
    );
  }

  return (
    <>
    <section className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-4">
      {/* Top row — workday + payable */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Arbetsdag</p>
          <p className="font-extrabold text-base text-foreground">
            {workdayHHMM ? `${workdayHHMM} → ` : ''}
            {wd?.ended_at ? extractUTCTime(wd.ended_at) : <span className="text-primary">pågår</span>}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {workdayElapsed > 0
              ? `${Math.floor(workdayElapsed / 3600)}h ${Math.floor((workdayElapsed % 3600) / 60)}m sedan start`
              : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Lönegrundande</p>
          <p className="font-extrabold text-base text-foreground tabular-nums">
            {formatHoursMinutes(totalMinutes / 60)}
          </p>
          <p className="text-[11px] text-muted-foreground">hittills idag</p>
        </div>
      </div>

      {/* Current activity */}
      {primary ? (
        <CurrentActivityCard
          entry={primary}
          busy={busy}
          onStop={handleStop}
          onNotWork={handleNotWork}
          onSwitch={() => navigate('/m/jobs')}
          onCorrect={() => {
            // Open edit on the most recent matching report if any, else scroll to form
            const today = todayReports[0];
            if (today?.id) navigate(`/m/report/${today.id}/edit`);
            else {
              const el = document.getElementById('time-report-form');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              else navigate('/m/report');
            }
          }}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
          Arbetsdag pågår men ingen aktiv aktivitet just nu.
        </div>
      )}

      {/* GPS row */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        {state?.latest_ping ? (
          <span>
            Senaste GPS för {pingAgeMin != null ? `${pingAgeMin} min` : 'okänt'} sedan
            {state.stale_ping ? ' · signal saknas' : ''}
          </span>
        ) : (
          <span>Ingen GPS-position registrerad ännu</span>
        )}
      </div>
    </section>
    {workSessionDialogs}
    </>
  );
};

const CurrentActivityCard: React.FC<{
  entry: ActiveDayOpenEntry;
  busy: 'stop' | 'not_work' | null;
  onStop: () => void;
  onNotWork: () => void;
  onSwitch: () => void;
  onCorrect: () => void;
}> = ({ entry, busy, onStop, onNotWork, onSwitch, onCorrect }) => {
  const { label, tone, Icon } = statusCopy(entry);
  const elapsed = Math.max(0, differenceInSeconds(new Date(), parseISO(entry.entered_at)));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            toneClass(tone),
          )}>
            <Icon className="w-3 h-3" />
            {label}
          </span>
          <p className="mt-1.5 font-bold text-sm text-foreground truncate">{entry.target_label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            sedan {extractUTCTime(entry.entered_at)} · {entry.source || 'manuell'}
            {entry.auto_started ? ' · auto' : ''}
          </p>
        </div>
        <div className="font-mono font-extrabold text-base tabular-nums text-primary shrink-0">
          {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="default"
          className="rounded-xl h-10 gap-1.5 text-xs font-semibold"
          onClick={onStop}
          disabled={!!busy}
        >
          {busy === 'stop' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
          Stoppa timer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl h-10 gap-1.5 text-xs font-semibold"
          onClick={onSwitch}
          disabled={!!busy}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Byt plats/projekt
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl h-10 gap-1.5 text-xs font-semibold"
          onClick={onCorrect}
          disabled={!!busy}
        >
          <Pencil className="w-3.5 h-3.5" />
          Korrigera starttid
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-xl h-10 gap-1.5 text-xs font-semibold text-muted-foreground"
          onClick={onNotWork}
          disabled={!!busy}
        >
          {busy === 'not_work' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Inte arbete
        </Button>
      </div>
    </div>
  );
};

export default DayStatusPanel;
