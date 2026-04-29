import React, { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Briefcase, Car, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { LiveDuration } from './LiveDuration';
import { formatHoursMinutes } from '@/utils/formatHours';
import { StaffPingDetailPanel } from './StaffPingDetailPanel';
import type { DayHeader, ProjectSession } from '@/lib/staff/dayJournal';

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

/**
 * Shared table-row layout for the day journal.
 * Columns: [icon] Beskrivning · Plats (klickbar) · Klockslag · Varaktighet · Kommentar
 * No colors, no badges. Bold = day rubric (start/end). Regular = sub-row.
 */
interface JournalRowProps {
  icon: React.ElementType;
  title: string;
  bold?: boolean;
  address: string | null;
  time: string;
  duration: React.ReactNode;
  comment?: string | null;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  indent?: boolean;
  warning?: boolean;
  children?: React.ReactNode;
}

const JournalRow: React.FC<JournalRowProps> = ({
  icon: Icon, title, bold, address, time, duration, comment,
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
        {/* chevron slot */}
        <span className="flex items-center justify-center">
          {expandable ? (
            expanded
              ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : null}
        </span>

        {/* icon slot */}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${warning ? 'text-destructive' : 'text-muted-foreground'}`} />

        {/* title + address */}
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
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

        {/* time */}
        <div className={`text-xs tabular-nums shrink-0 ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          {time}
        </div>

        {/* duration */}
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

interface DayHeaderRowProps {
  variant: 'start' | 'end';
  header: DayHeader;
  totalHours?: number;
  staffId: string;
  date: string;
}

export const DayHeaderRow: React.FC<DayHeaderRowProps> = ({
  variant, header, totalHours, staffId, date,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isStart = variant === 'start';
  const title = isStart ? 'Dagen startade' : (header.isOpen ? 'Pågår' : 'Dagen avslutades');
  const Icon = isStart ? LogIn : LogOut;

  const time = isStart
    ? fmt(header.at)
    : (header.isOpen ? '—' : fmt(header.at));

  const duration = isStart
    ? (header.isOpen ? <LiveDuration startedAt={header.at} /> : '')
    : (totalHours != null ? formatHoursMinutes(totalHours) : '');

  return (
    <JournalRow
      icon={Icon}
      title={title}
      bold
      address={header.address}
      time={time}
      duration={duration}
      expandable={!!header.at}
      expanded={expanded}
      onToggle={() => setExpanded(s => !s)}
    >
      {header.at && (
        <StaffPingDetailPanel
          staffId={staffId}
          staffName=""
          date={date}
          fromIso={header.at}
          toIso={header.at}
        />
      )}
    </JournalRow>
  );
};

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
  session, staffId, staffName, date,
}) => {
  const [open, setOpen] = useState(false);
  const Icon = sessionIcon(session.kind);

  const time = `${fmt(session.start)} – ${session.isOpen ? 'pågår' : fmt(session.end)}`;
  const duration = session.isOpen
    ? <LiveDuration startedAt={session.start} />
    : formatHoursMinutes(session.hours);

  return (
    <JournalRow
      icon={Icon}
      title={session.label || 'Projekt'}
      address={session.address}
      time={time}
      duration={duration}
      expandable
      expanded={open}
      onToggle={() => setOpen(o => !o)}
      indent
    >
      <StaffPingDetailPanel
        staffId={staffId}
        staffName={staffName}
        date={date}
        fromIso={session.start}
        toIso={session.end}
      />
    </JournalRow>
  );
};

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
