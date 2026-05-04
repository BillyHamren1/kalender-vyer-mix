import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  MapPin,
  Plane,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReprocessDayPreviewDialog, type ReprocessChoice } from './ReprocessDayPreviewDialog';
import { toast } from 'sonner';
import type {
  ActualEvent,
  ActualEventKind,
  ActualEventSeverity,
  ActualStaffDayModel,
  ProposedAnomaly,
} from '@/lib/staff/actualStaffDayModel';

/**
 * ActualDayPanel — visar dagen i tre lager:
 *   B. Dagens faktiska händelser (timeline)
 *   C. Nuvarande rapport (kort sammanfattning; full tabell renderas av caller)
 *   D. Föreslagna korrigeringar
 *   E. Åtgärder
 *
 * Header (A) renderas inline överst.
 *
 * Designprincip: Faktisk dag är ALLTID synlig (inte gömd bakom GPS-debug).
 * Rapporttabellen blir "Nuvarande rapport", inte sanningen om dagen.
 */

interface ActualDayPanelProps {
  staffName: string;
  date: string;
  model: ActualStaffDayModel;
  /** Senast kända ping-tid (från staff_locations). */
  lastPingIso: string | null;
  /** Knapp-handlers. Caller får implementera flödena. Optional för stubs. */
  onAdjustWorkday?: () => void;
  onCreateDistributionFromGps?: (visitKey: string) => void;
  onApproveTravelSuggestion?: (travelLogId: string) => void;
  onIgnoreEvent?: (eventId: string) => void;
  onRecomputeDay?: () => void;
  onShowRawGps?: () => void;
  /** Renderas inuti collapse-sektionen "Nuvarande sparad rapport". */
  reportSlot?: React.ReactNode;
  /** Renderas i den gemensamma actionbaren (E). */
  extraActions?: React.ReactNode;
  /** Renderas inuti collapse-sektionen "Rå GPS / debug". */
  rawGpsSlot?: React.ReactNode;
}

const fmtHm = (iso: string) => {
  try {
    return format(new Date(iso), 'HH:mm');
  } catch {
    return iso.slice(11, 16);
  }
};

const fmtMin = (m: number) => {
  if (!m || m < 0) return '0h';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

// ── A. Header status ────────────────────────────────────────────────
type HeaderStatus =
  | 'ok'
  | 'review'
  | 'signal_lost'
  | 'pre_workday'
  | 'missing_report'
  | 'ongoing';

function deriveStatus(model: ActualStaffDayModel): { kind: HeaderStatus; label: string } {
  if (model.signalLost) return { kind: 'signal_lost', label: 'Signal tappad' };
  const wd = model.reportState.workday;
  if (wd && !wd.ended_at) return { kind: 'ongoing', label: 'Pågår' };
  const hasPreWd = model.proposedReport.anomalies.some(a => a.id.startsWith('pre-wd:'));
  if (hasPreWd) return { kind: 'pre_workday', label: 'GPS före arbetsdag' };
  if (wd && model.reportState.timeReports.length === 0 && model.reportState.locationEntries.length === 0) {
    return { kind: 'missing_report', label: 'Saknar rapport' };
  }
  if (model.proposedReport.anomalies.length > 0) return { kind: 'review', label: 'Kräver granskning' };
  if (!wd && (model.actualVisits.length > 0 || model.actualEvents.length > 0)) {
    return { kind: 'missing_report', label: 'Saknar arbetsdag' };
  }
  return { kind: 'ok', label: 'OK' };
}

const statusBadgeClass = (kind: HeaderStatus): string => {
  switch (kind) {
    case 'ok':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
    case 'ongoing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
    case 'signal_lost':
      return 'bg-destructive/15 text-destructive';
    case 'review':
    case 'pre_workday':
    case 'missing_report':
    default:
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
  }
};

// ── B. Event icon/label ─────────────────────────────────────────────
const EventIcon: React.FC<{ kind: ActualEventKind; severity: ActualEventSeverity }> = ({ kind, severity }) => {
  const cls =
    severity === 'critical'
      ? 'text-destructive'
      : severity === 'warning'
        ? 'text-amber-600'
        : severity === 'success'
          ? 'text-emerald-600'
          : 'text-muted-foreground';
  if (kind === 'workday_started' || kind === 'workday_ended') return <Clock className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'gps_arrival' || kind === 'gps_departure' || kind === 'gps_visit') return <MapPin className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'gps_travel' || kind === 'travel_suggestion') return <Plane className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'stale_signal') return <WifiOff className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'anomaly') return <AlertTriangle className={`h-3.5 w-3.5 ${cls}`} />;
  return <Activity className={`h-3.5 w-3.5 ${cls}`} />;
};

const sourceTagFor = (kind: ActualEventKind): string => {
  switch (kind) {
    case 'workday_started':
    case 'workday_ended':
      return 'workday';
    case 'time_report_created':
    case 'time_report_closed':
      return 'time_report';
    case 'timer_started':
    case 'timer_stopped':
      return 'timer';
    case 'gps_arrival':
    case 'gps_departure':
    case 'gps_visit':
      return 'GPS';
    case 'gps_travel':
      return 'GPS/travel';
    case 'travel_suggestion':
      return 'travel_log';
    case 'assistant_arrival':
    case 'assistant_departure':
    case 'assistant_other':
      return 'assistant';
    case 'stale_signal':
    case 'gps_gap':
      return 'GPS';
    case 'anomaly':
      return 'flag';
    default:
      return '—';
  }
};

const statusTagFor = (kind: ActualEventKind, severity: ActualEventSeverity): string => {
  if (kind === 'travel_suggestion') return 'föreslagen';
  if (kind === 'stale_signal' || kind === 'anomaly' || severity === 'critical' || severity === 'warning') return 'osäker';
  return 'bekräftad';
};

// Filtrera duplicerade events: gps_arrival + gps_visit + gps_departure för samma
// vistelse → visa bara visit-raden i kompakt timeline. Användaren kan expandera.
function compactEvents(events: ActualEvent[]): ActualEvent[] {
  return events.filter(e => e.kind !== 'gps_arrival' && e.kind !== 'gps_departure');
}

// ── Komponenten ─────────────────────────────────────────────────────
export const ActualDayPanel: React.FC<ActualDayPanelProps> = ({
  staffName,
  date,
  model,
  lastPingIso,
  onAdjustWorkday,
  onCreateDistributionFromGps,
  onApproveTravelSuggestion,
  onIgnoreEvent,
  onRecomputeDay,
  onShowRawGps,
}) => {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);

  const handleApplyReprocess = (plan: ReprocessChoice[]) => {
    if (onRecomputeDay) {
      onRecomputeDay();
      return;
    }
    // Mutation-pathen finns ännu inte. Visa avsiktslistan så admin ser
    // att förslagen registrerats men att inget skrivits.
    const summary = plan
      .map(p => {
        switch (p.kind) {
          case 'accept_workday_start': return `start → ${p.iso.slice(11, 16)}`;
          case 'accept_workday_end': return `slut → ${p.iso.slice(11, 16)}`;
          case 'create_distribution_from_visit': return 'fördelning från GPS-besök';
          case 'approve_travel': return 'godkänn restid';
          case 'ignore_anomaly': return 'ignorera avvikelse';
          case 'keep_current': return 'behåll nuvarande';
        }
      })
      .join(', ');
    toast.info('Avsikt registrerad', {
      description: `${plan.length} val: ${summary}. Ingen databasskrivning sker innan mutation-pathen byggts.`,
    });
  };

  const status = deriveStatus(model);
  const wd = model.reportState.workday;
  const wdMin = wd
    ? Math.max(0, Math.round(((wd.ended_at ? new Date(wd.ended_at).getTime() : Date.now()) - new Date(wd.started_at).getTime()) / 60_000))
    : 0;

  const events = showAllEvents ? model.actualEvents : compactEvents(model.actualEvents);

  // Föreslagna restider för "Godkänn"-knappar
  const travelSuggestions = model.reportState.travelLogs.filter(
    t => !t.approved && (t.autoDetected || t.source === 'gap_derived'),
  );

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* A. Header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="font-semibold text-sm">{staffName}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{date}</div>
        <div className="text-xs">
          <span className="text-muted-foreground">Arbetsdag </span>
          {wd ? (
            <span className="tabular-nums font-medium text-foreground">
              {fmtHm(wd.started_at)} → {wd.ended_at ? fmtHm(wd.ended_at) : 'pågår'}
            </span>
          ) : (
            <span className="text-amber-600">saknas</span>
          )}
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Lönegrundande </span>
          <span className="tabular-nums font-medium text-foreground">{fmtMin(wdMin)}</span>
        </div>
        <div className="ml-auto">
          <Badge className={`${statusBadgeClass(status.kind)} font-medium`}>{status.label}</Badge>
        </div>
      </div>

      {/* B. Faktiska händelser — alltid synlig */}
      <section className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dagens faktiska händelser
          </h4>
          <button
            type="button"
            onClick={() => setShowAllEvents(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {showAllEvents ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showAllEvents ? 'Visa kompakt' : 'Visa alla händelser'}
          </button>
        </div>
        {events.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-2">
            Inga händelser registrerade för dagen.
          </div>
        ) : (
          <ol className="space-y-1">
            {events.map(ev => (
              <li
                key={ev.id}
                className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-x-2 text-xs py-0.5"
              >
                <span className="tabular-nums text-muted-foreground w-12">
                  {fmtHm(ev.at)}
                  {ev.until ? `–${fmtHm(ev.until)}` : ''}
                </span>
                <EventIcon kind={ev.kind} severity={ev.severity} />
                <span className="text-foreground truncate">
                  {ev.label}
                  {ev.detail ? <span className="text-muted-foreground"> · {ev.detail}</span> : null}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {sourceTagFor(ev.kind)}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wide ${
                    ev.severity === 'critical'
                      ? 'text-destructive'
                      : ev.severity === 'warning'
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                  }`}
                >
                  {statusTagFor(ev.kind, ev.severity)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* C. Nuvarande rapport — kort sammanfattning. Full tabell renderas av caller. */}
      <section className="px-4 py-3 border-b">
        <button
          type="button"
          onClick={() => setReportOpen(v => !v)}
          className="w-full flex items-center justify-between text-xs"
        >
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            Nuvarande rapport
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {reportOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {reportOpen ? 'Dölj' : 'Visa'}
          </span>
        </button>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded border bg-muted/20 px-2 py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground">Workday</div>
            <div className="tabular-nums font-medium">{fmtMin(wdMin)}</div>
            <div className="text-[10px] text-muted-foreground">lönegrundande ram</div>
          </div>
          <div className="rounded border bg-muted/20 px-2 py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground">Fördelad</div>
            <div className="tabular-nums font-medium">{fmtMin(model.proposedReport.distributedMinutes)}</div>
            <div className="text-[10px] text-muted-foreground">time_reports + travel</div>
          </div>
          <div className="rounded border bg-muted/20 px-2 py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground">Ofördelad</div>
            <div
              className={`tabular-nums font-medium ${
                model.proposedReport.undistributedMinutes > 0 ? 'text-amber-600' : ''
              }`}
            >
              {fmtMin(model.proposedReport.undistributedMinutes)}
            </div>
            <div className="text-[10px] text-muted-foreground">workday − fördelad</div>
          </div>
          <div className="rounded border bg-muted/20 px-2 py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground">Föreslagen resa</div>
            <div className="tabular-nums font-medium">{fmtMin(model.proposedReport.suggestedTravelMinutes)}</div>
            <div className="text-[10px] text-muted-foreground">ej godkänd</div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Workday = lönegrundande ram. Time_reports = intern fördelning. LTE = pågående
          aktivitet/timerunderlag. Travel_log = föreslagen eller godkänd fördelning.
        </p>
      </section>

      {/* D. Föreslagna korrigeringar */}
      {model.proposedReport.anomalies.length > 0 && (
        <section className="px-4 py-3 border-b">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Föreslagna korrigeringar
          </h4>
          <ul className="space-y-1.5">
            {model.proposedReport.anomalies.map((a: ProposedAnomaly) => (
              <li
                key={a.id}
                className={`rounded border px-2.5 py-1.5 text-xs ${
                  a.severity === 'critical'
                    ? 'border-destructive/40 bg-destructive/5'
                    : a.severity === 'warning'
                      ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20'
                      : 'border-muted bg-muted/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{a.label}</div>
                    {a.detail ? <div className="text-muted-foreground">{a.detail}</div> : null}
                    {a.suggestion ? (
                      <div className="text-foreground/80 italic mt-0.5">→ {a.suggestion}</div>
                    ) : null}
                  </div>
                  {onIgnoreEvent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onIgnoreEvent(a.id)}
                      className="h-6 px-2 text-[10px]"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Ignorera
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* E. Åtgärder */}
      <section className="px-4 py-3 flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAdjustWorkday}>
          <Clock className="h-3 w-3 mr-1.5" />
          Justera arbetsdag
        </Button>
        {model.actualVisits.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onCreateDistributionFromGps?.(model.actualVisits[0]!.key)}
          >
            <MapPin className="h-3 w-3 mr-1.5" />
            Skapa fördelning från GPS
          </Button>
        )}
        {travelSuggestions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onApproveTravelSuggestion?.(travelSuggestions[0]!.id)}
          >
            <Check className="h-3 w-3 mr-1.5" />
            Godkänn föreslagen restid
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setReprocessOpen(true)}>
          <Activity className="h-3 w-3 mr-1.5" />
          Räkna om dag från GPS + timers
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onShowRawGps}>
          <Eye className="h-3 w-3 mr-1.5" />
          Visa rå GPS
        </Button>
      </section>

      <ReprocessDayPreviewDialog
        open={reprocessOpen}
        onClose={() => setReprocessOpen(false)}
        staffName={staffName}
        date={date}
        model={model}
        onApply={handleApplyReprocess}
      />
    </div>
  );
};
