import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, CalendarDays, WifiOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, addDays, subDays, isToday, isYesterday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';
import { TimeReportReviewTable } from './TimeReportReviewTable';
import { StaffDayTimelineCard } from './StaffDayTimelineCard';
import type { ReviewWorkInput, ReviewTravelInput } from '@/lib/staff/timeReportReviewEntry';
import type { DaySegment, LatestPing, PlanningStatus, PresenceDebug } from '@/pages/StaffTimeReports.types';
import type { StaffDayJournal, ProjectSession } from '@/lib/staff/dayJournal';
import type { DayMetrics } from '@/lib/staff/dayMetrics';
import type { CanonicalStaffDayModel } from '@/lib/staff/canonicalDayModel';
import type { ActualStaffDayModel } from '@/lib/staff/actualStaffDayModel';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface ProjectInfo {
  booking_id: string;
  label: string;
  is_open: boolean;
  total_hours: number;
}

interface StaffWithDayReport {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  total_hours: number;
  reports_count: number;
  has_open_report: boolean;
  earliest_start: string | null;
  latest_end: string | null;
  projects: ProjectInfo[];
  segments: DaySegment[];
  journal: StaffDayJournal;
  latestPing: LatestPing | null;
  metrics: DayMetrics;
  canonical: CanonicalStaffDayModel;
  actualModel: ActualStaffDayModel;
  pingsTruncated?: boolean;
  pingsFetchError?: string | null;
  planningStatus: PlanningStatus;
  plannedLabels: string[];
  presence: PresenceDebug;
}

const PLANNING_BADGE: Record<PlanningStatus, { label: string; className: string } | null> = {
  planned_not_started: { label: 'Planerad – ej startad', className: 'bg-muted text-muted-foreground border' },
  missing_workday: null,
  unplanned_activity: { label: 'Oplanerad aktivitet', className: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 border border-blue-300/40' },
  workday_active: { label: 'Pågående arbetsdag', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-300/40' },
  planned: { label: 'Planerad', className: 'bg-muted text-muted-foreground border' },
  completed: null,
  gps_only: { label: 'Har GPS — saknar rapportdata', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-300/40' },
};

// "Tappad signal" — phone hasn't pinged in >10 min, but a report is still open.
const STALE_PING_MS = 10 * 60 * 1000;
type LiveStatus = 'live' | 'stale' | 'closed';
const resolveLiveStatus = (
  hasOpen: boolean,
  ping: { updated_at: string | null } | null,
): LiveStatus => {
  if (!hasOpen) return 'closed';
  if (!ping?.updated_at) return 'stale';
  const age = Date.now() - new Date(ping.updated_at).getTime();
  return age > STALE_PING_MS ? 'stale' : 'live';
};

interface StaffTimeReportsListProps {
  staffList: StaffWithDayReport[];
  isLoading: boolean;
  onSelectStaff: (id: string, name: string) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  /** Map staffId → hela beslutspayloaden från get-staff-presence-day. */
  reportCandidateByStaff?: Record<
    string,
    {
      blocks: import('./ReportCandidateTimeline').ReportCandidateBlockUI[];
      summary: import('./ReportCandidateTimeline').ReportCandidateSummaryUI | null;
      diagnostics?: any;
      excludedPreWorkBlocks?: import('./ReportCandidateTimeline').ReportCandidateBlockUI[];
      preWorkExclusionDiagnostics?: any;
      targetResolution?: any;
      presenceBlocks?: import('@/lib/staff/buildReportDisplayBlocks').PresenceBlockLite[];
      presenceRawEvidence?: any[];
      rawGpsTimeline?: any;
      technicalTimeline?: any[];
      presenceDaySummary?: any;
      presenceDayAggregation?: any;
      targetMatchSummary?: any;
      targets?: import('@/lib/staff/buildReportDisplayBlocks').TargetLite[];
      counts?: any;
      loading: boolean;
      missing?: boolean;
    } | undefined
  >;
  /** Sidnivå-engineMode. ALLA personrader renderas med detta läge. */
  engineMode?: 'report_candidate' | 'actual_model_fallback';
}

const formatRelativeDate = (date: Date): string => {
  if (isToday(date)) return 'Idag';
  if (isYesterday(date)) return 'Igår';
  return format(date, 'EEEE d MMMM', { locale: sv });
};

export const StaffTimeReportsList: React.FC<StaffTimeReportsListProps> = ({
  staffList,
  isLoading,
  onSelectStaff,
  selectedDate,
  onDateChange,
  reportCandidateByStaff,
  engineMode = 'report_candidate',
}) => {
  const [search, setSearch] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const queryClient = useQueryClient();

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const handleResolvePlannedGap = async (
    staffId: string,
    input: {
      anomalyId: string;
      mode: 'planned' | 'first_signal' | 'custom' | 'absence';
      plannedStartIso: string;
      firstSignalIso: string | null;
      customStartIso?: string;
      assignmentId: string | null;
      noSignalGapMinutes: number;
      label: string;
    },
  ) => {
    const { data, error } = await supabase.functions.invoke('mobile-app-api', {
      body: {
        action: 'admin_create_workday_from_planned',
        data: {
          target_staff_id: staffId,
          flag_date: dateStr,
          mode: input.mode,
          planned_start_iso: input.plannedStartIso,
          first_signal_iso: input.firstSignalIso,
          custom_start_iso: input.customStartIso,
          assignment_id: input.assignmentId,
          note: `Admin: ${input.label} (gap ${input.noSignalGapMinutes} min)`,
        },
      },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    // Force a refresh of the day panel data.
    await queryClient.invalidateQueries({ queryKey: ['staff-time-reports'] });
    await queryClient.invalidateQueries({ queryKey: ['workdays'] });
    await queryClient.invalidateQueries({ queryKey: ['workday-flags'] });
  };

  const handleRepairFromEvidence = async (
    staffId: string,
    input: { proposedStartIso: string; proposedEndIso: string | null; reasonCodes: string[] },
  ) => {
    const { data, error } = await supabase.functions.invoke('mobile-app-api', {
      body: {
        action: 'admin_repair_workday_from_evidence',
        data: {
          target_staff_id: staffId,
          flag_date: dateStr,
          proposed_start_iso: input.proposedStartIso,
          proposed_end_iso: input.proposedEndIso,
          reason_codes: input.reasonCodes,
        },
      },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    await queryClient.invalidateQueries({ queryKey: ['staff-time-reports'] });
    await queryClient.invalidateQueries({ queryKey: ['workdays'] });
  };

  const handleAutoRepairFromEvidence = async (
    staffId: string,
    input: { reasonCodes: string[] },
  ): Promise<{ status: 'created' | 'existing' | 'skipped' }> => {
    const { data, error } = await supabase.functions.invoke('mobile-app-api', {
      body: {
        action: 'auto_repair_missing_workdays_from_evidence',
        data: {
          target_staff_id: staffId,
          dates: [dateStr],
        },
      },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    const matchingRow = ((data as any)?.results ?? []).find(
      (row: any) => row?.staff_id === staffId && row?.date === dateStr,
    );
    const status: 'created' | 'existing' | 'skipped' =
      matchingRow?.action === 'created'
        ? 'created'
        : matchingRow?.action === 'skipped_existing_workday'
          ? 'existing'
          : 'skipped';
    if (status === 'created' || status === 'existing') {
      await queryClient.invalidateQueries({ queryKey: ['staff-time-reports'] });
      await queryClient.invalidateQueries({ queryKey: ['workdays'] });
    }
    return { status };
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.role && s.role.toLowerCase().includes(q))
    );
  }, [staffList, search]);

  const dateLabel = formatRelativeDate(selectedDate);
  const subLabel = format(selectedDate, "d MMMM yyyy", { locale: sv });
  const liveCount = staffList.filter(s => resolveLiveStatus(s.has_open_report, s.latestPing) === 'live').length;
  const staleCount = staffList.filter(s => resolveLiveStatus(s.has_open_report, s.latestPing) === 'stale').length;
  // KRITISKT: Workday = total arbetstid. Projekt/restid = fördelning inuti
  // workday. ALDRIG addera dem ovanpå varandra. Använd metrics.payableMinutes
  // som "Total arbetstid" och visa fördelningen separat.
  const totals = staffList.reduce(
    (acc, x) => {
      acc.payable += x.metrics.payableMinutes;
      acc.workday += x.metrics.workdayMinutes;
      acc.activity += x.metrics.activityMinutes;
      acc.travel += x.metrics.travelMinutes;
      acc.unallocated += x.metrics.unallocatedMinutes;
      return acc;
    },
    { payable: 0, workday: 0, activity: 0, travel: 0, unallocated: 0 },
  );
  const fmtMin = (m: number) => formatHoursMinutes(m / 60);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {staffList.length} {staffList.length === 1 ? 'person rapporterade' : 'personer rapporterade'} · {subLabel}
        </p>
      </div>
      {/* Date navigation */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDateChange(subDays(selectedDate, 1))}
          className="rounded-lg shrink-0 h-8 px-3 gap-1.5"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Förra
        </Button>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg flex-1 max-w-[280px] gap-2 font-medium capitalize h-8"
            >
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => {
                if (d) {
                  onDateChange(d);
                  setCalendarOpen(false);
                }
              }}
              locale={sv}
              initialFocus
              className="pointer-events-auto"
            />
            <div className="p-2 border-t flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onDateChange(new Date());
                  setCalendarOpen(false);
                }}
                className="rounded-lg text-xs"
              >
                Idag
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          className="rounded-lg shrink-0 h-8 px-3 gap-1.5"
        >
          Nästa
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Summary — workday är total, övriga visar fördelning inuti dagen */}
      {!isLoading && staffList.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
          <span className="tabular-nums" title="Total arbetstid (workday). Projekt och resa är fördelning inuti denna.">
            <span className="font-semibold text-foreground">{fmtMin(totals.payable)}</span> arbetstid
          </span>
          <span className="tabular-nums">
            Projekt <span className="font-medium text-foreground">{fmtMin(totals.activity)}</span>
          </span>
          <span className="tabular-nums">
            Resa <span className="font-medium text-foreground">{fmtMin(totals.travel)}</span>
          </span>
          {totals.unallocated > 0 && (
            <span className="tabular-nums text-muted-foreground" title="Ej fördelat på projekt — blockerar inte godkännande.">
              Oallokerat <span className="font-medium">{fmtMin(totals.unallocated)}</span>
            </span>
          )}
          {liveCount > 0 && (
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{liveCount}</span> pågående
            </span>
          )}
          {staleCount > 0 && (
            <span className="tabular-nums text-destructive font-medium inline-flex items-center gap-1">
              <WifiOff className="h-3 w-3" />
              {staleCount} tappad signal
            </span>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök personal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {search
            ? 'Inga träffar'
            : `Ingen personal har rapporterat tid ${dateLabel.toLowerCase()}`}
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const plannedOnly = filtered.filter(s => s.planningStatus === 'planned_not_started');
            const rest = filtered.filter(s => s.planningStatus !== 'planned_not_started');
            return (
              <>
                {plannedOnly.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-medium text-foreground">
                      Planerade – har inte rapporterat tid ({plannedOnly.length})
                    </div>
                    <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {[...plannedOnly]
                        .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
                        .map(staff => (
                          <li key={staff.id}>
                            <button
                              type="button"
                              onClick={() => onSelectStaff(staff.id, staff.name)}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                              title="Planerad i kalendern denna dag"
                            >
                              <span className="truncate font-medium">{staff.name}</span>
                              <span className="ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                                Planerad
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                {rest.map((staff) => {
            const work: ReviewWorkInput[] = [];
            const travel: ReviewTravelInput[] = [];
            for (const s of staff.journal.sessions as ProjectSession[]) {
              if (s.kind === 'travel') {
                travel.push({
                  id: s.sourceIds[0]?.replace(/^tv:/, '') ?? s.key,
                  start_time: s.start,
                  end_time: s.end,
                  hours_worked: s.hours,
                  from_address: s.fromAddress ?? null,
                  to_address: s.toAddress ?? (s.label?.replace(/^Resa[:→\s]*/i, '') || null),
                  from_latitude: s.fromLatitude ?? null,
                  from_longitude: s.fromLongitude ?? null,
                  to_latitude: s.toLatitude ?? null,
                  to_longitude: s.toLongitude ?? null,
                  destination_booking_id: s.destinationBookingId ?? null,
                });
              } else {
                const firstId = s.sourceIds[0] ?? s.key;
                const isTr = firstId.startsWith('tr:');
                work.push({
                  id: isTr ? (s.editTimeReport?.id ?? firstId.slice(3)) : firstId.replace(/^lt:/, 'lte-'),
                  start_time: s.start,
                  end_time: s.end,
                  hours_worked: s.hours,
                  booking_client: s.label,
                  booking_number: null,
                  description: s.editTimeReport?.description ?? null,
                  delivery_lat: s.baseLatitude ?? null,
                  delivery_lng: s.baseLongitude ?? null,
                  ongoing: s.isOpen,
                  approved: s.editTimeReport?.approved ?? false,
                  source: isTr ? 'time_report' : 'location_entry',
                });
              }
            }
            return (
              <div key={staff.id} className="space-y-2">
                {(() => {
                  const badge = PLANNING_BADGE[staff.planningStatus];
                  if (!badge && staff.plannedLabels.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{staff.name}</span>
                      {badge && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                      {staff.plannedLabels.length > 0 && (
                        <span className="text-muted-foreground truncate" title={staff.plannedLabels.join(' · ')}>
                          Planerad: {staff.plannedLabels.slice(0, 3).join(' · ')}{staff.plannedLabels.length > 3 ? ' …' : ''}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {(typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) && (
                <details className="group rounded-md border border-dashed border-muted-foreground/20 bg-muted/30 px-3 py-1.5 text-[11px]">
                  <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                    Varför syns {staff.name}? <span className="opacity-60">(debug)</span>
                  </summary>
                  <div className="mt-2 space-y-1.5 text-foreground/90">
                    <p className="text-foreground"><span className="font-semibold">{staff.presence.visibilityReason}</span></p>
                    <p className="text-muted-foreground"><span className="font-semibold text-foreground">Status:</span> {staff.presence.statusReason}</p>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 font-mono text-[10.5px]">
                      {([
                        ['plannedFromBookingStaffAssignments', staff.presence.plannedFromBookingStaffAssignments],
                        ['plannedFromStaffAssignments', staff.presence.plannedFromStaffAssignments],
                        ['plannedFromLargeProjectStaff', staff.presence.plannedFromLargeProjectStaff],
                        ['hasWorkday', staff.presence.hasWorkday],
                        ['hasOpenWorkday', staff.presence.hasOpenWorkday],
                        ['hasTimeReports', staff.presence.hasTimeReports],
                        ['hasLocationTimeEntries', staff.presence.hasLocationTimeEntries],
                        ['hasTravelLogs', staff.presence.hasTravelLogs],
                        ['hasGpsPings', staff.presence.hasGpsPings],
                        ['hasAssistantEvents', staff.presence.hasAssistantEvents],
                        ['hasWorkdayFlags', staff.presence.hasWorkdayFlags],
                      ] as Array<[string, boolean]>).map(([k, v]) => (
                        <li key={k} className="flex items-center gap-1.5">
                          <span className={v ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                            {v ? '✓' : '·'}
                          </span>
                          <span className={v ? 'text-foreground' : 'text-muted-foreground'}>{k}</span>
                          <span className="ml-auto opacity-70">{String(v)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
                )}
                {staff.pingsFetchError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    ⚠️ GPS-historik kunde inte hämtas för {staff.name}. Dagens händelser kan vara ofullständiga. ({staff.pingsFetchError})
                  </div>
                )}
                {staff.pingsTruncated && (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                    ⚠️ GPS-historiken för {staff.name} har trunkerats (mer än 20 000 pings för dagen). Timeline kan vara ofullständig — tysta perioder är inte nödvändigtvis "signal tappad".
                  </div>
                )}
                <StaffDayTimelineCard
                  staffName={staff.name}
                  staffId={staff.id}
                  date={dateStr}
                  model={staff.actualModel}
                  lastPingIso={staff.latestPing?.updated_at ?? null}
                  reportCandidateBlocks={reportCandidateByStaff?.[staff.id]?.blocks ?? null}
                  reportCandidateSummary={reportCandidateByStaff?.[staff.id]?.summary ?? null}
                  reportCandidateLoading={reportCandidateByStaff?.[staff.id]?.loading ?? false}
                  reportCandidatePresenceBlocks={reportCandidateByStaff?.[staff.id]?.presenceBlocks ?? null}
                  reportCandidateTargets={reportCandidateByStaff?.[staff.id]?.targets ?? null}
                  reportCandidateDiagnostics={reportCandidateByStaff?.[staff.id]?.diagnostics ?? null}
                  reportCandidateExcludedPreWorkBlocks={reportCandidateByStaff?.[staff.id]?.excludedPreWorkBlocks ?? null}
                  reportCandidatePreWorkExclusionDiagnostics={reportCandidateByStaff?.[staff.id]?.preWorkExclusionDiagnostics ?? null}
                  reportCandidateTargetResolution={reportCandidateByStaff?.[staff.id]?.targetResolution ?? null}
                  reportCandidatePresenceRawEvidence={reportCandidateByStaff?.[staff.id]?.presenceRawEvidence ?? null}
                  reportCandidateRawGpsTimeline={reportCandidateByStaff?.[staff.id]?.rawGpsTimeline ?? null}
                  reportCandidateTechnicalTimeline={reportCandidateByStaff?.[staff.id]?.technicalTimeline ?? null}
                  reportCandidatePresenceDaySummary={reportCandidateByStaff?.[staff.id]?.presenceDaySummary ?? null}
                  reportCandidatePresenceDayAggregation={reportCandidateByStaff?.[staff.id]?.presenceDayAggregation ?? null}
                  reportCandidateTargetMatchSummary={reportCandidateByStaff?.[staff.id]?.targetMatchSummary ?? null}
                  reportCandidateCounts={reportCandidateByStaff?.[staff.id]?.counts ?? null}
                  engineMode={engineMode}
                  reportSlot={
                    <TimeReportReviewTable
                      date={dateStr}
                      staffName={staff.name}
                      staffId={staff.id}
                      work={work}
                      travel={travel}
                      canonical={staff.canonical}
                    />
                  }
                  /* Länken "Öppna full detaljvy" är borttagen 2026-05-10. */
                  onResolvePlannedGap={(input) => handleResolvePlannedGap(staff.id, input)}
                  onRepairWorkdayFromEvidence={(input) => handleRepairFromEvidence(staff.id, input)}
                  onAutoRepairWorkdayFromEvidence={(input) => handleAutoRepairFromEvidence(staff.id, input)}
                />
              </div>
            );
                })}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};
