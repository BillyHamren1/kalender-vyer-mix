/**
 * TimeReportReviewTable
 *
 * Payroll-style review table built from `TimeReportReviewEntry`. Renders
 * what an admin actually needs in order to approve a workday:
 *
 *   - Project / location / "Resa: A → B" / "Oregistrerad tid"
 *   - Start, slut, längd, typ, status, åtgärd
 *   - Per-row expand → GPS-underlag (raw pings live in a separate drawer)
 *   - Per-row "Justera" (opens EditTimeReportDialog via callback)
 *   - Per-row "Godkänn rad" (callback — parent decides persistence)
 *   - Top-level: filter "Visa endast avvikelser", export CSV, GPS-toggle
 *
 * The table never invents work time. `gap` rows contribute 0 paid hours
 * and exist only to make luckor visible.
 */
import React, { useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Briefcase, Car, AlertTriangle, ChevronDown, ChevronRight, Pencil, Check,
  Filter, Download, MapPin, Clock, CheckCircle2, Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';
import { StaffPingDetailPanel } from '@/components/staff/StaffPingDetailPanel';
import {
  buildReviewEntries,
  type ReviewWorkInput,
  type ReviewTravelInput,
  type TimeReportReviewEntry,
  type ReviewEntryStatus,
} from '@/lib/staff/timeReportReviewEntry';
import { buildCanonicalStaffDayModel, type CanonicalStaffDayModel } from '@/lib/staff/canonicalDayModel';

interface TimeReportReviewTableProps {
  date: string;
  staffName: string;
  /** Optional: enables real ping-based GPS-underlag in expanded rows. */
  staffId?: string;
  work: ReviewWorkInput[];
  travel: ReviewTravelInput[];
  /** Canonical model for the day (workday-based payable time). */
  canonical?: CanonicalStaffDayModel;
  /** Optional: opens edit dialog for a `time_reports` row. */
  onEditTimeReport?: (timeReportId: string) => void;
  /** Optional: per-row "Godkänn rad" — parent persists. */
  onApproveEntry?: (entry: TimeReportReviewEntry) => void;
  /** Optional: render an "Godkänn hela dagen" CTA (e.g. DayApprovalAction). */
  approveDayAction?: React.ReactNode;
  /** Optional: toggle the GPS debug section in the parent dialog. */
  onToggleGpsDetails?: (visible: boolean) => void;
  gpsDetailsVisible?: boolean;
}

const toHHMM = (value: string | null | undefined): string => {
  if (!value) return '—';
  if (value.includes('T')) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }
  return value.length >= 5 ? value.slice(0, 5) : value;
};

const STATUS_BADGE: Record<ReviewEntryStatus, { label: string; className: string; icon: React.ReactNode }> = {
  ok: {
    label: 'OK',
    className: 'border-border/60 text-muted-foreground',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  approved: {
    label: 'Godkänd',
    className: 'bg-primary/15 text-primary border-0',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  ongoing: {
    label: 'Pågår',
    className: 'border-primary/30 text-primary bg-primary/5',
    icon: <Activity className="h-3 w-3" />,
  },
  needs_review: {
    label: 'Granska',
    className: 'border-destructive/40 text-destructive bg-destructive/5',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

const TYPE_BADGE: Record<TimeReportReviewEntry['kind'], { label: string; icon: React.ReactNode; className: string }> = {
  work: { label: 'Arbete', icon: <Briefcase className="h-3 w-3" />, className: '' },
  travel: { label: 'Resa', icon: <Car className="h-3 w-3" />, className: 'border-primary/30 text-primary' },
  gap: { label: 'Lucka', icon: <Clock className="h-3 w-3" />, className: 'border-destructive/30 text-destructive' },
};

function exportCsv(date: string, staffName: string, entries: TimeReportReviewEntry[]) {
  const header = ['Datum', 'Personal', 'Typ', 'Plats/projekt', 'Start', 'Slut', 'Tid (h:m)', 'Status', 'Avvikelser'];
  const rows = entries.map(e => [
    date,
    staffName,
    TYPE_BADGE[e.kind].label,
    e.label.replace(/[\r\n,;]/g, ' '),
    toHHMM(e.startIso),
    toHHMM(e.endIso),
    formatHoursMinutes(e.kind === 'gap' ? e.durationMinutes / 60 : e.paidHours),
    STATUS_BADGE[e.status].label,
    e.warnings.join(' | '),
  ]);
  const csv = [header, ...rows]
    .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tidrapport_${staffName.replace(/\s+/g, '_')}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const TimeReportReviewTable: React.FC<TimeReportReviewTableProps> = ({
  date,
  staffName,
  staffId,
  work,
  travel,
  canonical,
  onEditTimeReport,
  onApproveEntry,
  approveDayAction,
  onToggleGpsDetails,
  gpsDetailsVisible,
}) => {
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { entries, summary } = useMemo(
    () => buildReviewEntries({ work, travel }),
    [work, travel],
  );

  const visible = useMemo(
    () => onlyAnomalies ? entries.filter(e => e.status === 'needs_review' || e.warnings.length > 0) : entries,
    [entries, onlyAnomalies],
  );

  const dayBadge = STATUS_BADGE[
    summary.dayStatus === 'needs_review' ? 'needs_review'
    : summary.dayStatus === 'ongoing' ? 'ongoing'
    : 'ok'
  ];

  // Canonical model = single source of truth.
  // Lönegrundande = workday − rast. Fördelad = sum(time_reports). Travel-
  // suggestions räknas inte förrän godkända.
  const payableHours = canonical ? canonical.payableMinutes / 60 : summary.paidHours;
  const distributedHours = canonical
    ? canonical.distributedMinutes / 60
    : summary.workHours + summary.travelHours;
  const undistributedHours = canonical ? canonical.undistributedMinutes / 60 : 0;
  const overDistributedHours = canonical ? canonical.overDistributedMinutes / 60 : 0;
  const suggestedTravelHours = canonical
    ? canonical.suggestedTravelMinutes / 60
    : summary.travelHours;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold tracking-tight">Tidrapport · {staffName}</h3>
            <Badge variant="outline" className={`text-[10px] gap-1 ${dayBadge.className}`}>
              {dayBadge.icon}
              {summary.dayStatus === 'needs_review' ? 'Granska' : summary.dayStatus === 'ongoing' ? 'Pågående' : 'OK att godkänna'}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground capitalize">
            {format(new Date(date), 'EEEE d MMMM yyyy', { locale: sv })}
            {(canonical?.workdayStart ?? summary.workdayStart) && (
              <> · Arbetsdag {toHHMM(canonical?.workdayStart ?? summary.workdayStart)} → {toHHMM(canonical?.workdayEnd ?? summary.workdayEnd) || 'pågår'}</>
            )}
            {canonical && canonical.breakMinutes > 0 && (
              <> · Rast {formatHoursMinutes(canonical.breakMinutes / 60)}</>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="secondary" className="text-[11px] gap-1 font-medium" title="Workday minus rast. Lönegrundande tid.">
              <Clock className="h-3 w-3" /> Lönegrundande {formatHoursMinutes(payableHours)}
            </Badge>
            <Badge variant="outline" className="text-[11px] gap-1" title="Sum time_reports — intern fördelning på projekt/plats/lager.">
              <Briefcase className="h-3 w-3" /> Fördelad {formatHoursMinutes(distributedHours)}
            </Badge>
            {undistributedHours > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Ofördelad {formatHoursMinutes(undistributedHours)}
              </Badge>
            )}
            {overDistributedHours > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 border-destructive/40 text-destructive">
                <AlertTriangle className="h-3 w-3" /> Överrapportering {formatHoursMinutes(overDistributedHours)}
              </Badge>
            )}
            {suggestedTravelHours > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 border-primary/30 text-primary" title="Föreslagen restid (travel_time_logs) — räknas inte som lönegrundande förrän godkänd.">
                <Car className="h-3 w-3" /> Föreslagen restid {formatHoursMinutes(suggestedTravelHours)}
              </Badge>
            )}
            {canonical && canonical.anomalies.length > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 border-destructive/40 text-destructive" title={canonical.anomalies.map(a => `${a.label}: ${a.detail}`).join('\n')}>
                <AlertTriangle className="h-3 w-3" /> {canonical.anomalies.length} avvikelse{canonical.anomalies.length === 1 ? '' : 'r'}
              </Badge>
            )}
            {summary.gapMinutes > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 border-destructive/30 text-destructive">
                <AlertTriangle className="h-3 w-3" /> {summary.gapMinutes} min luckor
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <Button
            variant={onlyAnomalies ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setOnlyAnomalies(v => !v)}
          >
            <Filter className="h-3.5 w-3.5" />
            Visa endast avvikelser
          </Button>
          {onToggleGpsDetails && (
            <Button
              variant={gpsDetailsVisible ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => onToggleGpsDetails(!gpsDetailsVisible)}
            >
              <MapPin className="h-3.5 w-3.5" />
              {gpsDetailsVisible ? 'Dölj GPS-detaljer' : 'Visa GPS-detaljer'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => exportCsv(date, staffName, entries)}
          >
            <Download className="h-3.5 w-3.5" />
            Exportera tidrapport
          </Button>
          {approveDayAction}
        </div>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/20">
          {entries.length === 0 ? 'Inga rapporter denna dag.' : 'Inga avvikelser med valt filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-8" />
                <TableHead className="font-bold text-foreground">Projekt / Plats</TableHead>
                <TableHead className="font-bold text-foreground tabular-nums">Start</TableHead>
                <TableHead className="font-bold text-foreground tabular-nums">Slut</TableHead>
                <TableHead className="font-bold text-foreground tabular-nums text-right">Tid</TableHead>
                <TableHead className="font-bold text-foreground">Typ</TableHead>
                <TableHead className="font-bold text-foreground">Status</TableHead>
                <TableHead className="font-bold text-foreground text-right">Åtgärd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((entry) => {
                const status = STATUS_BADGE[entry.status];
                const type = TYPE_BADGE[entry.kind];
                const isExpanded = !!expanded[entry.key];
                const rowMuted = entry.kind === 'travel' || entry.kind === 'gap';
                return (
                  <React.Fragment key={entry.key}>
                    <TableRow className={rowMuted ? 'bg-muted/30' : ''}>
                      <TableCell className="py-1.5">
                        <button
                          onClick={() => setExpanded(s => ({ ...s, [entry.key]: !s[entry.key] }))}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Visa GPS-underlag"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span className="shrink-0 mt-0.5 text-muted-foreground">{type.icon}</span>
                          <div className="min-w-0">
                            <div className={`truncate text-sm ${entry.kind === 'gap' ? 'italic text-muted-foreground' : ''}`}>
                              {entry.label}
                            </div>
                            {entry.sublabel && (
                              <div className="truncate text-[11px] text-muted-foreground">{entry.sublabel}</div>
                            )}
                            {entry.warnings.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {entry.warnings.map((w, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 text-[10px] text-destructive"
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" /> {w}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums py-1.5">{toHHMM(entry.startIso)}</TableCell>
                      <TableCell className="tabular-nums py-1.5">{toHHMM(entry.endIso)}</TableCell>
                      <TableCell className="tabular-nums text-right py-1.5">
                        {formatHoursMinutes(entry.kind === 'gap' ? entry.durationMinutes / 60 : entry.paidHours)}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${type.className}`}>
                          {type.icon}
                          {type.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${status.className}`}>
                          {status.icon}
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        <div className="inline-flex gap-1">
                          {entry.refs.timeReportId && onEditTimeReport && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => onEditTimeReport(entry.refs.timeReportId!)}
                              title="Justera"
                            >
                              <Pencil className="h-3 w-3" /> Justera
                            </Button>
                          )}
                          {onApproveEntry && entry.kind !== 'gap' && entry.status !== 'approved' && entry.status !== 'ongoing' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary"
                              onClick={() => onApproveEntry(entry)}
                              title="Godkänn rad"
                            >
                              <Check className="h-3 w-3" /> Godkänn
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-muted/10">
                        <TableCell />
                        <TableCell colSpan={7} className="py-2">
                          <div className="text-xs space-y-2">
                            <div className="font-medium text-muted-foreground">GPS-underlag</div>
                            {entry.kind === 'gap' ? (
                              <div className="text-muted-foreground">
                                Inga GPS-data — detta är en lucka mellan två poster.
                              </div>
                            ) : (
                              <>
                                {entry.gps && (entry.gps.fromLat != null || entry.gps.toLat != null) && (
                                  <div className="grid grid-cols-2 gap-2 max-w-xl">
                                    <div>
                                      <div className="text-[10px] uppercase text-muted-foreground">Start</div>
                                      <div className="font-mono">
                                        {entry.gps.fromLat?.toFixed(5) ?? '—'}, {entry.gps.fromLng?.toFixed(5) ?? '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] uppercase text-muted-foreground">Slut</div>
                                      <div className="font-mono">
                                        {entry.gps.toLat?.toFixed(5) ?? '—'}, {entry.gps.toLng?.toFixed(5) ?? '—'}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {staffId ? (
                                  <div className="-mx-3">
                                    <StaffPingDetailPanel
                                      staffId={staffId}
                                      staffName={staffName}
                                      date={date}
                                      fromIso={entry.startIso}
                                      toIso={entry.endIso}
                                    />
                                  </div>
                                ) : !entry.gps ? (
                                  <div className="text-muted-foreground">Ingen geo-position kopplad till raden.</div>
                                ) : null}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
              <TableRow className="font-semibold bg-muted/40">
                <TableCell />
                <TableCell colSpan={3}>TOTAL BETALD TID</TableCell>
                <TableCell className="text-right tabular-nums">{formatHoursMinutes(summary.paidHours)}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
