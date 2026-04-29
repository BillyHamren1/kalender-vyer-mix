import React, { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Briefcase, Car, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { LiveDuration } from './LiveDuration';
import { formatHoursMinutes } from '@/utils/formatHours';
import { StaffPingDetailPanel } from './StaffPingDetailPanel';
import type { DayHeader, ProjectSession } from '@/lib/staff/dayJournal';

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

interface DayHeaderRowProps {
  variant: 'start' | 'end';
  header: DayHeader;
  totalHours?: number;
  staffId: string;
  date: string;
}

/**
 * Bold rubric-style row marking the start or end of the work day.
 * No color — just typography.
 */
export const DayHeaderRow: React.FC<DayHeaderRowProps> = ({
  variant, header, totalHours, staffId, date,
}) => {
  const [showMap, setShowMap] = useState(false);
  const title = variant === 'start' ? 'DAGEN STARTADE' : (header.isOpen ? 'PÅGÅR' : 'DAGEN AVSLUTADES');

  return (
    <div
      className={`border-y border-border/80 py-2 ${variant === 'start' ? 'mt-1' : 'mt-2'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-foreground/70">
            {title}
          </span>
          <span className="font-bold text-sm tabular-nums text-foreground">
            {variant === 'end' && header.isOpen ? '—' : fmt(header.at)}
          </span>
        </div>
        {variant === 'end' && totalHours != null && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Totalt</div>
            <div className="font-bold text-sm tabular-nums text-foreground">
              {formatHoursMinutes(totalHours)}
            </div>
          </div>
        )}
      </div>

      {header.address && (
        <button
          type="button"
          className="mt-0.5 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 group"
          onClick={(e) => { e.stopPropagation(); setShowMap(s => !s); }}
        >
          <MapPin className="h-3 w-3" />
          <span className="truncate">{header.address}</span>
          <span className="text-[10px] opacity-60 group-hover:opacity-100">
            {showMap ? 'dölj karta' : 'öppna karta'}
          </span>
        </button>
      )}

      {showMap && header.at && (
        <div className="mt-1.5">
          <StaffPingDetailPanel
            staffId={staffId}
            staffName=""
            date={date}
            fromIso={header.at}
            toIso={header.at}
          />
        </div>
      )}
    </div>
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

  return (
    <div className="ml-3 border-l border-border pl-3">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="w-full flex items-center justify-between gap-3 py-1.5 text-left hover:bg-muted/30 rounded-sm pr-2"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-sm text-foreground truncate font-medium">
              {session.label || 'Projekt'}
            </div>
            {session.address && (
              <div className="text-[11px] text-muted-foreground truncate inline-flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {session.address}
              </div>
            )}
          </div>
        </div>

        <div className="text-right shrink-0 tabular-nums">
          <div className="text-xs text-muted-foreground">
            {fmt(session.start)} → {session.isOpen
              ? <span className="text-foreground font-medium">pågår</span>
              : fmt(session.end)}
          </div>
          <div className="text-xs font-semibold text-foreground">
            {session.isOpen ? (
              <LiveDuration startedAt={session.start} />
            ) : (
              formatHoursMinutes(session.hours)
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="pb-2">
          <StaffPingDetailPanel
            staffId={staffId}
            staffName={staffName}
            date={date}
            fromIso={session.start}
            toIso={session.end}
          />
        </div>
      )}
    </div>
  );
};

interface MovementFlagRowProps {
  start: string;
  end: string | null;
  address: string | null;
  distanceMeters: number;
  baseAddress: string | null;
}

/** Only row in the journal that uses warning color. */
export const MovementFlagRow: React.FC<MovementFlagRowProps> = ({
  start, end, address, distanceMeters, baseAddress,
}) => {
  return (
    <div className="ml-6 border-l-2 border-destructive/60 pl-3 py-1">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 text-destructive font-medium">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">
            Förflyttning · {address || `${distanceMeters}m från bas`}
            {baseAddress && (
              <span className="text-muted-foreground font-normal"> ({distanceMeters}m från {baseAddress})</span>
            )}
          </span>
        </div>
        <div className="text-right tabular-nums text-muted-foreground shrink-0">
          {fmt(start)} → {end ? fmt(end) : 'pågår'}
        </div>
      </div>
    </div>
  );
};
