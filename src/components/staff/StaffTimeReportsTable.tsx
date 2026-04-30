import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Briefcase, Car, MapPin, Sun } from 'lucide-react';
import { LiveDuration } from './LiveDuration';
import { formatHoursMinutes } from '@/utils/formatHours';
import { StaffDayAnalysisPanel, StaffDayNotificationsPanel } from './StaffDayAnalysisPanel';
import { AnalyzeDayButton } from './AnalyzeDayButton';
import type { StaffDayJournal, ProjectSession } from '@/lib/staff/dayJournal';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { findPingAtTime } from '@/lib/staff/pingAtTime';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

export type SessionKind = 'booking' | 'large_project' | 'location' | 'travel';

interface StaffBlockSession {
  key: string;
  kind: SessionKind;
  label: string;
  startIso: string | null;
  endIso: string | null;
  isOpen: boolean;
  hours: number | null;
}

export interface StaffBlock {
  staffId: string;
  staffName: string;
  totalHours: number;
  hasOpenReport: boolean;
  dayStartIso: string | null;
  dayEndIso: string | null;
  dayIsOpen: boolean;
  sessions: StaffBlockSession[];
}

const sessionKindIcon = (k: SessionKind) => {
  if (k === 'travel') return Car;
  if (k === 'location') return MapPin;
  return Briefcase;
};

/** Bygg ett per-person-block för tabellen. */
export const buildStaffBlock = (
  staff: {
    id: string;
    name: string;
    journal: StaffDayJournal;
    total_hours: number;
    has_open_report: boolean;
  },
): StaffBlock => {
  const j = staff.journal;
  return {
    staffId: staff.id,
    staffName: staff.name,
    totalHours: staff.total_hours,
    hasOpenReport: staff.has_open_report,
    dayStartIso: j.start.at,
    dayEndIso: j.end.at,
    dayIsOpen: j.end.isOpen,
    sessions: j.sessions.map<StaffBlockSession>((s) => ({
      key: s.key,
      kind: s.kind === 'large_project' ? 'large_project'
        : s.kind === 'travel' ? 'travel'
        : s.kind === 'location' ? 'location' : 'booking',
      label: s.label || (s.kind === 'travel' ? 'Resa' : 'Projekt'),
      startIso: s.start,
      endIso: s.end,
      isOpen: s.isOpen,
      hours: s.hours,
    })),
  };
};

interface JournalTableProps {
  blocks: StaffBlock[];
  date: string;
  onSelectStaff: (id: string, name: string) => void;
}

/**
 * Returnerar adress vid en given tidpunkt utifrån GPS-pings.
 * Söker närmsta ping inom ±15 min, reverse-geocodar koordinaterna.
 */
const GeoAtTime: React.FC<{ staffId: string; date: string; iso: string | null }> = ({ staffId, date, iso }) => {
  const { data: pings = [], isLoading } = useStaffPingsForDay(staffId, date, !!iso);
  const ping = useMemo(() => (iso ? findPingAtTime(pings, iso, 15) : null), [pings, iso]);
  const addrs = useReverseGeocode([ping?.coords ?? null]);

  if (!iso) return <span className="text-muted-foreground">—</span>;
  if (isLoading) return <span className="text-muted-foreground italic">…</span>;
  if (!ping) return <span className="text-muted-foreground italic">ingen GPS</span>;
  const addr = addrs[0] ?? `${ping.coords.lat.toFixed(4)}, ${ping.coords.lng.toFixed(4)}`;
  return <span className="text-foreground truncate" title={addr}>{addr}</span>;
};

/**
 * Per-person-blockstruktur:
 *   Rad 1: Namn-header (lila bakgrund) + AI-analys + Notiser-kolumner spänner blocket
 *   Rad 2: ARBETSDAG | start tid | start geo | total | slut tid | slut geo
 *   Rad 3: Sub-header (PROJEKT | TIMERSTART (TID) | TIMERSTART (GEO) | VARAKTIGHET | TIMERSLUT (TID) | TIMERSLUT (GEO))
 *   Rad 4+: en rad per session
 */
export const JournalTable: React.FC<JournalTableProps> = ({ blocks, date, onSelectStaff }) => {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <colgroup>
          <col style={{ width: '200px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '200px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '200px' }} />
          <col style={{ width: '300px' }} />
        </colgroup>
        <tbody>
          {blocks.map((b) => {
            // Rader inom personblocket: 1 namn-header + 1 arbetsdag + 1 sub-header + N sessioner
            const blockRowSpan = 3 + Math.max(b.sessions.length, 1);

            const totalDuration = b.dayIsOpen && b.dayStartIso
              ? <LiveDuration startedAt={b.dayStartIso} />
              : formatHoursMinutes(b.totalHours);

            return (
              <React.Fragment key={b.staffId}>
                {/* === RAD 1: Namn-header (lila) — Analysera-knapp till höger, Notiser-header till höger === */}
                <tr className="border-t-4 border-t-primary/30">
                  <td colSpan={5} className="bg-primary/30 px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectStaff(b.staffId, b.staffName)}
                      className="font-semibold text-foreground hover:underline text-base"
                    >
                      Namn: {b.staffName}
                    </button>
                  </td>
                  <td className="bg-primary/30 px-3 py-1.5 text-right">
                    <AnalyzeDayButton staffId={b.staffId} staffName={b.staffName} date={date} />
                  </td>
                  <td className="bg-primary/30 px-3 py-1.5 text-center font-semibold text-foreground border-l border-border/40">
                    Notiser
                  </td>
                </tr>

                {/* === RAD 2: ARBETSDAG (ljuslila) — fet, enhetlig text-sm rakt igenom === */}
                <tr className="border-b border-border/40 bg-primary/10 text-sm">
                  <td className="px-2 py-1 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                      ARBETSDAG
                    </div>
                  </td>
                  <td className="px-2 py-1 tabular-nums font-bold text-foreground whitespace-nowrap">
                    {fmt(b.dayStartIso)}
                  </td>
                  <td className="px-2 py-1 font-bold text-foreground whitespace-nowrap">
                    <GeoAtTime staffId={b.staffId} date={date} iso={b.dayStartIso} />
                  </td>
                  <td className="px-2 py-1 tabular-nums font-bold text-foreground text-right whitespace-nowrap">
                    {totalDuration}
                  </td>
                  <td className="px-2 py-1 tabular-nums font-bold text-foreground whitespace-nowrap">
                    {b.dayIsOpen ? <span className="italic font-bold text-muted-foreground">pågår</span> : fmt(b.dayEndIso)}
                  </td>
                  <td className="px-2 py-1 font-bold text-foreground whitespace-nowrap">
                    <GeoAtTime
                      staffId={b.staffId}
                      date={date}
                      iso={b.dayIsOpen ? new Date().toISOString() : b.dayEndIso}
                    />
                  </td>
                  <td
                    rowSpan={blockRowSpan - 1}
                    className="align-top p-0 border-l border-border/40 bg-muted/10"
                  >
                    <StaffDayNotificationsPanel staffId={b.staffId} date={date} />
                  </td>
                </tr>

                {/* === RAD 3: Sub-header (grå) — kompakt + nowrap så allt ryms på en rad === */}
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/40">
                  <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Projekt</th>
                  <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Timerstart</th>
                  <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Geo (start)</th>
                  <th className="text-right font-semibold px-2 py-1 whitespace-nowrap">Varaktighet</th>
                  <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Timerslut</th>
                  <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Geo (slut)</th>
                </tr>

                {/* === RAD 4+: Sessions === */}
                {b.sessions.length === 0 ? (
                  <tr className="border-b border-border/40">
                    <td colSpan={6} className="px-2 py-1.5 text-center text-[11px] text-muted-foreground italic">
                      Inga timers registrerade
                    </td>
                  </tr>
                ) : (
                  b.sessions.map((s) => {
                    const Icon = sessionKindIcon(s.kind);
                    const duration = s.hours == null
                      ? '—'
                      : (s.isOpen && s.startIso
                          ? <LiveDuration startedAt={s.startIso} />
                          : formatHoursMinutes(s.hours));
                    return (
                      <tr key={s.key} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="px-2 py-1 align-middle">
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate text-foreground">{s.label}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1 tabular-nums text-foreground">{fmt(s.startIso)}</td>
                        <td className="px-2 py-1 text-[11px]">
                          <GeoAtTime staffId={b.staffId} date={date} iso={s.startIso} />
                        </td>
                        <td className="px-2 py-1 tabular-nums font-medium text-foreground text-right">
                          {duration}
                        </td>
                        <td className="px-2 py-1 tabular-nums text-foreground">
                          {s.isOpen ? <span className="italic text-muted-foreground">pågår</span> : fmt(s.endIso)}
                        </td>
                        <td className="px-2 py-1 text-[11px]">
                          <GeoAtTime
                            staffId={b.staffId}
                            date={date}
                            iso={s.isOpen ? null : s.endIso}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </React.Fragment>
            );
          })}

          {blocks.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                Ingen personal har rapporterat tid
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
