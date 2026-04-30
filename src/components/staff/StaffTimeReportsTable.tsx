import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ChevronDown, ChevronRight, MapPin, LogIn, LogOut,
  Briefcase, Car, AlertTriangle, WifiOff,
} from 'lucide-react';
import { LiveDuration } from './LiveDuration';
import { formatHoursMinutes } from '@/utils/formatHours';
import { DayFactsPanel } from './DayFactsPanel';
import { StaffDayAnalysisPanel } from './StaffDayAnalysisPanel';
import { AnalyzeDayButton } from './AnalyzeDayButton';
import { JournalPlaceCell } from './JournalPlaceCell';
import type { StaffDayJournal, ProjectSession } from '@/lib/staff/dayJournal';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { computeWorkPresence, combineDayPresence } from '@/lib/staff/workPresence';
import { findPingAtTime } from '@/lib/staff/pingAtTime';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';

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
  /** Latest ping ISO — only set on day-start (used by summary row). */
  latestPingAt?: string | null;
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
    description: 'Arbetspass',
    address: j.start.address,
    startIso: j.start.at,
    endIso: j.end.at,
    isOpen: j.end.isOpen,
    hours: staff.total_hours,
    fromIso: startWin.from,
    toIso: startWin.to,
    allSessions,
    latestPingAt: staff.latestPing?.updated_at ?? null,
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

  // Day-end row removed — duration is shown on the "Arbetspass" (day-start) row.

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
 * Inline factual line: "Kl 06:51 var personen vid <adress>".
 *
 * No matching, no comparison, no scoring — just the question the admin
 * actually asks: when the timer started/stopped, where was the phone?
 *
 * - day-start row → position at row.startIso (timer-start)
 * - day-end row   → position at row.endIso (timer-end / now if open)
 * - session row   → "Kl 06:51 → <addr>" och "Kl 16:02 → <addr>"
 */
const PresenceLineWithDate: React.FC<{ row: JournalTableRow; date: string }> = ({ row, date }) => {
  const { data: pings = [], isLoading } = useStaffPingsForDay(row.staffId, date, true);

  const targets = useMemo(() => {
    const out: Array<{ label: string; iso: string }> = [];
    if (row.kind === 'day-start' && row.startIso) {
      out.push({ label: `Kl ${format(new Date(row.startIso), 'HH:mm')}`, iso: row.startIso });
    } else if (row.kind === 'day-end') {
      const iso = row.endIso ?? (row.isOpen ? new Date().toISOString() : row.startIso);
      if (iso) out.push({ label: row.isOpen ? 'Just nu' : `Kl ${format(new Date(iso), 'HH:mm')}`, iso });
    } else if (row.sessionStart) {
      out.push({ label: `Start ${format(new Date(row.sessionStart), 'HH:mm')}`, iso: row.sessionStart });
      const endIso = row.sessionEnd ?? (row.isOpen ? null : null);
      if (endIso) {
        out.push({ label: `Slut ${format(new Date(endIso), 'HH:mm')}`, iso: endIso });
      }
    }
    return out;
  }, [row]);

  const samples = useMemo(
    () => targets.map(t => ({
      label: t.label,
      ping: findPingAtTime(pings, t.iso, 15),
    })),
    [targets, pings],
  );

  // Reverse-geocode each sample's coordinates (rounded → cached).
  const addrs = useReverseGeocode(samples.map(s => s.ping?.coords ?? null));

  if (isLoading || samples.length === 0) return null;
  if (samples.every(s => !s.ping)) {
    return (
      <div className="text-[11px] text-muted-foreground mt-0.5">
        Ingen GPS-ping nära denna tid
      </div>
    );
  }

  return (
    <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-col gap-0.5">
      {samples.map((s, i) => {
        if (!s.ping) {
          return (
            <div key={i} className="flex items-center gap-1">
              <span className="tabular-nums">{s.label}:</span>
              <span className="italic">ingen GPS-ping</span>
            </div>
          );
        }
        const addr = addrs[i] ?? `${s.ping.coords.lat.toFixed(4)}, ${s.ping.coords.lng.toFixed(4)}`;
        return (
          <div key={i} className="flex items-baseline gap-1.5 flex-wrap">
            <span className="tabular-nums">{s.label}:</span>
            <span className="text-foreground font-medium">{addr}</span>
            {s.ping.stale && (
              <span className="italic">
                (ping {s.ping.ageMinutesFromTarget} min {s.ping.at < targets[i].iso ? 'innan' : 'efter'})
              </span>
            )}
          </div>
        );
      })}
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

  const staffRowCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.staffId] = (counts[r.staffId] || 0) + 1;
    return counts;
  }, [rows]);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
            <th className="text-left font-semibold py-2 px-2 w-[320px]">Namn</th>
            <th className="text-left font-semibold py-2 px-2 w-[280px]">Plats</th>
            <th className="text-left font-semibold py-2 px-2 w-[120px]">Klockslag</th>
            <th className="text-right font-semibold py-2 px-2 w-[90px]">Varaktighet</th>
            <th className="text-left font-semibold py-2 px-2 w-[520px] border-l border-border/40">Daglig analys</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
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
                    r.isFirstForStaff ? 'border-t-4 border-t-primary/20' : ''
                  }`}
                  onClick={() => toggle(r.rowId)}
                >
                  {/* Namn + Beskrivning */}
                  <td className="py-2 px-2 align-top">
                    <div className="flex flex-col gap-1">
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
                        {r.kind === 'day-end' && (
                          <div className="pl-8">
                            <PresenceLineWithDate row={r} date={date} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Plats */}
                  <td className="py-2 px-2 align-top text-muted-foreground">
                    <JournalPlaceCell
                      staffId={r.staffId}
                      date={date}
                      rowKind={r.kind}
                      startIso={r.startIso}
                      fallbackAddress={r.address}
                    />
                  </td>

                  {/* Klockslag */}
                  <td className={`py-2 px-2 align-top tabular-nums ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                    {time}
                  </td>

                  {/* Varaktighet */}
                  <td className={`py-2 px-2 align-top tabular-nums text-right ${bold ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                    {duration}
                  </td>

                  {/* Daglig analys — rowSpan över alla rader för personen,
                      renderas bara på första raden. */}
                  {r.isFirstForStaff && (
                    <td
                      rowSpan={staffRowCount[r.staffId] || 1}
                      className="align-top p-0 border-l border-border/40 bg-muted/20 w-[520px]"
                    >
                      <StaffDayAnalysisPanel staffId={r.staffId} date={date} />
                    </td>
                  )}
                </tr>

                {isOpen && r.fromIso && (r.kind === 'day-start' || r.kind === 'day-end') && (
                  <tr className="bg-muted/20">
                    <td></td>
                    <td colSpan={4} className="py-2 px-2">
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
