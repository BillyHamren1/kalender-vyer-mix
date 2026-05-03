import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Briefcase, Car, MapPin, Pencil, Square, LogIn, LogOut } from 'lucide-react';
import { LiveDuration } from './LiveDuration';
import { formatHoursMinutes } from '@/utils/formatHours';
import { StaffDayAnalysisPanel, StaffDayNotificationsPanel } from './StaffDayAnalysisPanel';
import { AnalyzeDayButton } from './AnalyzeDayButton';
import type { StaffDayJournal, ProjectSession } from '@/lib/staff/dayJournal';
import { useDayPlaceVisits } from '@/hooks/useDayPlaceVisits';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import { AddressMapDialog } from './AddressMapDialog';
import { EditTimeReportDialog } from './EditTimeReportDialog';
import { StopTimerDialog, type StopTarget } from './StopTimerDialog';
import { GpsStopsRows } from './GpsStopsRows';
import { Button } from '@/components/ui/button';
import { TimeReportClosureInfo } from './TimeReportClosureInfo';

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
  /** Underlying source ids (`tr:` / `lt:` / `tv:` prefixed). */
  sourceIds: string[];
  /** Edit context for the canonical backing time_reports row, if any. */
  editTimeReport: ProjectSession['editTimeReport'];
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
      sourceIds: s.sourceIds,
      editTimeReport: s.editTimeReport ?? null,
    })),
  };
};

interface JournalTableProps {
  blocks: StaffBlock[];
  date: string;
  onSelectStaff: (id: string, name: string) => void;
}

interface EditTargetPayload {
  timeReportId: string;
  staffName: string;
  startTime: string | null;
  endTime: string | null;
  breakHours: number;
  description: string | null;
  approved: boolean;
}

interface StopTargetPayload {
  target: StopTarget;
  staffName: string;
  sessionLabel: string;
}

type ActualDayRow =
  | {
      source: 'gps';
      key: string;
      kind: 'visit';
      label: string;
      startIso: string;
      endIso: string;
      hours: number;
    }
  | {
      source: 'gps';
      key: string;
      kind: 'travel';
      label: string;
      startIso: string;
      endIso: string;
      hours: number;
    };

/**
 * Visar var personen var vid en given tidpunkt — driven av samma motor
 * (`pingPlaceSegments`) som underraden "Faktiska besök". Detta betyder:
 *   • känd anläggning (FA Warehouse, lager, kontor) visas alltid med sitt
 *     riktiga namn — Mapbox används aldrig för att gissa.
 *   • okänd plats reverse-geocodas på vistelsens centroid, så hela vistelsen
 *     får samma label oavsett vilken enskild ping vi råkar fråga om.
 */
const GeoAtTime: React.FC<{
  staffId: string;
  date: string;
  iso: string | null;
  intent?: 'arrival' | 'departure' | 'neutral';
}> = ({ staffId, date, iso, intent = 'neutral' }) => {
  const { resolveAt, isLoading, hasPings } = useDayPlaceVisits(staffId, date, !!iso);
  const hit = useMemo(() => resolveAt(iso), [resolveAt, iso]);

  const fromCoord = hit.kind === 'travel' && !hit.travel.from.knownSite ? hit.travel.from.centre : null;
  const toCoord   = hit.kind === 'travel' && !hit.travel.to.knownSite   ? hit.travel.to.centre   : null;
  const visitCoord = hit.kind === 'visit' && !hit.visit.knownSite ? hit.visit.centre : null;
  const fallbackLabels = useReverseGeocode([visitCoord, fromCoord, toCoord]);
  const [open, setOpen] = useState(false);

  if (!iso) return <span className="text-muted-foreground">—</span>;
  if (isLoading) return <span className="text-muted-foreground italic">…</span>;

  if (hit.kind === 'unknown') {
    return (
      <span className="text-muted-foreground italic" title="Ingen GPS-täckning vid denna tidpunkt">
        {hasPings ? 'okänt (mellan pings)' : 'ingen GPS'}
      </span>
    );
  }

  if (hit.kind === 'travel') {
    const fromName = hit.travel.from.knownSite?.name ?? fallbackLabels[1] ?? 'okänd plats';
    const toName   = hit.travel.to.knownSite?.name   ?? fallbackLabels[2] ?? 'okänd plats';
    if (intent === 'arrival') {
      return (
        <span className="text-foreground inline-flex items-center gap-1 truncate" title={`Anlände till ${toName} (från ${fromName})`}>
          📍 Anlände: {toName}
        </span>
      );
    }
    if (intent === 'departure') {
      return (
        <span className="text-foreground inline-flex items-center gap-1 truncate" title={`Lämnade ${fromName} (mot ${toName})`}>
          🚪 Lämnade: {fromName}
        </span>
      );
    }
    return (
      <span className="text-muted-foreground italic inline-flex items-center gap-1 truncate" title={`Under förflyttning mellan ${fromName} och ${toName}`}>
        🚗 Resa: {fromName} → {toName}
      </span>
    );
  }

  const visit = hit.visit;
  const addr = visit.knownSite
    ? visit.knownSite.name
    : (fallbackLabels[0] ?? `${visit.centre.lat.toFixed(4)}, ${visit.centre.lng.toFixed(4)}`);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="text-left text-foreground truncate hover:text-primary hover:underline underline-offset-2 transition-colors max-w-full"
        title={`Visa ${addr} på karta`}
      >
        {addr}
      </button>
      <AddressMapDialog open={open} onOpenChange={setOpen} address={addr} coords={visit.centre} staffId={staffId} date={date} />
    </>
  );
};

const StaffBlockRows: React.FC<{
  block: StaffBlock;
  date: string;
  onSelectStaff: (id: string, name: string) => void;
  onEditTimeReport: (target: EditTargetPayload) => void;
  onStopSession: (target: StopTargetPayload) => void;
}> = ({ block: b, date, onSelectStaff, onEditTimeReport, onStopSession }) => {
  const { visits, travels } = useDayPlaceVisits(b.staffId, date, true);

  const geocodeTargets = useMemo(
    () => visits.map((visit) => (visit.knownSite ? null : visit.centre)),
    [visits],
  );
  const visitLabels = useReverseGeocode(geocodeTargets);

  const actualRows = useMemo<ActualDayRow[]>(() => {
    if (visits.length === 0) return [];
    const labelForVisit = (visit: (typeof visits)[number], index: number) => (
      visit.knownSite?.name
      ?? visitLabels[index]
      ?? `${visit.centre.lat.toFixed(4)}, ${visit.centre.lng.toFixed(4)}`
    );

    const rows: ActualDayRow[] = [];
    for (let i = 0; i < visits.length; i += 1) {
      const visit = visits[i];
      rows.push({
        source: 'gps',
        key: `visit:${visit.placeKey}:${visit.start}`,
        kind: 'visit',
        label: labelForVisit(visit, i),
        startIso: visit.start,
        endIso: visit.end,
        hours: visit.durationMin / 60,
      });

      const travel = travels[i];
      if (travel) {
        const fromIndex = visits.indexOf(travel.from);
        const toIndex = visits.indexOf(travel.to);
        const fromLabel = labelForVisit(travel.from, fromIndex);
        const toLabel = labelForVisit(travel.to, toIndex);
        rows.push({
          source: 'gps',
          key: travel.key,
          kind: 'travel',
          label: `Förflyttning: ${fromLabel} → ${toLabel}`,
          startIso: travel.start,
          endIso: travel.end,
          hours: travel.durationMin / 60,
        });
      }
    }

    return rows;
  }, [travels, visitLabels, visits]);

  const useActualRows = actualRows.length > 0;
  const blockRowSpan = 4 + Math.max(useActualRows ? actualRows.length : b.sessions.length, 1);

  const anySessionOpen = b.sessions.some((s) => s.isOpen);
  const dayActuallyRunning = !useActualRows && b.dayIsOpen && anySessionOpen;
  const dayWaitingToClose = !useActualRows && b.dayIsOpen && !anySessionOpen;
  const lastActivityEnd = (() => {
    if (!dayWaitingToClose) return null;
    const ends = b.sessions
      .map((s) => s.endIso)
      .filter((e): e is string => !!e)
      .sort();
    return ends.length > 0 ? ends[ends.length - 1] : null;
  })();

  const gpsDayStartIso = useActualRows ? actualRows[0]?.startIso ?? null : null;
  const gpsDayEndIso = useActualRows ? actualRows[actualRows.length - 1]?.endIso ?? null : null;
  const gpsTotalHours = useActualRows
    ? visits.reduce((sum, visit) => sum + visit.durationMin, 0) / 60
    : 0;

  const dayStartIso = useActualRows ? gpsDayStartIso : b.dayStartIso;
  const dayEndIso = useActualRows ? gpsDayEndIso : b.dayEndIso;
  const totalDuration = useActualRows
    ? formatHoursMinutes(gpsTotalHours)
    : dayActuallyRunning && b.dayStartIso
      ? <LiveDuration startedAt={b.dayStartIso} />
      : formatHoursMinutes(b.totalHours);

  return (
    <>
      <tr className="border-t-4 border-t-primary/30">
        <td colSpan={6} className="bg-primary/30 px-3 py-1.5">
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

      <tr className="border-b-2 border-primary/30 bg-primary/10 text-sm">
        <td className="px-2 py-2 align-middle whitespace-nowrap">
          <div className="font-bold text-foreground uppercase tracking-wide text-[11px]">Arbetsdag</div>
          <div className="text-[10px] text-muted-foreground">
            {useActualRows ? 'GPS-spårad' : b.dayIsOpen ? 'pågår' : 'avslutad'}
          </div>
        </td>
        <td colSpan={2} className="px-2 py-2 whitespace-nowrap">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <LogIn className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            Startade
          </div>
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums font-bold text-foreground text-base">{fmt(dayStartIso)}</span>
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">
              <GeoAtTime staffId={b.staffId} date={date} iso={dayStartIso} intent="arrival" />
            </span>
          </div>
        </td>
        <td className="px-2 py-2 tabular-nums font-bold text-foreground text-right whitespace-nowrap">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal">Total</div>
          {totalDuration}
        </td>
        <td colSpan={2} className="px-2 py-2 whitespace-nowrap">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <LogOut className="h-3 w-3 text-rose-600 dark:text-rose-400" />
            Avslutade
          </div>
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums font-bold text-foreground text-base">
              {dayActuallyRunning ? (
                <span className="italic font-bold text-muted-foreground">pågår</span>
              ) : dayWaitingToClose ? (
                <span
                  className="italic font-bold text-amber-600"
                  title="Alla aktiviteter avslutade, men arbetsdagen markerades aldrig som avslutad."
                >
                  {lastActivityEnd ? `${fmt(lastActivityEnd)} (ej avslutad)` : 'ej avslutad'}
                </span>
              ) : (
                fmt(dayEndIso)
              )}
            </span>
            <span className="text-xs text-muted-foreground truncate max-w-[180px] font-normal">
              <GeoAtTime
                staffId={b.staffId}
                date={date}
                iso={dayActuallyRunning ? null : (dayEndIso ?? lastActivityEnd)}
                intent="departure"
              />
            </span>
          </div>
        </td>
        <td className="px-2 py-2 whitespace-nowrap" />
        <td
          rowSpan={blockRowSpan - 1}
          className="align-top p-0 border-l border-border/40 bg-muted/10"
        >
          <StaffDayNotificationsPanel staffId={b.staffId} date={date} />
        </td>
      </tr>

      <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/40">
        <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Projekt</th>
        <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Timerstart</th>
        <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Geo (start)</th>
        <th className="text-right font-semibold px-2 py-1 whitespace-nowrap">Varaktighet</th>
        <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Timerslut</th>
        <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Geo (slut)</th>
        <th className="text-center font-semibold px-2 py-1 whitespace-nowrap">Åtgärd</th>
      </tr>

      {useActualRows ? (
        actualRows.map((row) => (
          <tr key={row.key} className="border-b border-border/40 hover:bg-muted/20 text-sm">
            <td className="px-2 py-1 align-middle">
              <div className="min-w-0">
                <span className={`truncate ${row.kind === 'travel' ? 'text-muted-foreground italic inline-flex items-center gap-1.5' : 'text-foreground'}`}>
                  {row.kind === 'travel' && <Car className="h-3 w-3 text-amber-600" />}
                  {row.label}
                </span>
              </div>
            </td>
            <td className="px-2 py-1 tabular-nums text-foreground whitespace-nowrap">{fmt(row.startIso)}</td>
            <td className="px-2 py-1 text-foreground whitespace-nowrap">
              <GeoAtTime staffId={b.staffId} date={date} iso={row.startIso} intent="arrival" />
            </td>
            <td className="px-2 py-1 tabular-nums font-medium text-foreground text-right whitespace-nowrap">
              {formatHoursMinutes(row.hours)}
            </td>
            <td className="px-2 py-1 tabular-nums text-foreground whitespace-nowrap">{fmt(row.endIso)}</td>
            <td className="px-2 py-1 text-foreground whitespace-nowrap">
              <GeoAtTime staffId={b.staffId} date={date} iso={row.endIso} intent="departure" />
            </td>
            <td className="px-2 py-1 whitespace-nowrap" />
          </tr>
        ))
      ) : b.sessions.length === 0 ? (
        <tr className="border-b border-border/40">
          <td colSpan={7} className="px-2 py-1.5 text-center text-[11px] text-muted-foreground italic">
            Inga timers registrerade
          </td>
        </tr>
      ) : (
        b.sessions.map((s) => {
          const duration = s.hours == null
            ? '—'
            : (s.isOpen && s.startIso
                ? <LiveDuration startedAt={s.startIso} />
                : formatHoursMinutes(s.hours));

          const first = s.sourceIds[0];
          const stop = !s.isOpen || !s.startIso || !first
            ? null
            : first.startsWith('tr:') && s.editTimeReport?.id && s.editTimeReport.reportDate
              ? { kind: 'time_report' as const, id: s.editTimeReport.id, reportDate: s.editTimeReport.reportDate, startIso: s.startIso }
              : first.startsWith('lt:')
                ? { kind: 'location_time_entries' as const, id: first.slice(3), startIso: s.startIso }
                : first.startsWith('tv:')
                  ? { kind: 'travel_time_logs' as const, id: first.slice(3), startIso: s.startIso }
                  : null;

          return (
            <tr key={s.key} className="border-b border-border/40 hover:bg-muted/20 text-sm">
              <td className="px-2 py-1 align-middle">
                <div className="min-w-0">
                  <span className="truncate text-foreground">{s.label}</span>
                </div>
              </td>
              <td className="px-2 py-1 tabular-nums text-foreground whitespace-nowrap">{fmt(s.startIso)}</td>
              <td className="px-2 py-1 text-foreground whitespace-nowrap">
                <GeoAtTime staffId={b.staffId} date={date} iso={s.startIso} intent="arrival" />
              </td>
              <td className="px-2 py-1 tabular-nums font-medium text-foreground text-right whitespace-nowrap">
                {duration}
              </td>
              <td className="px-2 py-1 tabular-nums text-foreground whitespace-nowrap">
                {s.isOpen ? (
                  <span className="italic text-muted-foreground">pågår</span>
                ) : (
                  <span className="inline-flex items-center">
                    {fmt(s.endIso)}
                    {s.editTimeReport?.id && (
                      <TimeReportClosureInfo
                        timeReportId={s.editTimeReport.id}
                        staffId={b.staffId}
                        reportDate={s.editTimeReport.reportDate}
                      />
                    )}
                  </span>
                )}
              </td>
              <td className="px-2 py-1 text-foreground whitespace-nowrap">
                <GeoAtTime
                  staffId={b.staffId}
                  date={date}
                  iso={s.isOpen ? null : s.endIso}
                  intent="departure"
                />
              </td>
              <td className="px-2 py-1 whitespace-nowrap">
                <div className="flex items-center justify-center gap-1">
                  {s.isOpen && stop && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 gap-1"
                      onClick={() => onStopSession({
                        target: stop,
                        staffName: b.staffName,
                        sessionLabel: s.label,
                      })}
                      title="Stoppa pågående timer"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      Stoppa
                    </Button>
                  )}
                  {s.editTimeReport && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => onEditTimeReport({
                        timeReportId: s.editTimeReport!.id,
                        staffName: b.staffName,
                        startTime: s.editTimeReport!.startHHmm,
                        endTime: s.editTimeReport!.endHHmm,
                        breakHours: s.editTimeReport!.breakHours,
                        description: s.editTimeReport!.description,
                        approved: s.editTimeReport!.approved,
                      })}
                      title="Redigera tider"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          );
        })
      )}

      <GpsStopsRows
        staffId={b.staffId}
        date={date}
        leadingCells={1}
        totalCols={7}
      />
    </>
  );
};

/**
 * Per-person-blockstruktur:
 *   Rad 1: Namn-header (lila bakgrund) + AI-analys + Notiser-kolumner spänner blocket
 *   Rad 2: ARBETSDAG | start tid | start geo | total | slut tid | slut geo | åtgärder
 *   Rad 3: Sub-header (Projekt | Timerstart | Geo (start) | Varaktighet | Timerslut | Geo (slut) | Åtgärder)
 *   Rad 4+: en rad per session
 */
export const JournalTable: React.FC<JournalTableProps> = ({ blocks, date, onSelectStaff }) => {
  const [editTarget, setEditTarget] = useState<EditTargetPayload | null>(null);
  const [stopTarget, setStopTarget] = useState<StopTargetPayload | null>(null);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <colgroup>
          <col style={{ width: '200px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '180px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '180px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '280px' }} />
        </colgroup>
        <tbody>
          {blocks.map((b) => (
            <StaffBlockRows
              key={b.staffId}
              block={b}
              date={date}
              onSelectStaff={onSelectStaff}
              onEditTimeReport={setEditTarget}
              onStopSession={setStopTarget}
            />
          ))}

          {blocks.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                Ingen personal har rapporterat tid
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {editTarget && (
        <EditTimeReportDialog
          open={!!editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          timeReportId={editTarget.timeReportId}
          staffName={editTarget.staffName}
          initialStartTime={editTarget.startTime}
          initialEndTime={editTarget.endTime}
          initialBreakHours={editTarget.breakHours}
          initialDescription={editTarget.description}
          isApproved={editTarget.approved}
        />
      )}

      <StopTimerDialog
        open={!!stopTarget}
        onOpenChange={(o) => { if (!o) setStopTarget(null); }}
        target={stopTarget?.target ?? null}
        staffName={stopTarget?.staffName ?? ''}
        sessionLabel={stopTarget?.sessionLabel ?? ''}
      />
    </div>
  );
};
