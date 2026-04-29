import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Briefcase, Car, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { LiveDuration } from './LiveDuration';
import { formatHoursMinutes } from '@/utils/formatHours';
import { DayFactsPanel } from './DayFactsPanel';
import type { DayHeader, ProjectSession } from '@/lib/staff/dayJournal';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { computeWorkPresence, combineDayPresence } from '@/lib/staff/workPresence';

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

interface JournalRowProps {
  icon: React.ElementType;
  title: string;
  bold?: boolean;
  address: string | null;
  time: string;
  duration: React.ReactNode;
  comment?: string | null;
  /** Inline secondary line shown under the title row — for "Anlände 06:42 · Rapport startad 06:51" etc. */
  detail?: React.ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  indent?: boolean;
  warning?: boolean;
  children?: React.ReactNode;
}

const JournalRow: React.FC<JournalRowProps> = ({
  icon: Icon, title, bold, address, time, duration, comment, detail,
  expandable, expanded, onToggle, indent, warning, children,
}) => {
  const titleClass = bold
    ? 'font-bold text-sm text-foreground'
    : 'text-sm text-foreground';

  const Wrapper: any = expandable ? 'button' : 'div';
  const wrapperProps = expandable
    ? { type: 'button', onClick: (e: any) => { e.stopPropagation(); onToggle?.(); } }
    : {};

  return (
    <div className={indent ? 'ml-5' : ''}>
      <Wrapper
        {...wrapperProps}
        className={`w-full grid grid-cols-[16px_16px_1fr_auto_auto] gap-2 items-center py-1.5 px-1 text-left ${
          expandable ? 'hover:bg-muted/40 rounded-sm' : ''
        }`}
      >
        <span className="flex items-center justify-center">
          {expandable ? (
            expanded
              ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : null}
        </span>

        <Icon className={`h-3.5 w-3.5 shrink-0 ${warning ? 'text-destructive' : 'text-muted-foreground'}`} />

        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`${titleClass} truncate ${warning ? 'text-destructive' : ''}`}>
              {title}
            </span>
            {address && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                <MapPin className="h-2.5 w-2.5" />
                <span className="truncate">{address}</span>
              </span>
            )}
            {comment && (
              <span className="text-[11px] text-muted-foreground italic truncate">
                · {comment}
              </span>
            )}
          </div>
          {detail && (
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {detail}
            </div>
          )}
        </div>

        <div className={`text-xs tabular-nums shrink-0 ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          {time}
        </div>

        <div className={`text-xs tabular-nums shrink-0 min-w-[52px] text-right ${bold ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
          {duration}
        </div>
      </Wrapper>

      {expanded && children && (
        <div className="ml-6 pb-1.5">{children}</div>
      )}
    </div>
  );
};

// ─── Day header (Dagen startade / avslutades) ─────────────────────────────

interface DayHeaderRowProps {
  variant: 'start' | 'end';
  header: DayHeader;
  totalHours?: number;
  staffId: string;
  date: string;
  /** All sessions for the day — used to derive arrival/departure across the
   *  whole day so the rubric shows the union of presence windows. */
  sessions?: ProjectSession[];
}

export const DayHeaderRow: React.FC<DayHeaderRowProps> = ({
  variant, header, totalHours, staffId, date, sessions = [],
}) => {
  const [expanded, setExpanded] = useState(false);
  const isStart = variant === 'start';
  const title = isStart ? 'Dagen startade' : (header.isOpen ? 'Pågår' : 'Dagen avslutades');
  const Icon = isStart ? LogIn : LogOut;

  // Lazy: only fetch pings when the row is expanded OR when we have sessions
  // to derive a presence summary from. We always want the inline summary, so
  // enable=true if sessions exist.
  const wantPings = sessions.length > 0 || expanded;
  const { data: pings = [] } = useStaffPingsForDay(staffId, date, wantPings);

  const presence = useMemo(() => {
    if (!pings.length || !sessions.length) return null;
    const perSession = sessions
      .filter(s => s.kind !== 'travel')
      .map(s => computeWorkPresence(pings, s.start, s.end));
    return combineDayPresence(perSession);
  }, [pings, sessions]);

  const reportedTime = isStart
    ? fmt(header.at)
    : (header.isOpen ? '—' : fmt(header.at));

  // Inline detail: actual arrival/departure vs reported start/end.
  const detail = useMemo(() => {
    if (!presence) return null;
    if (isStart) {
      if (!presence.arrivedAt) return null;
      const arr = fmt(presence.arrivedAt);
      if (!header.at) return <>Anlände {arr} (GPS)</>;
      const diff = minutesBetween(presence.arrivedAt, header.at); // positive = report later than arrival
      if (Math.abs(diff) < 2) return <>Anlände {arr} · matchar rapport</>;
      const sign = diff > 0 ? `+${diff}` : `${diff}`;
      return <>Anlände <strong className="text-foreground">{arr}</strong> · rapport startad {fmt(header.at)} ({sign} min)</>;
    }
    if (header.isOpen) return null;
    if (!presence.leftAt) return null;
    const lft = fmt(presence.leftAt);
    if (!header.at) return <>Lämnade {lft} (GPS)</>;
    const diff = minutesBetween(presence.leftAt, header.at); // positive = report stretched after departure
    if (Math.abs(diff) < 2) return <>Lämnade {lft} · matchar rapport</>;
    const sign = diff > 0 ? `+${diff}` : `${diff}`;
    const cls = Math.abs(diff) >= 15 ? 'text-destructive font-medium' : '';
    return <>Lämnade <strong className={cls || 'text-foreground'}>{lft}</strong> · rapport stängd {fmt(header.at)} ({sign} min)</>;
  }, [presence, header, isStart]);

  const duration = isStart
    ? (header.isOpen ? <LiveDuration startedAt={header.at!} /> : '')
    : (totalHours != null ? formatHoursMinutes(totalHours) : '');

  return (
    <JournalRow
      icon={Icon}
      title={title}
      bold
      address={header.address}
      time={reportedTime}
      duration={duration}
      detail={detail}
      expandable={!!header.at}
      expanded={expanded}
      onToggle={() => setExpanded(s => !s)}
    >
      {header.at && (() => {
        const t = new Date(header.at).getTime();
        const windowMs = 30 * 60 * 1000;
        const reportedStart = new Date(t - windowMs).toISOString();
        const reportedEnd = header.isOpen
          ? null
          : new Date(t + windowMs).toISOString();
        return (
          <DayFactsPanel
            staffId={staffId}
            staffName=""
            date={date}
            reportedStart={reportedStart}
            reportedEnd={reportedEnd}
            baseLabel={header.address}
          />
        );
      })()}
    </JournalRow>
  );
};

// ─── Project / location / travel session rows ─────────────────────────────

interface ProjectSessionRowProps {
  session: ProjectSession;
  staffId: string;
  staffName: string;
  date: string;
}

const sessionIcon = (kind: ProjectSession['kind']) => {
  if (kind === 'travel') return Car;
  if (kind === 'location') return MapPin;
  return Briefcase;
};

export const ProjectSessionRow: React.FC<ProjectSessionRowProps> = ({
  session, staffId, date,
}) => {
  const Icon = sessionIcon(session.kind);

  // Pings are shared across all rows for the day via React Query cache.
  const { data: pings = [] } = useStaffPingsForDay(staffId, date, true);

  const presence = useMemo(() => {
    if (!pings.length || session.kind === 'travel') return null;
    return computeWorkPresence(pings, session.start, session.end);
  }, [pings, session.start, session.end, session.kind]);

  const time = `${fmt(session.start)} – ${session.isOpen ? 'pågår' : fmt(session.end)}`;
  const duration = session.isOpen
    ? <LiveDuration startedAt={session.start} />
    : formatHoursMinutes(session.hours);

  // Inline presence detail under the session title.
  const detail = useMemo(() => {
    if (!presence || (!presence.arrivedAt && !presence.leftAt)) return null;
    const arr = presence.arrivedAt ? fmt(presence.arrivedAt) : '—';
    const lft = presence.leftAt ? fmt(presence.leftAt) : (session.isOpen ? 'pågår' : '—');

    const reportArrDiff = presence.arrivedAt
      ? minutesBetween(presence.arrivedAt, session.start)
      : 0;
    const reportLeftDiff = presence.leftAt && session.end
      ? minutesBetween(presence.leftAt, session.end)
      : 0;
    const flagged = Math.abs(reportArrDiff) >= 15 || Math.abs(reportLeftDiff) >= 15;
    const cls = flagged ? 'text-destructive font-medium' : 'text-foreground';

    return (
      <>
        <span className="text-muted-foreground">På plats:</span>{' '}
        <span className={cls}>{arr} – {lft}</span>
      </>
    );
  }, [presence, session.start, session.end, session.isOpen]);

  return (
    <JournalRow
      icon={Icon}
      title={session.label || 'Projekt'}
      address={session.address}
      time={time}
      duration={duration}
      detail={detail}
      indent
    />
  );
};

// ─── Movement flag ────────────────────────────────────────────────────────

interface MovementFlagRowProps {
  start: string;
  end: string | null;
  address: string | null;
  distanceMeters: number;
  baseAddress: string | null;
}

export const MovementFlagRow: React.FC<MovementFlagRowProps> = ({
  start, end, address, distanceMeters, baseAddress,
}) => {
  const time = `${fmt(start)} – ${end ? fmt(end) : 'pågår'}`;
  return (
    <JournalRow
      icon={AlertTriangle}
      title={`Förflyttning · ${address || `${distanceMeters}m från bas`}`}
      address={baseAddress ? `${distanceMeters}m från ${baseAddress}` : null}
      time={time}
      duration=""
      indent
      warning
    />
  );
};
