import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  AlertTriangle, CheckCircle2, Loader2, Clock, MapPin,
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
  sessions?: ProjectSession[];      // legacy compat — unused
  latestPingAt?: string | null;     // legacy compat — unused
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

const SEV_BORDER: Record<string, string> = {
  info: 'border-l-muted-foreground/30',
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  critical: 'border-l-destructive',
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

/**
 * DayEventLogRow — admin-vy med händelselogg, tolkning, åtgärdsförslag och
 * notis-historik (frågor systemet ställt + svar) för en personal/dag.
 *
 * Ersätter den gamla "AVVIKELSER (n)"-listan med en strukturerad vy:
 *   1. Händelselogg     — kronologisk timeline
 *   2. Tolkning         — vad GPS säger om dagen
 *   3. Åtgärdsförslag   — konkreta nästa-steg
 *   4. Notiser & svar   — vilka frågor som ställts, när, och vad personen svarade
 */
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

  return (
    <tr className="bg-muted/20 border-b border-border/40">
      {Array.from({ length: leadingCells }).map((_, i) => (
        <td key={`pad-${i}`} className="py-2 px-2"></td>
      ))}
      <td colSpan={contentCols} className="py-3 px-2">
        {/* Owner header — så det alltid är tydligt vems logg detta är */}
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-semibold">
            <Activity className="h-3 w-3" />
            {staffName}
          </span>
          <span className="text-[11px] text-muted-foreground capitalize">
            {fmtDateLong(date)}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT column: Timeline */}
          <EventTimeline events={log.events} />

          {/* RIGHT column: Interpretation + suggestions + notifications */}
          <div className="flex flex-col gap-3">
            <InterpretationPanel items={log.interpretations} />
            <SuggestionPanel items={log.suggestions} />
            <NotificationPanel items={log.notifications} />
          </div>
        </div>
      </td>
    </tr>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents

const SectionHeader: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; count?: number }> = ({ icon: Icon, title, count }) => (
  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
    <Icon className="h-3 w-3" />
    <span>{title}</span>
    {count != null && <span className="text-muted-foreground/70">({count})</span>}
  </div>
);

const EventTimeline: React.FC<{ events: DayEvent[] }> = ({ events }) => {
  if (events.length === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-background/50 p-3">
        <SectionHeader icon={Clock} title="Händelselogg" />
        <p className="text-xs text-muted-foreground mt-2">Inga händelser registrerade.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-background/50 p-3">
      <SectionHeader icon={Clock} title="Händelselogg" count={events.length} />
      <ol className="mt-2 flex flex-col gap-0">
        {events.map((e, i) => {
          const Icon = EVENT_ICON[e.kind] || Clock;
          return (
            <li key={i} className="relative flex items-start gap-2 py-1.5 pl-1">
              {/* dot + connector */}
              <div className="relative flex flex-col items-center pt-1">
                <span className={`h-2 w-2 rounded-full ${SEV_DOT[e.severity]} shrink-0`} />
                {i < events.length - 1 && (
                  <span className="absolute top-3 bottom-[-6px] w-px bg-border" />
                )}
              </div>
              {/* time */}
              <span className="tabular-nums text-[11px] font-mono text-muted-foreground w-[88px] pt-0.5 shrink-0">
                {fmt(e.at)}
                {e.until && <>–{fmt(e.until)}</>}
              </span>
              {/* icon + content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3 w-3 shrink-0 ${SEV_TEXT[e.severity]}`} />
                  <span className={`text-xs font-medium ${e.severity === 'critical' ? 'text-destructive' : 'text-foreground'}`}>
                    {e.label}
                  </span>
                  {e.durationMin != null && e.durationMin > 0 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      ({Math.round(e.durationMin)}m)
                    </span>
                  )}
                </div>
                {e.detail && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {e.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

const InterpretationPanel: React.FC<{ items: DayInterpretation[] }> = ({ items }) => (
  <div className="rounded-md border border-border/60 bg-background/50 p-3">
    <SectionHeader icon={Activity} title="Tolkning" />
    <ul className="mt-2 flex flex-col gap-1.5">
      {items.map((it, i) => (
        <li
          key={i}
          className={`text-xs border-l-2 pl-2 py-0.5 ${SEV_BORDER[it.severity]} ${SEV_TEXT[it.severity]}`}
        >
          {it.text}
        </li>
      ))}
    </ul>
  </div>
);

const SuggestionPanel: React.FC<{ items: DaySuggestion[] }> = ({ items }) => {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-border/60 bg-background/50 p-3">
      <SectionHeader icon={Lightbulb} title="Åtgärdsförslag" count={items.length} />
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((s, i) => (
          <li
            key={i}
            className={`text-xs border-l-2 pl-2 py-1 ${SEV_BORDER[s.severity]}`}
          >
            <div className={`font-medium ${SEV_TEXT[s.severity]}`}>{s.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{s.rationale}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const NotificationPanel: React.FC<{ items: NotificationEntry[] }> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-background/50 p-3">
        <SectionHeader icon={Bell} title="Notiser & svar" />
        <p className="text-xs text-muted-foreground mt-2">
          Inga notiser har skickats till personen denna dag.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border/60 bg-background/50 p-3">
      <SectionHeader icon={Bell} title="Notiser & svar" count={items.length} />
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((n) => (
          <li
            key={n.id}
            className={`text-xs border-l-2 pl-2 py-1 ${SEV_BORDER[n.severity]}`}
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {fmtDateTime(n.at)}
              </span>
              <span className={`font-medium ${SEV_TEXT[n.severity]}`}>
                {n.question}
              </span>
              {n.needsUserInput && !n.resolved && (
                <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold">
                  väntar svar
                </span>
              )}
            </div>
            {n.detail && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{n.detail}</p>
            )}
            {n.resolved && (
              <div className="mt-1 flex items-start gap-1.5 text-[11px]">
                <MessageSquare className="h-3 w-3 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="flex-1">
                  <span className="text-foreground">
                    {n.answer || 'Bekräftad utan kommentar'}
                  </span>
                  <span className="text-muted-foreground">
                    {' · '}
                    {n.answerSource ? ANSWER_SOURCE_LABEL[n.answerSource] || n.answerSource : '—'}
                    {n.resolvedAt && <> · {fmtDateTime(n.resolvedAt)}</>}
                  </span>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
