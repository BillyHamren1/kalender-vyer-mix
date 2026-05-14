import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  WifiOff,
  
  Activity,
  Briefcase,
  AlertTriangle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, addDays, subDays, isToday, isYesterday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { getGanttDisplaySubtitle } from '@/lib/staff/ganttBlockSubtitle';
import { TimeReportReviewTable } from './TimeReportReviewTable';
import { StaffDayTimelineCard } from './StaffDayTimelineCard';
import { DecisionMapTab } from './DecisionMapTab';
import { useDayPings } from '@/hooks/admin/useDayPings';
import { useDayTimeline } from '@/hooks/admin/useDayTimeline';
import { RawGpsDrawer } from './RawGpsDrawer';
import { resolveGanttPhaseKind } from '@/lib/staff/ganttPhaseColor';
import type { ReviewWorkInput, ReviewTravelInput } from '@/lib/staff/timeReportReviewEntry';
import type {
  DaySegment,
  LatestPing,
  PlanningStatus,
  PresenceDebug,
} from '@/pages/StaffTimeReports';
import type { StaffDayJournal, ProjectSession } from '@/lib/staff/dayJournal';
import type { DayMetrics } from '@/lib/staff/dayMetrics';
import type { CanonicalStaffDayModel } from '@/lib/staff/canonicalDayModel';
import type { ActualStaffDayModel } from '@/lib/staff/actualStaffDayModel';
import type { ReportCandidateBlockUI, ReportCandidateSummaryUI } from './ReportCandidateTimeline';
import { resolveActualLocationTargetForBlock } from '@/lib/staff/resolveActualLocationTarget';
import {
  classifyNightGpsOnly,
  type NightGuardEvidence,
} from '@/lib/staff/nightGpsOnlyGuard';
import { EvidencePanel } from './ReportCandidateTimeline';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

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

const STALE_PING_MS = 10 * 60 * 1000;
type LiveStatus = 'live' | 'stale' | 'closed';
const resolveLiveStatus = (
  hasOpen: boolean,
  ping: { updated_at: string | null } | null,
): LiveStatus => {
  if (!hasOpen) return 'closed';
  if (!ping?.updated_at) return 'stale';
  return Date.now() - new Date(ping.updated_at).getTime() > STALE_PING_MS ? 'stale' : 'live';
};

// ── Time helpers ───────────────────────────────────────────────────────────
const TZ = 'Europe/Stockholm';
const stockholmParts = (iso: string): { h: number; m: number; s: number } | null => {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    return { h: get('hour'), m: get('minute'), s: get('second') };
  } catch {
    return null;
  }
};

/** Returns hours-of-day [0..24] in Stockholm tz, accounting for cross-day. */
const hourOfDay = (iso: string, anchorDateStr: string): number => {
  const p = stockholmParts(iso);
  if (!p) return 0;
  // Detect if the iso lands on the anchor date (Stockholm) or before/after.
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  const h = p.h + p.m / 60 + p.s / 3600;
  if (dateParts < anchorDateStr) return 0;
  if (dateParts > anchorDateStr) return 24;
  return h;
};

const fmtMin = (m: number) => formatHoursMinutes(m / 60);
const formatRelativeDate = (date: Date): string => {
  if (isToday(date)) return 'Idag';
  if (isYesterday(date)) return 'Igår';
  return format(date, 'EEEE d MMMM', { locale: sv });
};

// ── Block kind → visual style ──────────────────────────────────────────────
type GanttKind = 'work' | 'warehouse' | 'rig' | 'rigdown' | 'transport' | 'review' | 'unknown' | 'break' | 'pre_work';
const KIND_STYLE: Record<
  GanttKind,
  { bg: string; border: string; text: string; ring?: string; label: string }
> = {
  // Generellt event-/projektarbete (ej rig, ej rigdown, ej lager) — neutral slate så lila reserveras för warehouse
  work:      { bg: 'bg-slate-300/70 dark:bg-slate-500/40',                                  border: 'border-slate-400',                text: 'text-slate-900 dark:text-slate-50',     label: 'Arbete' },
  // Warehouse/lager = lila (matchar planeringens lager-tagg)
  warehouse: { bg: 'bg-[#E5DEFF] dark:bg-[#E5DEFF]/30',                                     border: 'border-[#BFB1F5]',                text: 'text-[#2a1f5e] dark:text-[#E5DEFF]',    label: 'Lager' },
  // rig + rigdown matchar planeringskalenderns BookingEvent-färger exakt
  // (#F2FCE2 / #FFDEE2). Inga tailwind-emerald/rose — det blev fel ton.
  rig:       { bg: 'bg-[#F2FCE2] dark:bg-[#F2FCE2]/30',                                     border: 'border-[#C9E8A8]',                text: 'text-[#1f3b14] dark:text-[#F2FCE2]',    label: 'Rigg' },
  rigdown:   { bg: 'bg-[#FFDEE2] dark:bg-[#FFDEE2]/30',                                     border: 'border-[#F4B4BC]',                text: 'text-[#4a1a20] dark:text-[#FFDEE2]',    label: 'Rigga ner' },
  transport: { bg: 'bg-sky-200/80 dark:bg-sky-400/40',                                      border: 'border-sky-400',                  text: 'text-sky-950 dark:text-sky-50',         label: 'Transport' },
  review:    { bg: 'bg-amber-200/80 dark:bg-amber-400/50',                                  border: 'border-amber-500',                text: 'text-amber-950 dark:text-amber-50',     label: 'Granska' },
  unknown:   { bg: 'bg-muted/60',                                                           border: 'border-border',                   text: 'text-muted-foreground',                 label: 'Okänd plats' },
  break:     { bg: 'bg-muted/40',                                                           border: 'border-border',                   text: 'text-muted-foreground',                 label: 'Rast' },
  pre_work:  { bg: 'bg-muted/25',                                                           border: 'border-border/50',                text: 'text-muted-foreground/70',              label: 'Före arbetsdag' },
};

const detectPhase = (title?: string | null, subtitle?: string | null): 'rig' | 'rigdown' | null => {
  const s = `${title ?? ''} ${subtitle ?? ''}`.toLowerCase();
  if (/\brigdown\b|rigga\s*ner|nedrigg|rig\s*ner|rig-?ner/.test(s)) return 'rigdown';
  if (/\brigg?\b|rigday|rigg?dag|bygg(?!nad)/.test(s)) return 'rig';
  return null;
};

interface GanttBlock {
  id: string;
  kind: GanttKind;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  title: string;
  subtitle?: string | null;
  isOpen?: boolean;
  /** Liten "Planerat: X"-badge när engine resolved en annan/okänd plats. */
  plannedBadgeLabel?: string | null;
  /** True om blocket bara är nattliga GPS-pings utan TR/LTE/manuell workday
   *  bakom sig. Renderas dämpat och räknas inte som arbete. */
  isNightGpsOnly?: boolean;
}

const isWarehouseTarget = (b: ReportCandidateBlockUI): boolean => {
  // Lager/warehouse identifieras på label oavsett targetType — internt lager-projekt
  // (FA Warehouse) ligger som booking/project, inte location, men ska ändå vara lila.
  const hay = `${b.title ?? ''} ${b.subtitle ?? ''} ${b.targetLabel ?? ''}`.toLowerCase();
  return /\b(lager|warehouse)\b/.test(hay);
};

const mapReportCandidateKind = (
  b: ReportCandidateBlockUI,
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
): GanttKind => {
  if (b.kind === 'work') {
    if (b.reviewState === 'needs_review') return 'review';
    // Warehouse vinner över annan klassning — ska alltid vara lila
    if (isWarehouseTarget(b)) return 'warehouse';
    // Phase från personalkalendern (calendar_events.event_type) — sanning för fas-färg
    const phaseKind = resolveGanttPhaseKind({
      targetType: b.targetType,
      targetId: b.targetId,
      bookingPhaseByDate,
      largeProjectPhaseByDate,
    });
    if (phaseKind) return phaseKind;
    // Fallback: heuristic on title/subtitle text
    const phase = detectPhase(b.title, b.subtitle);
    if (phase) return phase;
    return 'work';
  }
  if (b.kind === 'transport') return 'transport';
  if (b.kind === 'needs_review') return 'review';
  if (b.kind === 'unknown') return 'unknown';
  if (b.kind === 'break') return 'break';
  return 'unknown';
};

const blocksFromStaff = (
  staff: StaffWithDayReport,
  candidate: ReportCandidateBlockUI[] | null | undefined,
  excludedPreWork: ReportCandidateBlockUI[] | null | undefined,
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
): GanttBlock[] => {
  const out: GanttBlock[] = [];
  if (candidate && candidate.length) {
    const labelDiagnostics = {
      missingTitleBlocksCount: 0,
      genericTitleBlocksCount: 0,
      resolvedFromEngineCount: 0,
      resolvedFromLargeProjectCount: 0,
      planningAsBadgeOnlyCount: 0,
      planningAsFallbackCount: 0,
      ignoredPlanningBecauseGeoDisagreedCount: 0,
      unknownKeptCount: 0,
      examples: [] as Array<Record<string, unknown>>,
    };

    // Time Engine 3.8 — Geo-first label authority.
    // Vi skickar EJ längre in plannedFallback som plannedAssignmentLabel
    // direkt på blocket — det skrev över faktisk engine/geo-evidens.
    // I stället kallar vi resolveActualLocationTargetForBlock som vet att
    // engine vinner när target finns, planning bara är badge när engine är
    // okänt men dagen har evidens, och planning bara är fallback-titel när
    // dagen helt saknar evidens.
    //
    // hasDayEvidence är true så fort engine producerat något block för
    // dagen ELLER personalen har GPS-pings/place_visits/workday — alltså
    // när vi sitter med candidate.length > 0 är vi per definition i
    // "evidens finns för dagen"-läget.
    const hasDayEvidence =
      candidate.length > 0
      || (staff.actualModel?.actualVisits?.length ?? 0) > 0
      || (staff.actualModel?.actualEvents?.length ?? 0) > 0
      || !!staff.latestPing
      || staff.presence?.hasGpsPings === true
      || staff.presence?.hasTimeReports === true
      || staff.presence?.hasLocationTimeEntries === true
      || staff.presence?.hasWorkday === true;

    // Hård evidens för natt-guard: TR / LTE / manuell workday / travel.
    // En workday räknas som "manuell" om den inte är auto-startad
    // (metadata.auto_started !== true) ELLER har started_by satt.
    const rs = staff.actualModel?.reportState;
    const wd = rs?.workday ?? null;
    const wdMeta = wd?.metadata && typeof wd.metadata === 'object' ? (wd.metadata as any) : null;
    const wdIsManual = !!wd && (wd.started_by != null || wdMeta?.auto_started !== true);
    const nightEvidence: NightGuardEvidence = {
      timeReportWindows: (rs?.timeReports ?? []).map((r) => ({
        startIso: r.start_iso,
        endIso: r.end_iso,
      })),
      locationEntryWindows: (rs?.locationEntries ?? []).map((e: any) => ({
        startIso: e.entered_at,
        endIso: e.exited_at,
      })),
      manualWorkdayWindow: wdIsManual && wd
        ? { startIso: wd.started_at, endIso: wd.ended_at }
        : null,
      travelLogWindows: (rs?.travelLogs ?? []).map((t: any) => ({
        startIso: t.started_at ?? t.start_iso ?? t.entered_at,
        endIso: t.ended_at ?? t.end_iso ?? t.exited_at ?? null,
      })),
    };

    let nightGpsOnlySuppressedCount = 0;

    const processBlock = (b: ReportCandidateBlockUI, isPreWork: boolean) => {
      const resolution = resolveActualLocationTargetForBlock({
        block: b as any,
        plannedLabels: staff.plannedLabels ?? [],
        hasDayEvidence,
      });
      const resolved = resolution.finalTitle;

      const nightClass = classifyNightGpsOnly(
        { startAt: b.startAt, endAt: b.endAt, kind: b.kind },
        nightEvidence,
      );
      const isNightGpsOnly = nightClass.decision === 'raw_only_night_gps';
      if (isNightGpsOnly) nightGpsOnlySuppressedCount += 1;

      if (!b.title || !b.title.trim()) labelDiagnostics.missingTitleBlocksCount += 1;
      switch (resolution.source) {
        case 'engine_target': labelDiagnostics.resolvedFromEngineCount += 1; break;
        case 'large_project_promoted': labelDiagnostics.resolvedFromLargeProjectCount += 1; break;
        case 'planning_fallback': labelDiagnostics.planningAsFallbackCount += 1; break;
        case 'unknown': labelDiagnostics.unknownKeptCount += 1; break;
      }
      if (resolution.diagnostics.usedPlanningAsBadgeOnly) {
        labelDiagnostics.planningAsBadgeOnlyCount += 1;
      }
      if (resolution.diagnostics.ignoredPlanningBecauseGeoDisagreed) {
        labelDiagnostics.ignoredPlanningBecauseGeoDisagreedCount += 1;
      }
      if (resolution.source === 'unknown' && labelDiagnostics.examples.length < 5) {
        labelDiagnostics.examples.push({
          staffName: staff.name,
          blockId: b.id,
          kind: b.kind,
          originalTitle: b.title,
          targetLabel: b.targetLabel ?? null,
          plannedLabels: staff.plannedLabels ?? [],
          finalTitle: resolved,
          source: resolution.source,
          reason: resolution.diagnostics.reason,
        });
      }

      out.push({
        id: isPreWork ? `pre-${b.id}` : b.id,
        kind: isPreWork
          ? 'pre_work'
          : mapReportCandidateKind(b, bookingPhaseByDate, largeProjectPhaseByDate),
        startAt: b.startAt,
        endAt: b.endAt,
        durationMinutes: b.durationMinutes,
        title: isNightGpsOnly ? 'GPS – natt, ej rapporterat' : resolved,
        subtitle: isPreWork ? 'Före arbetsdag' : (b.subtitle ?? null),
        plannedBadgeLabel: isNightGpsOnly ? null : resolution.plannedBadgeLabel,
        isNightGpsOnly,
      });
    };

    for (const b of candidate) processBlock(b, false);
    if (excludedPreWork) for (const b of excludedPreWork) processBlock(b, true);

    if ((labelDiagnostics.unknownKeptCount > 0 || nightGpsOnlySuppressedCount > 0)
        && typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[Gantt 3.9] actualVsPlanned + nightGuard', {
        staff: staff.name,
        ...labelDiagnostics,
        nightGpsOnlySuppressedCount,
      });
    }
    return out;
  }
  // Fallback: derive from journal sessions
  for (const s of staff.journal.sessions as ProjectSession[]) {
    if (!s.start) continue;
    const end = s.end ?? new Date().toISOString();
    out.push({
      id: s.key,
      kind: s.kind === 'travel' ? 'transport' : 'work',
      startAt: s.start,
      endAt: end,
      durationMinutes: Math.max(0, (new Date(end).getTime() - new Date(s.start).getTime()) / 60000),
      title: s.label,
      subtitle: null,
      isOpen: s.isOpen,
    });
  }
  return out;
};

// ── Sort options ───────────────────────────────────────────────────────────
type SortKey = 'smart' | 'name' | 'start' | 'most_work' | 'most_review';
type FilterKey = 'all' | 'live' | 'review' | 'planned_only' | 'lager' | 'project' | 'transport';

interface StaffGanttViewProps {
  staffList: StaffWithDayReport[];
  isLoading: boolean;
  onSelectStaff: (id: string, name: string) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  reportCandidateByStaff?: Record<
    string,
    {
      blocks: ReportCandidateBlockUI[];
      summary: ReportCandidateSummaryUI | null;
      diagnostics?: any;
      excludedPreWorkBlocks?: ReportCandidateBlockUI[];
      preWorkExclusionDiagnostics?: any;
      targetResolution?: any;
      presenceBlocks?: any[];
      presenceRawEvidence?: any[];
      rawGpsTimeline?: any;
      technicalTimeline?: any[];
      presenceDaySummary?: any;
      presenceDayAggregation?: any;
      targetMatchSummary?: any;
      targets?: any[];
      counts?: any;
      loading: boolean;
      missing?: boolean;
    } | undefined
  >;
  engineMode?: 'report_candidate' | 'actual_model_fallback';
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>;
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>;
}

export const StaffGanttView: React.FC<StaffGanttViewProps> = ({
  staffList,
  isLoading,
  onSelectStaff,
  selectedDate,
  onDateChange,
  reportCandidateByStaff,
  engineMode = 'report_candidate',
  bookingPhaseByDate,
  largeProjectPhaseByDate,
}) => {
  const [search, setSearch] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('smart');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<{ staffId: string; blockId: string } | null>(null);
  const [compactRange, setCompactRange] = useState(true); // 06–22 default
  const queryClient = useQueryClient();

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dateLabel = formatRelativeDate(selectedDate);
  const subLabel = format(selectedDate, 'd MMMM yyyy', { locale: sv });
  const selectedBlockStaff = selectedBlock ? staffList.find((s) => s.id === selectedBlock.staffId) ?? null : null;
  const selectedBlockReportCandidate = selectedBlockStaff ? reportCandidateByStaff?.[selectedBlockStaff.id] : undefined;
  const selectedReportBlock = (() => {
    const id = selectedBlock?.blockId;
    if (!id || !selectedBlockReportCandidate) return null;
    const inMain = selectedBlockReportCandidate.blocks?.find((b) => b.id === id);
    if (inMain) return inMain;
    if (id.startsWith('pre-')) {
      const rawId = id.slice(4);
      return selectedBlockReportCandidate.excludedPreWorkBlocks?.find((b) => b.id === rawId) ?? null;
    }
    return null;
  })();

  // Per-staff blocks
  const blocksByStaff = useMemo(() => {
    const map: Record<string, GanttBlock[]> = {};
    for (const s of staffList) {
      const cand = reportCandidateByStaff?.[s.id];
      map[s.id] = blocksFromStaff(s, cand?.blocks ?? null, cand?.excludedPreWorkBlocks ?? null, bookingPhaseByDate, largeProjectPhaseByDate);
    }
    return map;
  }, [staffList, reportCandidateByStaff, bookingPhaseByDate, largeProjectPhaseByDate]);

  // Filter
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffList.filter((s) => {
      if (q) {
        const hit =
          s.name.toLowerCase().includes(q) ||
          (s.role ?? '').toLowerCase().includes(q) ||
          s.plannedLabels.some((l) => l.toLowerCase().includes(q));
        if (!hit) return false;
      }
      const live = resolveLiveStatus(s.has_open_report, s.latestPing);
      const blocks = blocksByStaff[s.id] ?? [];
      switch (filterKey) {
        case 'live':
          return live === 'live' || s.planningStatus === 'workday_active';
        case 'review':
          return blocks.some((b) => b.kind === 'review' || b.kind === 'unknown');
        case 'planned_only':
          return s.planningStatus === 'planned_not_started';
        case 'lager':
          return s.plannedLabels.some((l) => /lager|warehouse/i.test(l));
        case 'project':
          return blocks.some((b) => b.kind === 'work');
        case 'transport':
          return blocks.some((b) => b.kind === 'transport');
        default:
          return true;
      }
    });
  }, [staffList, search, filterKey, blocksByStaff]);

  // Sort
  const sortedStaff = useMemo(() => {
    const arr = [...filteredStaff];
    const earliestStart = (id: string): number => {
      const bs = blocksByStaff[id] ?? [];
      if (!bs.length) return Number.POSITIVE_INFINITY;
      return Math.min(...bs.map((b) => new Date(b.startAt).getTime()));
    };
    const reviewMin = (id: string) =>
      (blocksByStaff[id] ?? [])
        .filter((b) => b.kind === 'review' || b.kind === 'unknown')
        .reduce((a, b) => a + b.durationMinutes, 0);
    switch (sortKey) {
      case 'name':
        arr.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
        break;
      case 'start':
        arr.sort((a, b) => earliestStart(a.id) - earliestStart(b.id));
        break;
      case 'most_work':
        arr.sort((a, b) => b.metrics.payableMinutes - a.metrics.payableMinutes);
        break;
      case 'most_review':
        arr.sort((a, b) => reviewMin(b.id) - reviewMin(a.id));
        break;
      case 'smart':
      default: {
        const rank = (s: StaffWithDayReport) =>
          s.planningStatus === 'workday_active' ? 0 :
          s.has_open_report ? 1 :
          (blocksByStaff[s.id]?.length ?? 0) > 0 ? 2 :
          s.planningStatus === 'planned_not_started' ? 3 : 4;
        arr.sort((a, b) => {
          const r = rank(a) - rank(b);
          return r !== 0 ? r : a.name.localeCompare(b.name, 'sv');
        });
      }
    }
    return arr;
  }, [filteredStaff, sortKey, blocksByStaff]);

  // Summary counts
  const totals = useMemo(() => {
    let work = 0;
    let travel = 0;
    let live = 0;
    let stale = 0;
    let plannedNoReport = 0;
    let workdayActive = 0;
    for (const s of staffList) {
      work += s.metrics.activityMinutes;
      travel += s.metrics.travelMinutes;
      const ls = resolveLiveStatus(s.has_open_report, s.latestPing);
      if (ls === 'live') live += 1;
      if (ls === 'stale') stale += 1;
      if (s.planningStatus === 'planned_not_started') plannedNoReport += 1;
      if (s.planningStatus === 'workday_active') workdayActive += 1;
    }
    return { work, travel, live, stale, plannedNoReport, workdayActive };
  }, [staffList]);

  // Time axis bounds
  // Always show the full working window 06–20. Data outside that range
  // simply extends the axis so the user can scroll up/down to reach it,
  // but 06–20 is guaranteed to be present without compressing the scale.
  const { startHour, endHour } = useMemo(() => {
    const BASE_START = 6;
    const BASE_END = 20;
    if (!compactRange) return { startHour: 0, endHour: 24 };
    let minH = BASE_START;
    let maxH = BASE_END;
    for (const s of sortedStaff) {
      const blocks = blocksByStaff[s.id] ?? [];
      for (const b of blocks) {
        if (b.kind === 'pre_work') continue; // don't let pre-work expand the day
        const sH = hourOfDay(b.startAt, dateStr);
        const eH = hourOfDay(b.endAt, dateStr);
        if (Number.isFinite(sH) && sH < minH) minH = sH;
        if (Number.isFinite(eH) && eH > maxH) maxH = eH;
      }
    }
    // Pad with 1 hour on each side when data extends outside 06–20
    const s = Math.max(0, minH < BASE_START ? Math.floor(minH) - 1 : BASE_START);
    const e = Math.min(24, maxH > BASE_END ? Math.ceil(maxH) + 1 : BASE_END);
    return { startHour: s, endHour: e };
  }, [compactRange, sortedStaff, blocksByStaff, dateStr]);
  const totalHours = endHour - startHour;
  const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

  // Now line position
  // Re-tick every 30s so the "now" line follows real time on today's view.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isToday(selectedDate)) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [selectedDate]);
  const nowFrac = useMemo(() => {
    if (!isToday(selectedDate)) return null;
    const p = stockholmParts(new Date(nowTick).toISOString());
    if (!p) return null;
    const h = p.h + p.m / 60;
    if (h < startHour || h > endHour) return null;
    return ((h - startHour) / totalHours) * 100;
  }, [selectedDate, startHour, endHour, totalHours, nowTick]);

  const openStaff = openStaffId ? staffList.find((s) => s.id === openStaffId) ?? null : null;

  // Drawer write actions (kept identical to previous implementation)
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
        data: { target_staff_id: staffId, dates: [dateStr] },
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

  // Build review inputs for the drawer (parity with existing list)
  const buildReviewInputs = (staff: StaffWithDayReport) => {
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
    return { work, travel };
  };

  // Planned-only group (compact). Time Engine 3.8: belt-and-suspenders —
  // även om planningStatus = 'planned_not_started' ska personen INTE visas
  // som "har inte rapporterat" om engine/GPS-evidens redan finns. Den
  // snälla källan är planningStatus, men vi ger oss inte på att tro den
  // blint utan kollar också att blocksByStaff är tomt och att inga pings
  // finns. Då hamnar personen rätt i Gantt-listan istället.
  const hasEngineOrGpsEvidenceForStaff = (s: typeof sortedStaff[number]): boolean => {
    if ((blocksByStaff[s.id]?.length ?? 0) > 0) return true;
    if (s.latestPing) return true;
    if (s.presence?.hasGpsPings) return true;
    if (s.presence?.hasTimeReports) return true;
    if (s.presence?.hasLocationTimeEntries) return true;
    if (s.presence?.hasWorkday) return true;
    if ((s.actualModel?.actualVisits?.length ?? 0) > 0) return true;
    if ((s.actualModel?.actualEvents?.length ?? 0) > 0) return true;
    return false;
  };
  const plannedOnly = sortedStaff.filter(
    (s) => s.planningStatus === 'planned_not_started' && !hasEngineOrGpsEvidenceForStaff(s),
  );
  const ganttStaff = sortedStaff.filter((s) => !plannedOnly.includes(s));

  return (
    <div className="space-y-3">
      {/* Sticky top summary bar */}
      <div className="sticky top-0 z-30 -mx-1 rounded-xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date picker */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => onDateChange(subDays(selectedDate, 1))}
              aria-label="Föregående dag"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg font-medium capitalize">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  <span>{dateLabel}</span>
                  <span className="text-xs font-normal text-muted-foreground">· {subLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
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
                <div className="flex justify-center border-t p-2">
                  <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => { onDateChange(new Date()); setCalendarOpen(false); }}>
                    Idag
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => onDateChange(addDays(selectedDate, 1))}
              aria-label="Nästa dag"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="hidden h-6 w-px bg-border md:block" />

          {/* KPI chips */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <KPI icon={<Briefcase className="h-3.5 w-3.5 text-primary" />} label="Arbete" value={fmtMin(totals.work)} />
            <KPI icon={<Activity className="h-3.5 w-3.5 text-blue-500" />} label="Resa" value={fmtMin(totals.travel)} />
            <KPI label="Pågår" value={String(totals.workdayActive)} accent={totals.workdayActive > 0 ? 'emerald' : undefined} />
            <KPI label="Planerade utan rapport" value={String(totals.plannedNoReport)} accent={totals.plannedNoReport > 0 ? 'amber' : undefined} />
            {totals.stale > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <WifiOff className="h-3 w-3" />
                {totals.stale} tappad signal
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Sök personal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-44 rounded-lg pl-8 text-xs"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-8 rounded-lg border bg-background px-2 text-xs"
              title="Sortering"
            >
              <option value="smart">Smart sortering</option>
              <option value="name">Namn</option>
              <option value="start">Starttid</option>
              <option value="most_work">Mest arbetstid</option>
              <option value="most_review">Mest osäker tid</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg text-xs"
              onClick={() => setCompactRange((v) => !v)}
              title="Växla tidsintervall"
            >
              {compactRange ? `Auto ${String(startHour).padStart(2,'0')}–${String(endHour).padStart(2,'0')}` : '00–24'}
            </Button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {([
            { k: 'all', label: 'Alla' },
            { k: 'live', label: 'Pågående' },
            { k: 'review', label: 'Behöver granskas' },
            { k: 'planned_only', label: 'Planerade utan rapport' },
            { k: 'lager', label: 'Bara lager' },
            { k: 'project', label: 'Bara projekt' },
            { k: 'transport', label: 'Bara transport' },
          ] as { k: FilterKey; label: string }[]).map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setFilterKey(f.k)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                filterKey === f.k
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {f.label}
            </button>
          ))}
          {engineMode === 'actual_model_fallback' && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" /> fallback motor
            </span>
          )}
        </div>
      </div>

      {/* Planned but no report — compact group */}
      {plannedOnly.length > 0 && (
        <div className="rounded-xl border bg-muted/20 px-3 py-2">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Planerade – har inte rapporterat tid ({plannedOnly.length})
          </div>
          <ul className="grid gap-x-3 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {plannedOnly.map((staff) => (
              <li key={staff.id}>
                <button
                  type="button"
                  onClick={() => setOpenStaffId(staff.id)}
                  className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent/60"
                  title={staff.plannedLabels.join(' · ')}
                >
                  <span className="truncate font-medium">{staff.name}</span>
                  <span className="ml-2 truncate text-[10px] text-muted-foreground">
                    {staff.plannedLabels[0] ?? 'Planerad'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Calendar main surface — vertical time axis, staff as columns */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : ganttStaff.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Ingen aktivitet att visa för {dateLabel.toLowerCase()}.
          </div>
        ) : (
          (() => {
            const SLOT_PX = 25;
            const HOUR_PX = SLOT_PX * 2;
            const COL_MIN = 95;
            const RAIL_PX = 28;
            const bodyHeight = totalHours * HOUR_PX;
            return (
              <div className="overflow-auto overscroll-contain max-h-[calc(100vh-180px)]">
                <div
                  className="relative grid bg-background"
                  style={{
                    gridTemplateColumns: `${RAIL_PX}px repeat(${ganttStaff.length}, minmax(${COL_MIN}px, 1fr))`,
                    minWidth: RAIL_PX + ganttStaff.length * COL_MIN,
                  }}
                >
                  {/* Top-left corner */}
                  <div className="sticky top-0 z-30 border-b border-r bg-card px-1.5 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Tid
                  </div>

                  {/* Staff column headers */}
                  {ganttStaff.map((staff) => {
                    const blocks = blocksByStaff[staff.id] ?? [];
                    const live = resolveLiveStatus(staff.has_open_report, staff.latestPing);
                    const dotCls =
                      staff.planningStatus === 'workday_active' || live === 'live'
                        ? 'bg-emerald-500 animate-pulse'
                        : live === 'stale'
                          ? 'bg-destructive'
                          : blocks.length
                            ? 'bg-muted-foreground/40'
                            : 'bg-muted-foreground/20';
                    return (
                      <button
                        key={`h-${staff.id}`}
                        type="button"
                        onClick={() => setOpenStaffId(staff.id)}
                        className="sticky top-0 z-20 flex flex-col items-start gap-0.5 border-b border-r bg-card px-2 py-2 text-left hover:bg-muted/40"
                        title={staff.plannedLabels.join(' · ') || staff.role || ''}
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', dotCls)} />
                          <span className="truncate text-[13px] font-semibold">{staff.name}</span>
                        </div>
                        <div className="flex w-full items-center gap-2 text-[10.5px] tabular-nums text-muted-foreground">
                          <span>
                            <span className="font-semibold text-foreground">{fmtMin(staff.metrics.activityMinutes)}</span> arbete
                          </span>
                          {staff.metrics.travelMinutes > 0 && (
                            <span className="text-blue-600 dark:text-blue-400">
                              {fmtMin(staff.metrics.travelMinutes)} resa
                            </span>
                          )}
                        </div>
                        <div className="w-full truncate text-[10px] text-muted-foreground/80">
                          {staff.plannedLabels[0] ?? staff.role ?? '—'}
                        </div>
                      </button>
                    );
                  })}

                  {/* Hour rail (lives in grid column 1, not sticky horizontally so it doesn't overlay blocks) */}
                    <div
                      className="relative border-r bg-muted/15"
                    style={{ height: bodyHeight }}
                  >
                    {hours.slice(0, -1).map((h, i) => (
                      <div
                        key={h}
                        className="relative text-[10px] tabular-nums text-muted-foreground border-b border-border/30"
                        style={{ height: HOUR_PX }}
                      >
                        <span className="absolute top-1 right-1.5 font-medium">
                          {String(h).padStart(2, '0')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Staff columns body */}
                  {ganttStaff.map((staff) => {
                    const blocks = blocksByStaff[staff.id] ?? [];
                    return (
                      <div
                        key={`b-${staff.id}`}
                        className="relative border-r bg-background"
                        style={{ height: bodyHeight }}
                        onClick={() => setOpenStaffId(staff.id)}
                      >
                        {/* hour grid lines */}
                        {Array.from({ length: totalHours }).map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              'absolute left-0 right-0 border-t',
                              i === 0 ? 'border-transparent' : 'border-border/40',
                            )}
                            style={{ top: i * HOUR_PX }}
                          />
                        ))}
                        {/* half-hour subtle lines */}
                        {Array.from({ length: totalHours }).map((_, i) => (
                          <div
                            key={`half-${i}`}
                            className="absolute left-0 right-0 border-t border-dashed border-border/20"
                            style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                          />
                        ))}

                        {/* now line */}
                        {nowFrac != null && (
                          <div
                            className="absolute left-0 right-0 z-10 h-px bg-emerald-500/80"
                            style={{ top: (nowFrac / 100) * bodyHeight }}
                          >
                            <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-emerald-500" />
                          </div>
                        )}

                        {/* blocks — en person kan ALDRIG vara på två ställen samtidigt.
                            Time Engine 2.12: enforceSingleVisibleTimeline garanterar att
                            blocken aldrig överlappar. Vi renderar ALLTID full bredd —
                            inga sub-lanes. Om överlapp ändå smyger sig in markeras blocket
                            med en diskret amber ring som diagnostic warning. */}
                        {(() => {
                          // 1) Räkna fram screen-rects och hoppa över block utanför fönstret.
                          const rects: Array<{
                            b: typeof blocks[number];
                            top: number;
                            height: number;
                            startMs: number;
                            endMs: number;
                            lane: number;
                            laneCount: number;
                          }> = [];
                          for (const b of blocks) {
                            const sH = hourOfDay(b.startAt, dateStr);
                            const eH = hourOfDay(b.endAt, dateStr);
                            const clampedS = Math.max(startHour, Math.min(endHour, sH));
                            const clampedE = Math.max(startHour, Math.min(endHour, eH));
                            if (clampedE <= clampedS) continue;
                            const top = (clampedS - startHour) * HOUR_PX;
                            const height = Math.max(20, (clampedE - clampedS) * HOUR_PX);
                            rects.push({
                              b,
                              top,
                              height,
                              startMs: Date.parse(b.startAt),
                              endMs: Date.parse(b.endAt),
                              lane: 0,
                              laneCount: 1,
                            });
                          }
                          rects.sort((a, b) =>
                            a.startMs !== b.startMs
                              ? a.startMs - b.startMs
                              : (a.endMs - a.startMs) - (b.endMs - b.startMs),
                          );

                          // 2) Lane-assignment (FullCalendar-stil): grupp av överlappande
                          // block delar bredden i parallella kolumner. Diagnostic warning
                          // loggas fortfarande, men visuellt mangelar inget ihop sig.
                          const overlapsPrev = new Set<string>();
                          let group: typeof rects = [];
                          let groupEnd = -Infinity;
                          const flushGroup = () => {
                            if (group.length === 0) return;
                            // Greedy lane packing inom gruppen
                            const laneEnds: number[] = [];
                            for (const r of group) {
                              let placed = false;
                              for (let li = 0; li < laneEnds.length; li++) {
                                if (r.startMs >= laneEnds[li]) {
                                  r.lane = li;
                                  laneEnds[li] = r.endMs;
                                  placed = true;
                                  break;
                                }
                              }
                              if (!placed) {
                                r.lane = laneEnds.length;
                                laneEnds.push(r.endMs);
                              }
                            }
                            const laneCount = laneEnds.length;
                            for (const r of group) r.laneCount = laneCount;
                            group = [];
                          };
                          for (const r of rects) {
                            if (r.startMs >= groupEnd) {
                              flushGroup();
                              groupEnd = r.endMs;
                            } else {
                              groupEnd = Math.max(groupEnd, r.endMs);
                              // markera diagnostic — gruppen har ≥2 block
                              for (const g of group) {
                                overlapsPrev.add(g.b.id);
                                overlapsPrev.add(r.b.id);
                              }
                            }
                            group.push(r);
                          }
                          flushGroup();

                          return rects.map(({ b, top, height, lane, laneCount }) => {
                            const style = KIND_STYLE[b.kind];
                            const displaySubtitle = getGanttDisplaySubtitle(b);
                            const showSub = height >= 56;
                            const showMeta = height >= 80 && laneCount === 1;
                            const overlapping = overlapsPrev.has(b.id);
                            // Smalare kolumner när block överlappar — kantöverlapp på
                            // 4px så blocken visuellt "stackar" lite (likt personalkalendern)
                            const GAP = 2;
                            const OVERLAP_PX = laneCount > 1 ? 4 : 0;
                            const colWidthPct = 100 / laneCount;
                            const leftPct = lane * colWidthPct;
                            return (
                              <div
                                key={b.id}
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBlock({ staffId: staff.id, blockId: b.id });
                                }}
                                className={cn(
                                  'absolute cursor-pointer overflow-hidden rounded-[4px] border px-1.5 pt-1.5 pb-1.5 text-[11px] leading-tight transition-transform hover:scale-[1.02] hover:z-20',
                                  b.isNightGpsOnly
                                    ? 'bg-muted/30 border-dashed border-border/60 opacity-60'
                                    : style.bg,
                                  !b.isNightGpsOnly && style.border,
                                  overlapping && 'ring-1 ring-amber-400/70',
                                )}
                                style={{
                                  top,
                                  height,
                                  left: `calc(${leftPct}% + ${GAP}px)`,
                                  width: `calc(${colWidthPct}% - ${GAP * 2}px + ${OVERLAP_PX}px)`,
                                  zIndex: 5 + lane,
                                  color: '#000000',
                                  boxShadow: '0 1px 2px hsl(var(--foreground) / 0.08)',
                                }}
                                title={
                                  b.isNightGpsOnly
                                    ? `GPS-spår 00:00–05:00 utan tidrapport eller manuell timer.\n${formatStockholmHm(b.startAt)}–${formatStockholmHm(b.endAt)} · ${fmtMin(b.durationMinutes)}\nVisas i råvy / GPS-detalj — räknas inte som arbete.`
                                    : `${b.title}${b.subtitle ? ' · ' + b.subtitle : ''}\n${formatStockholmHm(b.startAt)}–${formatStockholmHm(b.endAt)} · ${fmtMin(b.durationMinutes)}${b.plannedBadgeLabel ? '\nPlanerat: ' + b.plannedBadgeLabel : ''}${overlapping ? '\n⚠ Överlappar annat block' : ''}`
                                }
                              >
                                <div
                                  className="text-[7px] font-bold uppercase tracking-wide rounded px-1 py-px mb-1 w-fit"
                                  style={{
                                    backgroundColor: 'hsl(var(--primary) / 0.15)',
                                    color: 'hsl(var(--primary))',
                                  }}
                                >
                                  {style.label}
                                </div>
                                <div className="font-bold leading-tight break-words" style={{ color: '#000000' }}>
                                  {b.title}
                                </div>
                                {b.plannedBadgeLabel && height >= 40 && (
                                  <div
                                    className="mt-0.5 inline-block max-w-full truncate rounded px-1 py-px text-[9px] font-medium"
                                    style={{
                                      backgroundColor: 'hsl(var(--muted) / 0.6)',
                                      color: 'hsl(var(--muted-foreground))',
                                      border: '1px dashed hsl(var(--border))',
                                    }}
                                    title={`Planerat enligt schemaläggning: ${b.plannedBadgeLabel}`}
                                  >
                                    Planerat: {b.plannedBadgeLabel}
                                  </div>
                                )}
                                {showSub && (
                                  <div className="text-[10px] tabular-nums mt-0.5 break-words" style={{ color: '#000000' }}>
                                    {formatStockholmHm(b.startAt)}–{formatStockholmHm(b.endAt)} · {fmtMin(b.durationMinutes)}
                                  </div>
                                )}
                                {showMeta && displaySubtitle && (
                                  <div className="text-[10px] mt-0.5 truncate" style={{ color: '#000000', opacity: 0.8 }}>
                                    {displaySubtitle}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}

                        {blocks.length === 0 && (
                          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] text-muted-foreground/60">
                            Ingen aktivitet
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* Detail drawer */}
      <Sheet open={!!openStaff} onOpenChange={(o) => { if (!o) setOpenStaffId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {openStaff && (
            <>
              <SheetHeader className="mb-3">
                <SheetTitle className="flex items-center justify-between">
                  <span>{openStaff.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 rounded-md text-xs"
                    onClick={() => onSelectStaff(openStaff.id, openStaff.name)}
                  >
                    Öppna full detaljvy
                  </Button>
                </SheetTitle>
                <p className="text-xs text-muted-foreground">{subLabel}</p>
              </SheetHeader>
              <DrawerBody
                staff={openStaff}
                dateStr={dateStr}
                reportCandidate={reportCandidateByStaff?.[openStaff.id]}
                engineMode={engineMode}
                buildReviewInputs={buildReviewInputs}
                onResolvePlannedGap={handleResolvePlannedGap}
                onRepairFromEvidence={handleRepairFromEvidence}
                onAutoRepairFromEvidence={handleAutoRepairFromEvidence}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      <BlockDetailDialog
        open={!!selectedBlock && !!selectedBlockStaff && !!selectedBlockReportCandidate && !!selectedReportBlock}
        onOpenChange={(open) => {
          if (!open) setSelectedBlock(null);
        }}
        staff={selectedBlockStaff}
        dateStr={dateStr}
        dateLabel={subLabel}
        reportCandidate={selectedBlockReportCandidate}
        blockId={selectedReportBlock?.id ?? null}
      />
    </div>
  );
};

const KPI: React.FC<{ icon?: React.ReactNode; label: string; value: string; accent?: 'emerald' | 'amber' }> = ({ icon, label, value, accent }) => (
  <span className="inline-flex items-center gap-1.5 tabular-nums">
    {icon}
    <span
      className={cn(
        'font-semibold',
        accent === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
        accent === 'amber' && 'text-amber-600 dark:text-amber-400',
        !accent && 'text-foreground',
      )}
    >
      {value}
    </span>
    <span className="text-muted-foreground">{label}</span>
  </span>
);

interface DrawerBodyProps {
  staff: StaffWithDayReport;
  dateStr: string;
  reportCandidate?: any;
  engineMode: 'report_candidate' | 'actual_model_fallback';
  buildReviewInputs: (s: StaffWithDayReport) => { work: ReviewWorkInput[]; travel: ReviewTravelInput[] };
  onResolvePlannedGap: (staffId: string, input: any) => Promise<void>;
  onRepairFromEvidence: (staffId: string, input: any) => Promise<void>;
  onAutoRepairFromEvidence: (staffId: string, input: any) => Promise<{ status: 'created' | 'existing' | 'skipped' }>;
}

interface BlockDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffWithDayReport | null;
  dateStr: string;
  dateLabel: string;
  reportCandidate?: any;
  blockId: string | null;
}

const BlockDetailDialog: React.FC<BlockDetailDialogProps> = ({
  open,
  onOpenChange,
  staff,
  dateStr,
  dateLabel,
  reportCandidate,
  blockId,
}) => {
  const blocks = reportCandidate?.blocks ?? [];
  const excludedPreWork = reportCandidate?.excludedPreWorkBlocks ?? [];
  const selectedBlock = blockId
    ? (blocks.find((block: ReportCandidateBlockUI) => block.id === blockId)
        ?? (blockId.startsWith('pre-')
          ? excludedPreWork.find((block: ReportCandidateBlockUI) => block.id === blockId.slice(4)) ?? null
          : null))
    : null;
  const { pings } = useDayPings({ staffId: staff?.id ?? '', date: dateStr, enabled: open && !!staff?.id });
  const { events } = useDayTimeline({ staffId: staff?.id ?? '', date: dateStr, enabled: open && !!staff?.id });
  const selectedEvent = useMemo(() => {
    if (!selectedBlock) return null;
    const start = new Date(selectedBlock.startAt).getTime();
    const end = new Date(selectedBlock.endAt).getTime();
    return events.find((event) => {
      const ts = new Date(event.ts).getTime();
      return Number.isFinite(ts) && ts >= start && ts <= end;
    }) ?? null;
  }, [events, selectedBlock]);

  if (!staff || !selectedBlock) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[88vh] max-h-[88vh] overflow-hidden p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{staff.name}</span>
            <span className="text-sm font-normal text-muted-foreground">· {dateLabel}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {selectedBlock.title} · {formatStockholmHm(selectedBlock.startAt)}–{formatStockholmHm(selectedBlock.endAt)}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
          <Tabs defaultValue="overview" className="flex flex-col gap-4">
            <TabsList className="w-full justify-start flex-wrap">
              <TabsTrigger value="overview">Översikt</TabsTrigger>
              <TabsTrigger value="map">Karta</TabsTrigger>
              <TabsTrigger value="raw">Rå GPS</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              {/*
                BLOCK-DETALJ — visar ENBART det valda blockets information.
                (Tidigare renderades hela dagens StaffDayTimelineCard här,
                vilket gjorde att klick på ett block återöppnade hela dagen.)
                Använder samma EvidencePanel som /staff-management/time-reports
                så data och layout är identisk per block.
              */}
              <div className="space-y-3">
                <div className="rounded-md border bg-card px-3 py-2">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {selectedBlock.title}
                  </div>
                  {selectedBlock.subtitle && (
                    <div className="text-xs text-muted-foreground truncate">
                      {selectedBlock.subtitle}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {formatStockholmHm(selectedBlock.startAt)} – {formatStockholmHm(selectedBlock.endAt)}
                    {selectedBlock.durationLabel
                      ? ` · ${selectedBlock.durationLabel}`
                      : ''}
                  </div>
                </div>
                <EvidencePanel
                  block={selectedBlock}
                  lookups={{
                    presenceById: new Map(
                      (reportCandidate?.presenceBlocks ?? []).map((p: any) => [p.id, p]),
                    ),
                    targetById: new Map(
                      (reportCandidate?.targets ?? []).map((t: any) => [t.id, t]),
                    ),
                  }}
                  staffId={staff.id}
                  staffName={staff.name}
                  date={dateStr}
                />
              </div>
            </TabsContent>

            <TabsContent value="map" className="mt-0">
              <DecisionMapTab
                staffId={staff.id}
                date={dateStr}
                reportCandidateBlocks={selectedBlock ? [selectedBlock] : []}
              />
            </TabsContent>

            <TabsContent value="raw" className="mt-0 space-y-3">
              <div className="flex justify-end">
                <RawGpsDrawer
                  pings={pings}
                  date={dateStr}
                  staffName={staff.name}
                  selectedEvent={selectedEvent}
                />
              </div>
              <div className="rounded-md border border-border/60">
                <div className="max-h-[420px] overflow-auto p-3 text-xs text-muted-foreground">
                  Öppna “Visa rå GPS-data” för komplett pinglista filtrerad runt valt block.
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DrawerBody: React.FC<DrawerBodyProps> = ({
  staff,
  dateStr,
  reportCandidate,
  engineMode,
  buildReviewInputs,
  onResolvePlannedGap,
  onRepairFromEvidence,
  onAutoRepairFromEvidence,
}) => {
  const { work, travel } = buildReviewInputs(staff);
  return (
    <div className="space-y-3">
      {staff.pingsFetchError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          GPS-historik kunde inte hämtas. ({staff.pingsFetchError})
        </div>
      )}
      <StaffDayTimelineCard
        staffName={staff.name}
        staffId={staff.id}
        date={dateStr}
        model={staff.actualModel}
        lastPingIso={staff.latestPing?.updated_at ?? null}
        reportCandidateBlocks={reportCandidate?.blocks ?? null}
        reportCandidateSummary={reportCandidate?.summary ?? null}
        reportCandidateLoading={reportCandidate?.loading ?? false}
        reportCandidatePresenceBlocks={reportCandidate?.presenceBlocks ?? null}
        reportCandidateTargets={reportCandidate?.targets ?? null}
        reportCandidateDiagnostics={reportCandidate?.diagnostics ?? null}
        reportCandidateExcludedPreWorkBlocks={reportCandidate?.excludedPreWorkBlocks ?? null}
        reportCandidatePreWorkExclusionDiagnostics={reportCandidate?.preWorkExclusionDiagnostics ?? null}
        reportCandidateTargetResolution={reportCandidate?.targetResolution ?? null}
        reportCandidatePresenceRawEvidence={reportCandidate?.presenceRawEvidence ?? null}
        reportCandidateRawGpsTimeline={reportCandidate?.rawGpsTimeline ?? null}
        reportCandidateTechnicalTimeline={reportCandidate?.technicalTimeline ?? null}
        reportCandidatePresenceDaySummary={reportCandidate?.presenceDaySummary ?? null}
        reportCandidatePresenceDayAggregation={reportCandidate?.presenceDayAggregation ?? null}
        reportCandidateTargetMatchSummary={reportCandidate?.targetMatchSummary ?? null}
        reportCandidateCounts={reportCandidate?.counts ?? null}
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
        onResolvePlannedGap={(input) => onResolvePlannedGap(staff.id, input)}
        onRepairWorkdayFromEvidence={(input) => onRepairFromEvidence(staff.id, input)}
        onAutoRepairWorkdayFromEvidence={(input) => onAutoRepairFromEvidence(staff.id, input)}
      />
    </div>
  );
};
