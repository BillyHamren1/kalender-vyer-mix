import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  CheckCircle2, Loader2, Clock, MapPin,
  LogIn, LogOut, Activity, Bell, MessageSquare,
  Lightbulb, ArrowRight, WifiOff,
} from 'lucide-react';
import { useStaffDayReality } from '@/hooks/useStaffDayReality';
import { useDayWorkdayFlags } from '@/hooks/useDayWorkdayFlags';
import {
  buildDayEventLog,
  type DayEvent, type EventKind,
  type DayInterpretation, type DaySuggestion, type NotificationEntry,
} from '@/lib/staff/dayEventLog';
import type { ProjectSession } from '@/lib/staff/dayJournal';

interface Props {
  staffId: string;
  staffName: string;
  date: string;
  sessions?: ProjectSession[];
  latestPingAt?: string | null;
  leadingCells?: number;
  totalCols?: number;
}

const fmtDateLong = (iso: string) => {
  try { return format(new Date(iso), 'EEEE d MMM', { locale: sv }); } catch { return iso; }
};
const fmt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'HH:mm', { locale: sv }); } catch { return '—'; }
};
const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'd MMM HH:mm', { locale: sv }); } catch { return '—'; }
};

const SEV_TEXT: Record<string, string> = {
  info: 'text-muted-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  critical: 'text-destructive',
};
const SEV_DOT: Record<string, string> = {
  info: 'bg-muted-foreground/40',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-destructive',
};
const SEV_PILL: Record<string, string> = {
  info: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  critical: 'bg-destructive/10 text-destructive',
};

const EVENT_ICON: Record<EventKind, React.ComponentType<{ className?: string }>> = {
  day_start: LogIn,
  day_end: LogOut,
  site_arrived: MapPin,
  site_left: ArrowRight,
  session_start: Activity,
  session_end: CheckCircle2,
  gps_gap: WifiOff,
  travel: ArrowRight,
  still_on_site: Clock,
};

const ANSWER_SOURCE_LABEL: Record<string, string> = {
  staff: 'Personal',
  admin: 'Admin',
  auto: 'System (auto)',
};

export const StaffDaySummaryRow: React.FC<Props> = ({
  staffId, staffName, date,
  leadingCells = 1, totalCols = 6,
}) => {
  const { data: reality, isLoading: realityLoading } = useStaffDayReality(staffId, date);
  const { data: rawFlags = [], isLoading: flagsLoading } = useDayWorkdayFlags(staffId, date);

  const log = useMemo(
    () => buildDayEventLog(reality, rawFlags),
    [reality, rawFlags],
  );

  const contentCols = totalCols - leadingCells;
  const isLoading = realityLoading || flagsLoading;

  if (isLoading) {
    return (
      <tr className="bg-muted/20 border-b border-border/40">
        {Array.from({ length: leadingCells }).map((_, i) => (
          <td key={`pad-${i}`} className="py-2 px-2"></td>
        ))}
        <td colSpan={contentCols} className="py-2 px-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Bygger händelselogg för {staffName}…
          </div>
        </td>
      </tr>
    );
  }

  if (!reality) return null;

  const criticalCount = log.interpretations.filter(i => i.severity === 'critical').length
    + log.suggestions.filter(s => s.severity === 'critical').length;
  const warningCount = log.interpretations.filter(i => i.severity === 'warning').length
    + log.suggestions.filter(s => s.severity === 'warning').length;
  const pendingNotifs = log.notifications.filter(n => n.needsUserInput && !n.resolved).length;

  return (
    <tr className="bg-muted/20 border-b border-border/40">
      {Array.from({ length: leadingCells }).map((_, i) => (
        <td key={`pad-${i}`} className="py-2 px-2"></td>
      ))}
      <td colSpan={contentCols} className="py-3 px-3">
        {/* Header bar — namn + datum + KPI-pills, full bredd */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-semibold">
              <Activity className="h-3 w-3" />
              {staffName}
            </span>
            <span className="text-[11px] text-muted-foreground capitalize">
              {fmtDateLong(date)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Pill icon={Clock} label={`${log.events.length} händelser`} tone="info" />
            {warningCount > 0 && <Pill icon={Lightbulb} label={`${warningCount} att granska`} tone="warning" />}
            {criticalCount > 0 && <Pill icon={Lightbulb} label={`${criticalCount} kritiska`} tone="critical" />}
            <Pill icon={Bell} label={pendingNotifs > 0 ? `${pendingNotifs} väntar svar` : `${log.notifications.length} notiser`} tone={pendingNotifs > 0 ? 'warning' : 'info'} />
          </div>
        </div>

        {/* 4-kolumns layout som matchar resten av appen */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <CompactCard icon={Clock} title="Händelselogg" count={log.events.length}>
            <EventTimeline events={log.events} />
          </CompactCard>

          <CompactCard icon={Activity} title="Tolkning" count={log.interpretations.length}>
            <InterpretationList items={log.interpretations} />
          </CompactCard>

          <CompactCard icon={Lightbulb} title="Åtgärdsförslag" count={log.suggestions.length}>
            <SuggestionList items={log.suggestions} />
          </CompactCard>

          <CompactCard icon={Bell} title="Notiser & svar" count={log.notifications.length}>
            <NotificationList items={log.notifications} />
          </CompactCard>
        </div>
      </td>
    </tr>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const Pill: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; tone: 'info' | 'success' | 'warning' | 'critical' }> = ({ icon: Icon, label, tone }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${SEV_PILL[tone]}`}>
    <Icon className="h-3 w-3" />
    {label}
  </span>
);

const CompactCard: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; count?: number; children: React.ReactNode }> = ({ icon: Icon, title, count, children }) => (
  <div className="rounded-md border border-border/60 bg-background/60 p-2.5 flex flex-col min-h-0">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2 pb-1.5 border-b border-border/40">
      <Icon className="h-3 w-3" />
      <span>{title}</span>
      {count != null && <span className="text-muted-foreground/60 ml-auto tabular-nums">{count}</span>}
    </div>
    <div className="max-h-[260px] overflow-y-auto pr-1 -mr-1">
      {children}
    </div>
  </div>
);

const EventTimeline: React.FC<{ events: DayEvent[] }> = ({ events }) => {
  if (events.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Inga händelser registrerade.</p>;
  }
  return (
    <ol className="flex flex-col gap-0">
      {events.map((e, i) => {
        const Icon = EVENT_ICON[e.kind] || Clock;
        return (
          <li key={i} className="relative flex items-start gap-1.5 py-1">
            <div className="relative flex flex-col items-center pt-1">
              <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[e.severity]} shrink-0`} />
              {i < events.length - 1 && (
                <span className="absolute top-2.5 bottom-[-4px] w-px bg-border" />
              )}
            </div>
            <span className="tabular-nums text-[10px] font-mono text-muted-foreground w-[68px] pt-0.5 shrink-0">
              {fmt(e.at)}
              {e.until && <>–{fmt(e.until)}</>}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <Icon className={`h-3 w-3 shrink-0 ${SEV_TEXT[e.severity]}`} />
                <span className={`text-[11px] font-medium truncate ${e.severity === 'critical' ? 'text-destructive' : 'text-foreground'}`}>
                  {e.label}
                </span>
                {e.durationMin != null && e.durationMin > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                    {Math.round(e.durationMin)}m
                  </span>
                )}
              </div>
              {e.detail && (
                <p className="text-[10px] text-muted-foreground/80 truncate">{e.detail}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const InterpretationList: React.FC<{ items: DayInterpretation[] }> = ({ items }) => {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground">Inga tolkningar.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
          <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[it.severity]} shrink-0 mt-1.5`} />
          <span className={SEV_TEXT[it.severity]}>{it.text}</span>
        </li>
      ))}
    </ul>
  );
};

const SuggestionList: React.FC<{ items: DaySuggestion[] }> = ({ items }) => {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground">Inga förslag.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((s, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[s.severity]} shrink-0 mt-1.5`} />
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium ${SEV_TEXT[s.severity]}`}>{s.label}</div>
            <div className="text-[10px] text-muted-foreground leading-snug">{s.rationale}</div>
          </div>
        </li>
      ))}
    </ul>
  );
};

const NotificationList: React.FC<{ items: NotificationEntry[] }> = ({ items }) => {
  if (items.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Inga notiser denna dag.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((n) => (
        <li key={n.id} className="flex items-start gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[n.severity]} shrink-0 mt-1.5`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="tabular-nums text-[10px] text-muted-foreground">{fmtDateTime(n.at)}</span>
              <span className={`text-[11px] font-medium ${SEV_TEXT[n.severity]}`}>{n.question}</span>
              {n.needsUserInput && !n.resolved && (
                <span className="text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold">väntar svar</span>
              )}
            </div>
            {n.detail && <p className="text-[10px] text-muted-foreground/80 leading-snug">{n.detail}</p>}
            {n.resolved && (
              <div className="mt-0.5 flex items-start gap-1 text-[10px]">
                <MessageSquare className="h-2.5 w-2.5 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="flex-1">
                  <span className="text-foreground">{n.answer || 'Bekräftad utan kommentar'}</span>
                  <span className="text-muted-foreground">
                    {' · '}{n.answerSource ? ANSWER_SOURCE_LABEL[n.answerSource] || n.answerSource : '—'}
                    {n.resolvedAt && <> · {fmtDateTime(n.resolvedAt)}</>}
                  </span>
                </div>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};
