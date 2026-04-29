import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ChevronDown, ChevronRight, MapPin, LogIn, LogOut,
  Briefcase, Car, AlertTriangle, WifiOff,
} from 'lucide-react';
import { LiveDuration } from './LiveDuration';
import { formatHoursMinutes } from '@/utils/formatHours';
import { DayFactsPanel } from './DayFactsPanel';
import { AnalyzeDayButton } from './AnalyzeDayButton';
import type { StaffDayJournal, ProjectSession } from '@/lib/staff/dayJournal';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { computeWorkPresence, combineDayPresence } from '@/lib/staff/workPresence';

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

export type RowKind = 'day-start' | 'day-end' | 'session-booking' | 'session-large' | 'session-location' | 'session-travel';

export interface JournalTableRow {
  staffId: string;
  staffName: string;
  /** True only on the first row of this person — used to render the name cell. */
  isFirstForStaff: boolean;
  rowId: string;
  kind: RowKind;
  description: string;
  address: string | null;
  startIso: string | null;
  endIso: string | null;
  isOpen: boolean;
  hours: number | null;
  /** ISO range to fetch pings for when expanded. */
  fromIso: string | null;
  toIso: string | null;
  /** stale signal warning, only shown for day-end if open + stale */
  stale?: boolean;
  /** ping age in minutes, for stale label */
  pingAgeMin?: number | null;
  /** All sessions for the day — used by day-start/day-end to derive presence union. */
  allSessions?: ProjectSession[];
  /** True for session rows — drives per-row presence detail. */
  sessionStart?: string | null;
  sessionEnd?: string | null;
}

const sessionKindToRowKind = (k: ProjectSession['kind']): RowKind => {
  if (k === 'travel') return 'session-travel';
  if (k === 'location') return 'session-location';
  if (k === 'large_project') return 'session-large';
  return 'session-booking';
};

const rowIcon = (k: RowKind) => {
  switch (k) {
    case 'day-start': return LogIn;
    case 'day-end': return LogOut;
    case 'session-travel': return Car;
    case 'session-location': return MapPin;
    default: return Briefcase;
  }
};

const isBoldRow = (k: RowKind) => k === 'day-start' || k === 'day-end';

/** Flatten a staff journal into table rows. */
export const buildJournalRows = (
  staff: { id: string; name: string; journal: StaffDayJournal; total_hours: number; has_open_report: boolean; latestPing: { updated_at: string | null } | null },
): JournalTableRow[] => {
  const rows: JournalTableRow[] = [];
  const j = staff.journal;
  const allSessions = j.sessions;

  // Helper: widen the ping window around a single timestamp so the expanded
  // panel actually shows pings (was zero-width before, hence "Inga GPS-pings").
  const widen = (iso: string | null, beforeMin = 30, afterMin = 30): { from: string | null; to: string | null } => {
    if (!iso) return { from: null, to: null };
    const t = new Date(iso).getTime();
    return {
      from: new Date(t - beforeMin * 60_000).toISOString(),
      to: new Date(t + afterMin * 60_000).toISOString(),
    };
  };

  // Day start — widen ±30 min around reported start so we can see actual arrival.
  const startWin = widen(j.start.at, 30, 30);
  rows.push({
    staffId: staff.id,
    staffName: staff.name,
    isFirstForStaff: true,
    rowId: `${staff.id}-start`,
    kind: 'day-start',
    description: 'Dagen startade',
    address: j.start.address,
    startIso: j.start.at,
    endIso: j.start.at,
    isOpen: false,
    hours: null,
    fromIso: startWin.from,
    toIso: startWin.to,
    allSessions,
  });

  // Sessions
  for (const s of j.sessions) {
    rows.push({
      staffId: staff.id,
      staffName: staff.name,
      isFirstForStaff: false,
      rowId: `${staff.id}-${s.key}`,
      kind: sessionKindToRowKind(s.kind),
      description: s.label || 'Projekt',
      address: s.address ?? null,
      startIso: s.start,
      endIso: s.end,
      isOpen: s.isOpen,
      hours: s.hours,
      fromIso: s.start,
      toIso: s.end,
      sessionStart: s.start,
      sessionEnd: s.end,
    });
  }

  // Day end
  const STALE_PING_MS = 10 * 60 * 1000;
  const pingAgeMin = staff.latestPing?.updated_at
    ? Math.floor((Date.now() - new Date(staff.latestPing.updated_at).getTime()) / 60000)
    : null;
  const stale = staff.has_open_report && (
    !staff.latestPing?.updated_at ||
    (Date.now() - new Date(staff.latestPing!.updated_at!).getTime()) > STALE_PING_MS
  );

  // Widen end window: 30 min before reported end, until "now" if open.
  const endWin = j.end.isOpen
    ? { from: j.end.at ? new Date(new Date(j.end.at).getTime() - 30 * 60_000).toISOString() : null, to: new Date().toISOString() }
    : widen(j.end.at, 30, 30);

  rows.push({
    staffId: staff.id,
    staffName: staff.name,
    isFirstForStaff: false,
    rowId: `${staff.id}-end`,
    kind: 'day-end',
    description: j.end.isOpen ? 'Pågår' : 'Dagen avslutades',
    address: j.end.address,
    startIso: j.end.at,
    endIso: j.end.at,
    isOpen: j.end.isOpen,
    hours: staff.total_hours,
    fromIso: endWin.from,
    toIso: endWin.to,
    stale,
    pingAgeMin,
    allSessions,
  });

  return rows;
};

interface JournalTableProps {
  rows: JournalTableRow[];
  date: string;
  onSelectStaff: (id: string, name: string) => void;
}

const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

/**
 * Inline GPS-derived "Anlände HH:MM · Lämnade HH:MM" line shown under the
 * description for day-start / day-end / session rows. Uses pings cached via
 * useStaffPingsForDay so multiple rows share the same network call.
 *
 * - For day-start: shows the very first ping near any work site.
 * - For day-end:   shows the very last ping near any work site.
 * - For session rows: shows arrival / departure inside that session window.
 *
 * If the reported start/end differs from GPS by ≥15 min, the value is
 * highlighted in destructive color so the admin can spot the mismatch
 * without clicking or running an AI analysis.
 */


const PresenceLineWithDate: React.FC<{ row: JournalTableRow; date: string }> = ({ row, date }) => {
  const { data: pings = [], isLoading } = useStaffPingsForDay(row.staffId, date, true);

  const result = useMemo(() => {
    if (!pings.length) return null;

    if (row.kind === 'day-start' || row.kind === 'day-end') {
      const sessions = (row.allSessions || []).filter(s => s.kind !== 'travel');
      if (!sessions.length) return null;
      const perSession = sessions.map(s => computeWorkPresence(pings, s.start, s.end));
      const combined = combineDayPresence(perSession);
      const isStart = row.kind === 'day-start';
      const gpsTime = isStart ? combined.arrivedAt : combined.leftAt;
      if (!gpsTime) return null;
      const reported = row.startIso;
      const label = isStart ? 'Anlände' : 'Lämnade';
      if (!reported) return { label, gpsTime, diffMin: null as number | null };
      const diff = isStart
        ? minutesBetween(gpsTime, reported)        // positive = report startade SENARE än ankomst
        : minutesBetween(gpsTime, reported);       // positive = report stängd EFTER faktisk avgång
      return { label, gpsTime, diffMin: diff };
    }

    // Session row
    if (!row.sessionStart) return null;
    const presence = computeWorkPresence(pings, row.sessionStart, row.sessionEnd ?? null);
    if (!presence.arrivedAt && !presence.leftAt) return null;
    return {
      label: 'På plats',
      arrived: presence.arrivedAt,
      left: presence.leftAt,
      basePings: presence.basePings.length,
      sample: presence.sampleCount,
    } as any;
  }, [pings, row]);

  if (isLoading || !result) return null;

  // Day-start / day-end variant
  if (result.label === 'Anlände' || result.label === 'Lämnade') {
    const gps = format(new Date(result.gpsTime), 'HH:mm');
    const diff = result.diffMin;
    if (diff == null) {
      return (
        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
          {result.label} <strong className="text-foreground">{gps}</strong> (GPS)
        </div>
      );
    }
    if (Math.abs(diff) < 2) {
      return (
        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
          {result.label} <strong className="text-foreground">{gps}</strong> · matchar rapport
        </div>
      );
    }
    const sign = diff > 0 ? `+${diff}` : `${diff}`;
    const flagged = Math.abs(diff) >= 15;
    return (
      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
        {result.label}{' '}
        <strong className={flagged ? 'text-destructive' : 'text-foreground'}>{gps}</strong>
        {' · rapport '}{result.label === 'Anlände' ? 'startad' : 'stängd'}{' '}
        {format(new Date(row.startIso!), 'HH:mm')} ({sign} min)
      </div>
    );
  }

  // Session "På plats: HH:MM – HH:MM"
  const arr = result.arrived ? format(new Date(result.arrived), 'HH:mm') : '—';
  const lft = result.left ? format(new Date(result.left), 'HH:mm') : (row.isOpen ? 'pågår' : '—');
  return (
    <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
      På plats: <strong className="text-foreground">{arr} – {lft}</strong>
      <span className="ml-1">({result.basePings}/{result.sample} pings vid bas)</span>
    </div>
  );
};

/**
 * Excel-style flat table: Namn | Beskrivning | Plats | Klockslag | Varaktighet
 * - Name only renders on the first row per person.
 * - Day-start / day-end rows are bold (rubric).
 * - Sessions are normal weight.
 * - Click a row to expand pings inline.
 */
export const JournalTable: React.FC<JournalTableProps> = ({ rows, date, onSelectStaff }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
            <th className="text-left font-semibold py-2 px-2 w-[180px]">Namn</th>
            <th className="text-left font-semibold py-2 px-2">Beskrivning</th>
            <th className="text-left font-semibold py-2 px-2 w-[280px]">Plats</th>
            <th className="text-left font-semibold py-2 px-2 w-[120px]">Klockslag</th>
            <th className="text-right font-semibold py-2 px-2 w-[90px]">Varaktighet</th>
            <th className="w-[80px]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const Icon = rowIcon(r.kind);
            const bold = isBoldRow(r.kind);
            const isOpen = expanded.has(r.rowId);
            const time = r.kind === 'day-end' && r.isOpen
              ? '—'
              : r.kind === 'day-start' || r.kind === 'day-end'
                ? fmt(r.startIso)
                : `${fmt(r.startIso)} – ${r.isOpen ? 'pågår' : fmt(r.endIso)}`;

            const duration = r.hours == null
              ? ''
              : (r.isOpen && r.startIso
                  ? <LiveDuration startedAt={r.startIso} />
                  : formatHoursMinutes(r.hours));

            return (
              <React.Fragment key={r.rowId}>
                <tr
                  className={`border-b border-border/40 hover:bg-muted/30 cursor-pointer ${
                    r.isFirstForStaff ? 'border-t-2 border-t-border' : ''
                  }`}
                  onClick={() => toggle(r.rowId)}
                >
                  {/* Namn — only first row per person */}
                  <td className="py-2 px-2 align-top">
                    {r.isFirstForStaff && (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSelectStaff(r.staffId, r.staffName); }}
                          className="font-semibold text-foreground hover:underline text-left"
                        >
                          {r.staffName}
                        </button>
                        <AnalyzeDayButton staffId={r.staffId} staffName={r.staffName} date={date} />
                      </div>
                    )}
                  </td>

                  {/* Beskrivning */}
                  <td className="py-2 px-2 align-top">
                    <div className="flex flex-col min-w-0 gap-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 flex justify-center text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </span>
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className={`truncate ${bold ? 'font-bold text-foreground' : 'text-foreground'}`}>
                          {r.description}
                        </span>
                        {r.stale && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-destructive font-medium ml-2">
                            <WifiOff className="h-3 w-3" />
                            Tappad signal{r.pingAgeMin != null ? ` · ${r.pingAgeMin}m` : ''}
                          </span>
                        )}
                      </div>
                      <div className="pl-8">
                        <PresenceLineWithDate row={r} date={date} />
                      </div>
                    </div>
                  </td>

                  {/* Plats */}
                  <td className="py-2 px-2 align-top text-muted-foreground">
                    {r.address ? (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{r.address}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>

                  {/* Klockslag */}
                  <td className={`py-2 px-2 align-top tabular-nums ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                    {time}
                  </td>

                  {/* Varaktighet */}
                  <td className={`py-2 px-2 align-top tabular-nums text-right ${bold ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                    {duration}
                  </td>

                  <td className="py-2 px-2"></td>
                </tr>

                {isOpen && r.fromIso && (
                  <tr className="bg-muted/20">
                    <td></td>
                    <td colSpan={5} className="py-2 px-2">
                      <DayFactsPanel
                        staffId={r.staffId}
                        staffName={r.staffName}
                        date={date}
                        reportedStart={r.startIso || r.fromIso}
                        reportedEnd={r.isOpen ? null : (r.endIso || r.toIso)}
                        baseLabel={r.address}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                Ingen personal har rapporterat tid
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
