/**
 * ActualDayPanel — visar "så här såg dagen FAKTISKT ut" innan rapportvyn.
 *
 * Strikt sektionsordning enligt actualStaffDayModel-kontraktet:
 *   1. Dagens faktiska händelser   (actualEvents)
 *   2. Nuvarande rapport          (reportState — sammanfattad)
 *   3. Föreslagna korrigeringar    (proposedReport.anomalies + travel)
 *
 * UI:t använder ENDAST semantiska tokens (bg-card, text-muted-foreground,
 * border-destructive/40 osv.) — aldrig hårdkodade hex/Tailwind-färger.
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Activity, MapPin, Plane, Sun, Sunset, Briefcase, Wifi, WifiOff,
  AlertTriangle, ArrowRight, Car, Bot, Clock, CheckCircle2,
} from 'lucide-react';
import { formatHoursMinutes } from '@/utils/formatHours';
import type {
  ActualStaffDayModel,
  ActualEvent,
  ActualEventKind,
} from '@/lib/staff/actualStaffDayModel';

interface ActualDayPanelProps {
  model: ActualStaffDayModel;
}

const ICON_FOR_KIND: Record<ActualEventKind, React.ReactNode> = {
  workday_started: <Sun className="h-3.5 w-3.5" />,
  workday_ended: <Sunset className="h-3.5 w-3.5" />,
  timer_started: <Activity className="h-3.5 w-3.5" />,
  timer_stopped: <Activity className="h-3.5 w-3.5" />,
  time_report_created: <Briefcase className="h-3.5 w-3.5" />,
  time_report_closed: <Briefcase className="h-3.5 w-3.5" />,
  gps_arrival: <MapPin className="h-3.5 w-3.5" />,
  gps_departure: <MapPin className="h-3.5 w-3.5" />,
  gps_visit: <MapPin className="h-3.5 w-3.5" />,
  gps_travel: <Plane className="h-3.5 w-3.5" />,
  assistant_arrival: <Bot className="h-3.5 w-3.5" />,
  assistant_departure: <Bot className="h-3.5 w-3.5" />,
  assistant_other: <Bot className="h-3.5 w-3.5" />,
  travel_suggestion: <Car className="h-3.5 w-3.5" />,
  stale_signal: <WifiOff className="h-3.5 w-3.5" />,
  gps_gap: <WifiOff className="h-3.5 w-3.5" />,
  anomaly: <AlertTriangle className="h-3.5 w-3.5" />,
};

const SEVERITY_CLS: Record<string, string> = {
  info: 'text-muted-foreground',
  success: 'text-primary',
  warning: 'text-amber-700 dark:text-amber-400',
  critical: 'text-destructive',
};

const toHHMM = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
};

const EventRow: React.FC<{ event: ActualEvent }> = ({ event }) => (
  <li className="flex items-start gap-2 text-xs py-1">
    <span className={`shrink-0 mt-0.5 ${SEVERITY_CLS[event.severity] ?? ''}`}>
      {ICON_FOR_KIND[event.kind]}
    </span>
    <span className="tabular-nums text-muted-foreground shrink-0 w-12">
      {toHHMM(event.at)}
    </span>
    <div className="min-w-0 flex-1">
      <div className={`truncate ${event.severity === 'critical' ? 'text-destructive font-medium' : ''}`}>
        {event.label}
        {event.durationMin != null && event.durationMin > 0 && (
          <span className="text-muted-foreground ml-1">· {formatHoursMinutes(event.durationMin / 60)}</span>
        )}
      </div>
      {event.detail && (
        <div className="text-[11px] text-muted-foreground truncate">{event.detail}</div>
      )}
    </div>
  </li>
);

export const ActualDayPanel: React.FC<ActualDayPanelProps> = ({ model }) => {
  const { actualEvents, actualVisits, reportState, proposedReport, signalLost, lastPingAgeMin } = model;

  const wd = reportState.workday;
  const wdMinutes = wd
    ? Math.max(0, Math.round(((wd.ended_at ? new Date(wd.ended_at).getTime() : Date.now()) - new Date(wd.started_at).getTime()) / 60_000))
    : 0;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      {/* ── Headline pills ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="text-sm font-semibold tracking-tight mr-1">Dagens faktiska händelser</h3>
        {wd ? (
          <Badge variant="secondary" className="text-[11px] gap-1">
            <Sun className="h-3 w-3" />
            Arbetsdag {toHHMM(wd.started_at)}–{wd.ended_at ? toHHMM(wd.ended_at) : <span className="text-primary">pågår</span>}
            {' · '}{formatHoursMinutes(wdMinutes / 60)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-700 dark:text-amber-400">
            Ingen arbetsdag registrerad
          </Badge>
        )}
        <Badge variant="outline" className="text-[11px] gap-1">
          <MapPin className="h-3 w-3" /> {actualVisits.length} GPS-vistelse{actualVisits.length === 1 ? '' : 'r'}
        </Badge>
        {signalLost ? (
          <Badge variant="outline" className="text-[11px] gap-1 border-destructive/40 text-destructive">
            <WifiOff className="h-3 w-3" /> Signal tappad ({lastPingAgeMin} min)
          </Badge>
        ) : lastPingAgeMin != null && (
          <Badge variant="outline" className="text-[11px] gap-1">
            <Wifi className="h-3 w-3" /> Senaste ping {lastPingAgeMin} min sedan
          </Badge>
        )}
      </div>

      {/* ── 1. Faktiska händelser (synliga DIREKT, inte bakom debug-toggle) ── */}
      {actualEvents.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Inga händelser registrerade för dagen.</p>
      ) : (
        <ul className="divide-y divide-border/40 max-h-[320px] overflow-y-auto rounded-md bg-muted/20 px-2">
          {actualEvents.map(ev => <EventRow key={ev.id} event={ev} />)}
        </ul>
      )}

      {/* ── 2. Nuvarande rapport (sammanfattning) ── */}
      <div className="rounded-md border bg-muted/10 p-3 space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5" /> Nuvarande rapport
        </div>
        <div className="text-xs flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="text-muted-foreground">Tidrapporter:</span>
          <span className="font-medium">{reportState.timeReports.length}</span>
          <span className="text-muted-foreground">· Lager-/platstimers:</span>
          <span className="font-medium">{reportState.locationEntries.length}</span>
          <span className="text-muted-foreground">· Resor:</span>
          <span className="font-medium">{reportState.travelLogs.length}</span>
          <span className="text-muted-foreground">· Bekräftat fördelad:</span>
          <span className="font-semibold">{formatHoursMinutes(proposedReport.distributedMinutes / 60)}</span>
          {proposedReport.undistributedMinutes > 0 && (
            <>
              <span className="text-muted-foreground">· Ofördelad:</span>
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                {formatHoursMinutes(proposedReport.undistributedMinutes / 60)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── 3. Föreslagna korrigeringar ── */}
      {(proposedReport.anomalies.length > 0 || proposedReport.suggestedTravelMinutes > 0) && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Föreslagna korrigeringar
          </div>
          {proposedReport.suggestedTravelMinutes > 0 && (
            <div className="text-xs flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5 text-primary" />
              <span>Föreslagen restid:</span>
              <span className="font-semibold">{formatHoursMinutes(proposedReport.suggestedTravelMinutes / 60)}</span>
              <span className="text-muted-foreground">· kräver godkännande</span>
            </div>
          )}
          {proposedReport.anomalies.length > 0 && (
            <ul className="space-y-1.5">
              {proposedReport.anomalies.map(a => (
                <li key={a.id} className="text-xs">
                  <div className={`flex items-center gap-1.5 font-medium ${SEVERITY_CLS[a.severity] ?? ''}`}>
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{a.label}</span>
                  </div>
                  {a.detail && <div className="text-muted-foreground pl-4">{a.detail}</div>}
                  {a.suggestion && (
                    <div className="pl-4 text-primary inline-flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" /> {a.suggestion}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── No-anomalies state ── */}
      {proposedReport.anomalies.length === 0 && proposedReport.suggestedTravelMinutes === 0 && (
        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-primary" /> Inga föreslagna korrigeringar.
        </div>
      )}
    </div>
  );
};
