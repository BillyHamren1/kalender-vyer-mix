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
  Plane,
  Users,
  SlidersHorizontal,
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
import {
  resolveGanttPhaseKind,
  buildSessionPhaseMap,
  sessionKeyForBlock,
  resolveBookingPhaseFromTitle,
  applyPlanningPhaseToGanttBlocks,
  type SessionPhaseKind,
} from '@/lib/staff/ganttPhaseColor';
import { mergeContiguousBlocks, type MergeBlockInput, type MergeableKind } from '@/lib/staff/ganttBlockMerge';
import { buildVisualGanttBlocks, visibleChips, type VisualGanttBlock, type VisualGanttDiagnostics } from '@/lib/staff/visualGanttBlocks';
import { applyGanttVisualPipeline as sharedApplyGanttVisualPipeline, type PipelineBlock } from '@/lib/staff/ganttVisualPipeline';
import {
  mapDisplayTimelineBlocksToGantt,
  mapWorkdayAllocationSegmentsToGantt,
  selectGanttSourceFromMapped,
  sessionKeyFromTimelineBlock,
  type GanttBlockFromTimeline,
  type GanttBlockSource,
} from '@/lib/staff/displayTimelineToGanttBlocks';
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
import { buildSuggestedDisplayBlocksForAdminGantt } from '@/lib/staff/reportCandidateGanttParity';
import { EvidencePanel } from './ReportCandidateTimeline';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useRawStaffPingsDebug, isRawPingsDebugEnabled } from '@/hooks/staff/useRawStaffPingsDebug';
import { StaffAppStatusPopover, type StaffAppHealthSummary } from './StaffAppStatusPopover';
import {
  GANTT_HEADER_PX,
  GANTT_NAME_COL_PX,
  GANTT_ROW_PX,
  getGanttEvidenceBarStyle,
  getGanttLaneMetrics,
  shouldShowCompactBlockBadge,
  shouldShowCompactBlockTime,
} from '@/lib/staff/ganttCompactLayout';
import {
  buildReportDataGapDiagnosis,
  describeReportDataGapStatus,
  type ReportDataGapDiagnosis,
} from '@/lib/staff/reportDataGapDiagnostics';

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

const blockTooltipText = (b: GanttBlock, displayTitle: string, overlapping: boolean): string => {
  if (b.isNightGpsOnly) {
    return `GPS-spår 00:00–05:00 utan tidrapport eller manuell timer.\n${formatStockholmHm(b.startAt)}–${formatStockholmHm(b.endAt)} · ${fmtMin(b.durationMinutes)}`;
  }

  const lines = [
    `${displayTitle}${b.subtitle ? ' · ' + b.subtitle : ''}`,
    `${formatStockholmHm(b.startAt)}–${formatStockholmHm(b.endAt)} · ${fmtMin(b.durationMinutes)}`,
  ];

  if (b.plannedBadgeLabel) lines.push(`Planerat: ${b.plannedBadgeLabel}`);

  if (b.subBlocks && b.subBlocks.length > 1) {
    lines.push('Underblock:');
    for (const sub of b.subBlocks) {
      const resolved = KIND_STYLE[sub.resolvedKind]?.label ?? sub.resolvedKind;
      const raw = sub.rawKind && sub.rawKind !== sub.resolvedKind ? ` ← ${sub.rawKind}` : '';
      lines.push(`• ${resolved}${raw} ${formatStockholmHm(sub.startAt)}–${formatStockholmHm(sub.endAt)} · ${fmtMin(sub.durationMinutes)}`);
    }
    if (b.visualGapMinutes && b.visualGapMinutes > 0) {
      lines.push(`Visuellt glapp: ${fmtMin(b.visualGapMinutes)}`);
    }
  }

  if (overlapping) lines.push('⚠ Överlappar annat block');
  return lines.join('\n');
};

const getInitials = (name: string): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Stabil pastell-färg per person (för avatar-cirkel)
const colorFromString = (s: string): { bg: string; fg: string } => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return { bg: `hsl(${h} 70% 88%)`, fg: `hsl(${h} 55% 28%)` };
};

// Stripa trailing " - <datum>" från titel (t.ex. "Westmans Uthyrning - 23 maj 2026")
const stripTrailingDate = (s: string): string => {
  const months = '(?:jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)[a-z]*';
  // " - 23 maj 2026" eller " - 23 maj"
  let out = s.replace(new RegExp(`\\s*[-–·]\\s*\\d{1,2}\\s+${months}\\.?(?:\\s+\\d{4})?\\s*$`, 'i'), '');
  // " - 2026-05-23"
  out = out.replace(/\s*[-–·]\s*\d{4}-\d{2}-\d{2}\s*$/, '');
  return out.trim();
};

// Fallback för tomma titlar — använd subtitle eller targetLabel om title är tom
const blockDisplayTitle = (b: GanttBlock, defaultLabel: string): string => {
  const t = stripTrailingDate((b.title ?? '').trim());
  if (t) return t;
  const sub = stripTrailingDate((b.subtitle ?? '').trim());
  if (sub) return sub;
  return defaultLabel;
};

// ── Block kind → visual style ──────────────────────────────────────────────
type GanttKind = 'work' | 'warehouse' | 'rig' | 'rigdown' | 'transport' | 'review' | 'unknown' | 'break' | 'pre_work';
const KIND_STYLE: Record<
  GanttKind,
  { bg: string; border: string; text: string; ring?: string; label: string }
> = {
  // Generellt event-/projektarbete (ej rig, ej rigdown, ej lager) — neutral slate så lila reserveras för warehouse
  // "Arbete" renderas identiskt med rig — användaren vill aldrig se en separat ARBETE-stil i Gantt-vyn.
  work:      { bg: 'bg-[#F2FCE2] dark:bg-[#F2FCE2]/30',                                     border: 'border-[#C9E8A8]',                text: 'text-[#1f3b14] dark:text-[#F2FCE2]',    label: 'Rigg' },
  // Warehouse/lager = lila (matchar planeringens lager-tagg)
  warehouse: { bg: 'bg-[#E5DEFF] dark:bg-[#E5DEFF]/30',                                     border: 'border-[#BFB1F5]',                text: 'text-[#2a1f5e] dark:text-[#E5DEFF]',    label: 'Lager' },
  // rig + rigdown matchar planeringskalenderns BookingEvent-färger exakt
  // (#F2FCE2 / #FFDEE2). Inga tailwind-emerald/rose — det blev fel ton.
  rig:       { bg: 'bg-[#F2FCE2] dark:bg-[#F2FCE2]/30',                                     border: 'border-[#C9E8A8]',                text: 'text-[#1f3b14] dark:text-[#F2FCE2]',    label: 'Rigg' },
  rigdown:   { bg: 'bg-[#FFDEE2] dark:bg-[#FFDEE2]/30',                                     border: 'border-[#F4B4BC]',                text: 'text-[#4a1a20] dark:text-[#FFDEE2]',    label: 'Rigga ner' },
  transport: { bg: 'bg-sky-200/80 dark:bg-sky-400/40',                                      border: 'border-sky-400',                  text: 'text-sky-950 dark:text-sky-50',         label: 'Transport' },
  review:    { bg: 'bg-amber-50 dark:bg-amber-400/15',                                      border: 'border-amber-300/70 dark:border-amber-400/40',  text: 'text-amber-900 dark:text-amber-100',  label: 'Granska' },
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
  // ── Visual-merge metadata (Gantt 4.0) ─────────────────────────────────
  /** Stabil session-nyckel (booking#:NNNN > target:id > title-fallback). */
  sessionKey?: string;
  /** Raw engine kind (innan phase inheritance) — för diagnostics/tooltip. */
  rawKind?: string;
  /** Underblock om detta är ett mergat block (annars undefined). */
  subBlocks?: Array<{
    id: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    rawKind?: string;
    resolvedKind: GanttKind;
  }>;
  /** Total summerad arbetstid för mergat block (= durationMinutes). */
  countedDurationMinutes?: number;
  /** Summa av glapp mellan underblock i ett mergat block. */
  visualGapMinutes?: number;
  /** UI-layer: chips från absorberade transport/granska/pre_work-block. */
  attachedChips?: string[];
  /** UI-layer: ID:n på block som absorberats in i detta visuella block. */
  absorbedSourceIds?: string[];
  // ── V2/Allocation-metadata (Gantt 5.2) ────────────────────────────────
  /** Engine-resolved targetType (project/large_project/booking/warehouse/...). */
  targetType?: string | null;
  /** Engine-resolved targetId. */
  targetId?: string | null;
  /** Engine-resolved adress (placeringssträng). */
  address?: string | null;
  /** Humanvarningar att visa i drawer/tooltip. */
  warnings?: string[];
  /** Källa: 'displayTimelineV2' | 'workdayAllocation' | 'reportCandidate'. */
  source?: 'displayTimelineV2' | 'workdayAllocation' | 'reportCandidate';
  /** Råa metadata (displayType, severity, allocationType, confidence, ...). */
  meta?: Record<string, unknown>;
  /** ReportCandidate/display-block som denna Gantt-ruta bygger på. */
  reportCandidateBlock?: ReportCandidateBlockUI;
}

const isWarehouseTarget = (b: ReportCandidateBlockUI): boolean => {
  // Lager/warehouse identifieras på label oavsett targetType — internt lager-projekt
  // (FA Warehouse) ligger som booking/project, inte location, men ska ändå vara lila.
  const hay = `${b.title ?? ''} ${b.subtitle ?? ''} ${b.targetLabel ?? ''}`.toLowerCase();
  return /\b(lager|warehouse)\b/.test(hay);
};

/**
 * Resolve fas (rig/rigdown/work|null) för EXAKT detta block — utan
 * sessions-arv. Används både för session-map-bygget och för slutgiltig
 * mappning. Returnerar null om ingen fas hittas.
 */
const resolveBlockPhaseDirect = (
  b: ReportCandidateBlockUI,
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
): SessionPhaseKind | null => {
  const phaseKind = resolveGanttPhaseKind({
    targetType: b.targetType,
    targetId: b.targetId,
    bookingPhaseByDate,
    largeProjectPhaseByDate,
  });
  if (phaseKind === 'rig' || phaseKind === 'rigdown') return phaseKind;
  if (phaseKind === 'work') return 'work';
  // Fallback: bokningsnummer i titel/subtitle (#2603-35R1) → bookingPhaseByDate
  const fromTitle = resolveBookingPhaseFromTitle(b, bookingPhaseByDate);
  if (fromTitle === 'rig' || fromTitle === 'rigdown') return fromTitle;
  const phase = detectPhase(b.title, b.subtitle);
  if (phase) return phase;
  return null;
};

const mapReportCandidateKind = (
  b: ReportCandidateBlockUI,
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  sessionPhaseMap?: Record<string, SessionPhaseKind>,
): GanttKind => {
  if (b.kind === 'work') {
    if (b.reviewState === 'needs_review') return 'review';
    // Warehouse vinner — ska aldrig ärva projektets rig/rigdown-fas
    if (isWarehouseTarget(b)) return 'warehouse';
    const direct = resolveBlockPhaseDirect(b, bookingPhaseByDate, largeProjectPhaseByDate);
    if (direct === 'rig' || direct === 'rigdown') return direct;
    // Sessionsarv: om något syskonblock i samma session har rig/rigdown,
    // ärver detta block samma fas i stället för att bli generic 'work'.
    if (sessionPhaseMap) {
      const sessionPhase = sessionPhaseMap[sessionKeyForBlock(b)];
      if (sessionPhase === 'rig' || sessionPhase === 'rigdown') return sessionPhase;
    }
    return 'work';
  }
  if (b.kind === 'transport') return 'transport';
  if (b.kind === 'needs_review') return 'review';
  if (b.kind === 'unknown') return 'unknown';
  if (b.kind === 'break') return 'break';
  return 'unknown';
};

/**
 * Visual merge — slår ihop adjacent block med samma resolved visualKind +
 * sessionKey + glapp ≤15min till ETT block. Phase inheritance har redan
 * körts före detta steg via mapReportCandidateKind.
 */
const MERGEABLE_KINDS: ReadonlySet<GanttKind> = new Set([
  'work', 'warehouse', 'rig', 'rigdown',
]);
const applyVisualMerge = (blocks: GanttBlock[], staffName?: string): GanttBlock[] => {
  const byId = new Map<string, GanttBlock>();
  const mergeInput: MergeBlockInput[] = blocks.map((b) => {
    byId.set(b.id, b);
    return {
      id: b.id,
      kind: b.kind as MergeableKind,
      sessionKey: b.sessionKey ?? `block:${b.id}`,
      startAt: b.startAt,
      endAt: b.endAt,
      durationMinutes: b.durationMinutes,
      rawKind: b.rawKind,
      isOpen: b.isOpen,
      isNightGpsOnly: b.isNightGpsOnly,
    };
  });
  const { blocks: merged, diagnostics } = mergeContiguousBlocks(mergeInput, { maxGapMinutes: 15 });

  if (diagnostics.mergedBlockCount > 0 && typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn('[Gantt 4.0] visualMerge', {
      staff: staffName,
      ...diagnostics,
    });
  }

  // Återhydrera: behåll title/subtitle/plannedBadgeLabel från första underblocket
  const result: GanttBlock[] = merged.map((m) => {
    const first = byId.get(m.mergedFromIds[0])!;
    return {
      ...first,
      id: m.id,
      kind: m.kind as GanttKind,
      startAt: m.startAt,
      endAt: m.endAt,
      durationMinutes: m.durationMinutes,
      sessionKey: m.sessionKey,
      rawKind: m.rawKind,
      subBlocks: m.subBlocks.map((s) => ({
        ...s,
        resolvedKind: s.resolvedKind as GanttKind,
      })),
      countedDurationMinutes: m.countedDurationMinutes,
      visualGapMinutes: m.visualGapMinutes,
    };
  });
  return result.sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
};

const timelineBlockToGanttBlock = (b: GanttBlockFromTimeline): GanttBlock => ({
  id: b.id,
  kind: b.kind as GanttKind,
  startAt: b.startAt,
  endAt: b.endAt,
  durationMinutes: b.durationMinutes,
  title: b.title,
  subtitle: b.subtitle ?? null,
  rawKind:
    (b.meta && (b.meta.displayType as string)) ||
    (b.meta && (b.meta.allocationType as string)) ||
    undefined,
  sessionKey: sessionKeyFromTimelineBlock(b),
  targetType: b.targetType,
  targetId: b.targetId,
  address: b.address,
  warnings: b.warnings,
  source: b.source,
  meta: b.meta,
});

/**
 * Visual pipeline för V2/allocation-block: delegerar till den delade,
 * testtäckta helpern i @/lib/staff/ganttVisualPipeline så att UI och
 * integrationstester garanterat kör samma kod.
 */
const applyGanttVisualPipeline = (
  blocks: GanttBlock[],
  staffName: string,
  diagSink?: (d: VisualGanttDiagnostics) => void,
): GanttBlock[] => {
  if (blocks.length === 0) return [];
  // GanttBlock är strukturellt kompatibel med PipelineBlock (id/kind/start/end/...).
  const { blocks: out, mergeDiagnostics, visualDiagnostics } =
    sharedApplyGanttVisualPipeline<GanttBlock & PipelineBlock>(
      blocks as Array<GanttBlock & PipelineBlock>,
      { staffName, maxMergeGapMinutes: 15 },
    );
  if (diagSink) diagSink(visualDiagnostics);
  if (
    typeof console !== 'undefined' &&
    (mergeDiagnostics.mergedBlockCount > 0 ||
      visualDiagnostics.absorbedTransportCount +
        visualDiagnostics.absorbedReviewCount +
        visualDiagnostics.absorbedUnknownCount +
        visualDiagnostics.absorbedPreWorkCount +
        visualDiagnostics.hiddenPreWorkCount >
        0)
  ) {
    // eslint-disable-next-line no-console
    console.warn('[Gantt 5.4] visualPipeline (shared)', {
      staff: staffName,
      merge: mergeDiagnostics,
      visual: visualDiagnostics,
    });
  }
  return out as GanttBlock[];
};

const blocksFromStaff = (
  staff: StaffWithDayReport,
  candidate: ReportCandidateBlockUI[] | null | undefined,
  excludedPreWork: ReportCandidateBlockUI[] | null | undefined,
  presenceBlocks?: any[] | null,
  targets?: any[] | null,
  date?: string | null,
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>,
  diagSink?: (d: VisualGanttDiagnostics) => void,
): GanttBlock[] => {
  const out: GanttBlock[] = [];
  if (candidate && candidate.length) {
    const parityBlocks = buildSuggestedDisplayBlocksForAdminGantt({
      blocks: candidate,
      presenceBlocks: presenceBlocks ?? [],
      targets: targets ?? [],
      staffName: staff.name,
      date: date ?? null,
    });
    if (parityBlocks.length > 0) {
      const phaseInputs = parityBlocks.filter((b) => b.kind === 'work' && !isWarehouseTarget(b));
      const perBlockPhase: Record<string, SessionPhaseKind | null> = {};
      for (const b of phaseInputs) {
        perBlockPhase[b.id] = resolveBlockPhaseDirect(b, bookingPhaseByDate, largeProjectPhaseByDate);
      }
      const sessionPhaseMap = buildSessionPhaseMap(
        phaseInputs.map((b) => ({
          id: b.id,
          targetType: b.targetType,
          targetId: b.targetId,
          title: b.title,
          subtitle: b.subtitle,
          startAt: b.startAt,
          endAt: b.endAt,
        })),
        perBlockPhase,
      );

      const parityGantt: GanttBlock[] = parityBlocks.map((b) => ({
        id: b.id,
        kind:
          b.kind === 'work'
            ? mapReportCandidateKind(b, bookingPhaseByDate, largeProjectPhaseByDate, sessionPhaseMap)
            : b.ganttKind,
        startAt: b.startAt,
        endAt: b.endAt,
        durationMinutes: b.durationMinutes,
        title: b.displayTitle ?? b.title,
        subtitle: b.displaySubtitle ?? b.subtitle ?? null,
        rawKind: b.kind,
        sessionKey: sessionKeyForBlock({
          id: b.id,
          targetType: b.targetType,
          targetId: b.targetId,
          title: b.title,
          subtitle: b.subtitle,
        }),
        targetType: b.targetType,
        targetId: b.targetId,
        source: 'reportCandidate',
        reportCandidateBlock: b,
      }));
      // Samma visualMerge som engine-vägen — annars blir adjacent RIGG-block
      // (olika bookings) renderade som separata kort i stället för ett.
      return applyVisualMerge(parityGantt, staff.name);
    }

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
    let privateHomeBlocksSuppressedCount = 0;

    const isPrivateHomeBlock = (b: ReportCandidateBlockUI & { reviewReasons?: string[]; warningLabel?: string | null; title?: string | null; targetLabel?: string | null }) => {
      const reasons = Array.isArray((b as any).reviewReasons) ? (b as any).reviewReasons : [];
      const hay = `${b.title ?? ''} ${b.targetLabel ?? ''} ${(b as any).warningLabel ?? ''}`.toLowerCase();
      return b.targetType === 'private_residence'
        || reasons.includes('private_residence')
        || reasons.includes('private_residence_status')
        || reasons.includes('home_private_conflict')
        || /\bjag är hemma\b|\bhemma\b|\bprivat zon\b|\bprivate residence\b/.test(hay);
    };

    const processBlock = (b: ReportCandidateBlockUI, isPreWork: boolean) => {
      // Time Engine 4.x — hiddenReason-block får aldrig renderas i Gantt.
      // Backend flaggar dem (open_day_signal_gap_without_presence, pre_first_gps_signal_gap,
      // short_onsite_anchor_noise) men de ligger kvar i cache för diagnostics.
      if ((b as any).hiddenReason) {
        return;
      }
      if (isPrivateHomeBlock(b as any)) {
        privateHomeBlocksSuppressedCount += 1;
        return;
      }

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
          : mapReportCandidateKind(b, bookingPhaseByDate, largeProjectPhaseByDate, sessionPhaseMap),
        startAt: b.startAt,
        endAt: b.endAt,
        durationMinutes: b.durationMinutes,
        title: isNightGpsOnly ? 'GPS – natt, ej rapporterat' : resolved,
        subtitle: isPreWork ? 'Före arbetsdag' : (b.subtitle ?? null),
        plannedBadgeLabel: isNightGpsOnly ? null : resolution.plannedBadgeLabel,
        isNightGpsOnly,
        sessionKey: sessionKeyForBlock({
          id: b.id,
          targetType: b.targetType,
          targetId: b.targetId,
          title: b.title,
          subtitle: b.subtitle,
        }),
        rawKind: b.kind,
      });
    };

    // Pre-pass: bygg sessionPhaseMap så att fas ärvs INOM samma jobb/session.
    // Warehouse-block exkluderas (eget visuellt spår; ska inte smitta projektrigg).
    const phaseInputs = candidate.filter((b) => b.kind === 'work' && !isWarehouseTarget(b));
    const perBlockPhase: Record<string, SessionPhaseKind | null> = {};
    for (const b of phaseInputs) {
      perBlockPhase[b.id] = resolveBlockPhaseDirect(b, bookingPhaseByDate, largeProjectPhaseByDate);
    }
    const sessionPhaseMap = buildSessionPhaseMap(
      phaseInputs.map((b) => ({
        id: b.id,
        targetType: b.targetType,
        targetId: b.targetId,
        title: b.title,
        subtitle: b.subtitle,
        startAt: b.startAt,
        endAt: b.endAt,
      })),
      perBlockPhase,
    );

    for (const b of candidate) processBlock(b, false);
    // pre_work renderas INTE i huvudtidslinjen. Hålls bara som diagnostics
    // (drawer kan fortfarande visa via reportCandidate.excludedPreWorkBlocks).
    const hiddenPreWorkCount = excludedPreWork?.length ?? 0;

    if ((labelDiagnostics.unknownKeptCount > 0 || nightGpsOnlySuppressedCount > 0 || privateHomeBlocksSuppressedCount > 0 || hiddenPreWorkCount > 0)
        && typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[Gantt 3.9] actualVsPlanned + nightGuard', {
        staff: staff.name,
        ...labelDiagnostics,
        nightGpsOnlySuppressedCount,
        privateHomeBlocksSuppressedCount,
        hiddenPreWorkCountFromMainTimeline: hiddenPreWorkCount,
      });
    }

    // Steg 1: merge angränsande tekniska block (befintligt beteende).
    const merged = applyVisualMerge(out, staff.name);

    // Steg 2: UI-derive — absorbera kort transport/granska/okänd som chips
    // på närmaste huvudblock. Lane-packing får bara hända när två RIKTIGA
    // huvudjobb överlappar.
    const visual = buildVisualGanttBlocks(
      merged.map((b) => ({
        id: b.id,
        kind: b.kind,
        startAt: b.startAt,
        endAt: b.endAt,
        durationMinutes: b.durationMinutes,
        title: b.title,
        subtitle: b.subtitle ?? null,
        sessionKey: b.sessionKey,
        isNightGpsOnly: b.isNightGpsOnly,
      })),
      { staffName: staff.name },
    );

    if (diagSink) diagSink(visual.diagnostics);
    if (typeof console !== 'undefined' && (visual.diagnostics.absorbedTransportCount + visual.diagnostics.absorbedReviewCount + visual.diagnostics.absorbedUnknownCount + visual.diagnostics.absorbedPreWorkCount + visual.diagnostics.hiddenPreWorkCount) > 0) {
      // eslint-disable-next-line no-console
      console.warn('[Gantt 5.0] visualGanttDiagnostics', visual.diagnostics);
    }

    const byId = new Map(merged.map((b) => [b.id, b]));
    return visual.blocks
      .map<GanttBlock | null>((v) => {
        const src = byId.get(v.id);
        if (!src) return null;
        return {
          ...src,
          attachedChips: v.chips.length > 0 ? v.chips : undefined,
          absorbedSourceIds: v.attachedEvents.map((a) => a.id),
        };
      })
      .filter((b): b is GanttBlock => b !== null);
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
      // Lager 4.1 — Display Timeline V2 (primär Gantt-källa).
      displayTimelineBlocksV2?: any[];
      displayTimelineDiagnosticsV2?: any;
      // Lager 3 — Workday Allocation (fallback när V2 saknas).
      workdayAllocationSegments?: any[];
      workdayAllocationDiagnostics?: any;
      loading: boolean;
      missing?: boolean;
    } | undefined
  >;
  engineMode?: 'report_candidate' | 'actual_model_fallback';
  bookingPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>;
  largeProjectPhaseByDate?: Record<string, 'rig' | 'event' | 'rigdown'>;
  /**
   * READ-ONLY diagnostics-callback: emitterar per-staff Gantt-källval,
   * source-counts, renderade block och visualDiagnostics. Används av
   * "Export Trace JSON" på /staff-management/time-reports. Påverkar
   * INTE rendering.
   */
  onGanttDiagnosticsChange?: (
    snapshot: Record<string, import('@/lib/staff/timeEngineTraceExport').GanttExportSnapshotForStaff>,
  ) => void;
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
  onGanttDiagnosticsChange,
}) => {
  const [search, setSearch] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('smart');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<{ staffId: string; blockId: string } | null>(null);
  const [compactRange, setCompactRange] = useState(false); // visa hela dygnet 00–24
  const [hourPx, setHourPx] = useState(112); // användarstyrd zoom (px per timme)
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

  // Per-staff blocks + visual diagnostics.
  // Källprioritet (Gantt 5.2):
  //   1. mapped displayTimelineBlocksV2 > 0 → V2 (visual pipeline)
  //   2. mapped workdayAllocationSegments > 0 → allocation (visual pipeline)
  //   3. reportCandidateBlocks > 0 → legacy (geo + visual pipeline)
  // OBS: vi väljer på MAPPED count, inte rå count. En V2-uppsättning med
  // bara private/hidden-block får annars tom Gantt trots att legacy/alloc
  // har riktiga block.
  const { blocksByStaff, visualDiagByStaff, sourceByStaff, sourceCountsByStaff } = useMemo(() => {
    const map: Record<string, GanttBlock[]> = {};
    const diag: Record<string, VisualGanttDiagnostics> = {};
    const sources: Record<string, GanttBlockSource> = {};
    const counts: Record<string, {
      rawV2: number;
      mappedV2: number;
      rawAlloc: number;
      mappedAlloc: number;
      legacy: number;
      rendered: number;
    }> = {};
    for (const s of staffList) {
      const cand = reportCandidateByStaff?.[s.id];
      const v2Blocks = cand?.displayTimelineBlocksV2 ?? [];
      const allocSegs = cand?.workdayAllocationSegments ?? [];
      const legacyBlocks = cand?.blocks ?? [];

      // Time Legacy Purge 1 — om V2-fältet returnerades alls (även tom array)
      // är V2 sanningen. Legacy reportCandidate får inte fylla i som UI-källa.
      const hasV2Field = (cand as any)?.hasDisplayTimelineV2Field === true;

      // Mappa direkt så vi vet vad som är renderbart.
      const mappedV2Raw = mapDisplayTimelineBlocksToGantt(v2Blocks as any).map(timelineBlockToGanttBlock);
      const mappedAllocRaw = mapWorkdayAllocationSegmentsToGantt(allocSegs as any).map(timelineBlockToGanttBlock);
      // Time Gantt Phase Fix — applicera personalkalenderns rig/event/rigdown
      // även på V2 och allocation-block. Warehouse/transport/review rörs ej.
      const mappedV2 = applyPlanningPhaseToGanttBlocks(
        mappedV2Raw,
        bookingPhaseByDate,
        largeProjectPhaseByDate,
      ) as GanttBlock[];
      const mappedAlloc = applyPlanningPhaseToGanttBlocks(
        mappedAllocRaw,
        bookingPhaseByDate,
        largeProjectPhaseByDate,
      ) as GanttBlock[];

      // ── DEL 1 / Fix B — V2 explicit suppression-guard ──
      const wdaDiag = cand?.workdayAllocationDiagnostics ?? null;
      const dtDiag = cand?.displayTimelineDiagnosticsV2 ?? null;
      const wdaWarnings: string[] = Array.isArray(wdaDiag?.warnings) ? wdaDiag.warnings : [];
      const dtWarnings: string[] = Array.isArray(dtDiag?.warnings) ? dtDiag.warnings : [];

      const v2HardBlocked =
        wdaDiag?.engineBlockedBecauseLocationTruthMissing === true ||
        wdaDiag?.hasRawPingsButNoLocationTruth === true ||
        dtWarnings.includes('display_suppressed_because_missing_location_truth') ||
        dtWarnings.includes('display_suppressed_open_timer_without_evidence') ||
        wdaWarnings.includes('open_timer_without_same_day_evidence') ||
        wdaWarnings.includes('open_timer_ignored_after_inferred_day_end') ||
        wdaDiag?.canonicalTimer?.staleOpenTimerIgnored === true;

      // Suggested-Only Policy (2026-05-17):
      // I admin-tidrapportsvyn är ALLT förslag. reportCandidate är samma
      // motor som detaljmodalen renderar, så när motorn producerat block
      // för dagen ska Gantt-raden visa exakt dessa block — oavsett om V2-
      // fältet finns eller om committed time_reports/LTE saknas.
      // V2/allocation används endast som visuell pipeline när reportCandidate
      // är tom (t.ex. dag helt utan GPS).
      const legacyIgnored = false;
      const legacyIgnoredReason: string | null = null;

      const selected: GanttBlockSource = legacyBlocks.length > 0
        ? 'reportCandidate'
        : selectGanttSourceFromMapped({
            mappedV2Count: mappedV2.length,
            mappedAllocationCount: mappedAlloc.length,
            legacyCount: 0,
            hasV2Field,
          });
      const finalSelected: GanttBlockSource = selected;
      sources[s.id] = finalSelected;

      let blocks: GanttBlock[] = [];
      if (selected === 'displayTimelineV2') {
        blocks = applyGanttVisualPipeline(mappedV2, s.name, (d) => { diag[s.id] = d; });
      } else if (selected === 'workdayAllocation') {
        blocks = applyGanttVisualPipeline(mappedAlloc, s.name, (d) => { diag[s.id] = d; });
      } else if (selected === 'reportCandidate') {
        blocks = blocksFromStaff(
          s,
          legacyBlocks,
          null,
          cand?.presenceBlocks ?? [],
          cand?.targets ?? [],
          dateStr,
          bookingPhaseByDate,
          largeProjectPhaseByDate,
          (d) => { diag[s.id] = d; },
        );
        blocks = blocks.map((b) => ({ ...b, source: b.source ?? 'reportCandidate' }));
      }
      map[s.id] = blocks;
      counts[s.id] = {
        rawV2: v2Blocks.length,
        mappedV2: mappedV2.length,
        rawAlloc: allocSegs.length,
        mappedAlloc: mappedAlloc.length,
        legacy: legacyBlocks.length,
        rendered: blocks.length,
      };

      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.warn('[Gantt source]', {
          staffName: s.name,
          rawDisplayTimelineBlocksV2Count: v2Blocks.length,
          mappedDisplayTimelineBlocksV2Count: mappedV2.length,
          rawWorkdayAllocationSegmentsCount: allocSegs.length,
          mappedWorkdayAllocationBlocksCount: mappedAlloc.length,
          reportCandidateBlocksCount: legacyBlocks.length,
          selectedCanonicalSource: finalSelected,
          legacyReportCandidateIgnored: legacyIgnored,
          legacyIgnoredReason,
          renderedBlockCount: blocks.length,
        });
      }
    }
    return {
      blocksByStaff: map,
      visualDiagByStaff: diag,
      sourceByStaff: sources,
      sourceCountsByStaff: counts,
    };
  }, [staffList, reportCandidateByStaff, bookingPhaseByDate, largeProjectPhaseByDate]);

  // Renderat block för aktuell selectedBlock — används av dialogen som
  // fallback när blocket kommer från V2/allocation och inte finns i legacy
  // reportCandidate.blocks.
  const selectedRenderedBlock = useMemo<GanttBlock | null>(() => {
    if (!selectedBlock) return null;
    const list = blocksByStaff[selectedBlock.staffId] ?? [];
    return list.find((b) => b.id === selectedBlock.blockId) ?? null;
  }, [selectedBlock, blocksByStaff]);
  const selectedCanonicalReportBlock =
    selectedReportBlock ?? selectedRenderedBlock?.reportCandidateBlock ?? null;

  // Dev/debug-flagga för att visa per-rad diagnostics-badge i UI.
  // Aktiveras via: localStorage.setItem('gantt:debug','1')  eller via DEV-builds.
  const ganttDebug = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (window.localStorage?.getItem('gantt:debug') === '1') return true;
    } catch { /* ignore */ }
    // @ts-ignore
    return !!(import.meta as any)?.env?.DEV;
  }, []);

  // ── Per-rad diagnos (Raw GPS + app health + Gantt-källkedjan) ─────────
  // Aktiveras med: localStorage.setItem('time-engine:raw-pings','1')
  //               eller localStorage.setItem('gantt:debug','1')
  const diagnosticsEnabled = useMemo(() => {
    if (ganttDebug) return true;
    try { return isRawPingsDebugEnabled(); } catch { return false; }
  }, [ganttDebug]);
  const { organizationId: diagOrgId } = useCurrentOrg();
  // GPS-evidence guard: hämta råa pings när minst en staff i listan saknar
  // renderbar arbetstid, så att vi kan visa en diskret evidence-bar i Gantt
  // även när V2/allocation/legacy alla säger "tomt". Detta skapar ALDRIG
  // arbetstid — det visar bara att systemet har platsdata.
  const someStaffMissingRenderedWork = useMemo(
    () => staffList.some((s) => (blocksByStaff[s.id]?.length ?? 0) === 0),
    [staffList, blocksByStaff],
  );
  const { data: rawPingsData } = useRawStaffPingsDebug({
    organizationId: diagOrgId,
    date: dateStr,
    includeRows: false,
    enabled: diagnosticsEnabled || someStaffMissingRenderedWork,
  });
  const diagnosisByStaff = useMemo(() => {
    const map = new Map<string, ReportDataGapDiagnosis>();
    if (!diagnosticsEnabled) return map;
    const pingsByStaff = new Map<string, NonNullable<typeof rawPingsData>['perStaff'][number]>();
    for (const e of rawPingsData?.perStaff ?? []) pingsByStaff.set(e.staffId, e);
    for (const s of staffList) {
      const e = pingsByStaff.get(s.id);
      const counts = sourceCountsByStaff[s.id];
      map.set(
        s.id,
        buildReportDataGapDiagnosis({
          staffId: s.id,
          staffName: s.name,
          date: dateStr,
          rawPings: {
            rawPingCount: e?.pingCount ?? 0,
            firstRawPingAt: e?.firstRecordedAt ?? null,
            lastRawPingAt: e?.lastRecordedAt ?? null,
            maxRawGapMinutes: e?.maxPingGapMinutes ?? null,
            gapCountOver15Min: e?.gapCountOver15Min,
            gapCountOver60Min: e?.gapCountOver60Min,
            medianAccuracy: e?.medianAccuracy ?? null,
            p90Accuracy: e?.p90Accuracy ?? null,
            lowBatteryBeforeGap: e?.battery?.likelyBatteryRelatedSignalLoss,
            batteryDroppedFast: e?.battery?.batteryDroppedFast,
            lastBatteryPercent: e?.battery?.lastBatteryPercent ?? null,
          },
          appHealth: e?.appHealth
            ? {
                lastAppSeenAt: e.appHealth.lastAppSeenAt,
                lastAppState: e.appHealth.lastAppState,
                lastHealthEventType: e.appHealth.lastEventType,
                lastBatteryPercent: e.appHealth.lastBatteryPercent,
                latestIsCharging: e.appHealth.lastIsCharging,
              }
            : null,
          reportChain: {
            isShownInReportList: true, // staff syns i listan
            displayTimelineBlocksV2Count: counts?.mappedV2 ?? null,
            renderedGanttBlocks: counts?.rendered ?? null,
          },
        }),
      );
    }
    return map;
  }, [diagnosticsEnabled, rawPingsData?.perStaff, staffList, sourceCountsByStaff, dateStr]);

  // ── GPS-evidence (UI-only, räknas ALDRIG som arbetstid) ──────────────
  // När en rad saknar renderbar arbetstid men ändå har GPS/LocationTruth,
  // bygger vi en separat evidence-beskrivning som renderas som en diskret
  // bar i timeline-cellen. Detta påverkar INTE:
  //   • staff.metrics.activityMinutes / travelMinutes / lönegrundande tid
  //   • exports som arbetstid
  //   • filter typ "bara projekt"
  // Den syns bara i Gantt-vyn för att operator ska se att systemet HAR data.
  const evidenceByStaff = useMemo<Record<string, {
    startAt: string | null;
    endAt: string | null;
    source: 'raw_pings' | 'location_truth_v2' | 'missing_engine';
    label: string;
    rawPingCount: number;
    locationTruthSegmentCount: number;
  } | null>>(() => {
    const pingsByStaff = new Map<string, NonNullable<typeof rawPingsData>['perStaff'][number]>();
    for (const e of rawPingsData?.perStaff ?? []) pingsByStaff.set(e.staffId, e);
    const out: Record<string, any> = {};
    for (const s of staffList) {
      if ((blocksByStaff[s.id]?.length ?? 0) > 0) { out[s.id] = null; continue; }
      const ping = pingsByStaff.get(s.id);
      const rawPingCount = ping?.pingCount ?? 0;
      const cand: any = reportCandidateByStaff?.[s.id];
      const ltSegs: any[] = Array.isArray(cand?.locationTruthV2Segments) ? cand.locationTruthV2Segments : [];
      const ltCount = ltSegs.length
        || (cand?.workdayAllocationDiagnostics?.locationTruthV2SegmentCount ?? 0)
        || (cand?.counts?.locationTruthV2SegmentCount ?? 0)
        || 0;

      let startAt: string | null = null;
      let endAt: string | null = null;
      let source: 'raw_pings' | 'location_truth_v2' | 'missing_engine' = 'missing_engine';
      let label = 'GPS finns men Time Engine saknas';

      if (rawPingCount > 0 && ping?.firstRecordedAt && ping?.lastRecordedAt) {
        startAt = ping.firstRecordedAt;
        endAt = ping.lastRecordedAt;
        source = 'raw_pings';
        const range = `${formatStockholmHm(startAt)}–${formatStockholmHm(endAt)}`;
        label = ltCount > 0
          ? `Platsdata finns ${range} · ingen renderbar arbetstid`
          : `GPS finns ${range} · ingen aktiv arbetsdag`;
      } else if (ltSegs.length > 0) {
        const sorted = ltSegs
          .filter((x) => x && (x.startAt || x.startsAt) && (x.endAt || x.endsAt))
          .map((x) => ({ s: x.startAt ?? x.startsAt, e: x.endAt ?? x.endsAt }))
          .sort((a, b) => new Date(a.s).getTime() - new Date(b.s).getTime());
        if (sorted.length > 0) {
          startAt = sorted[0].s;
          endAt = sorted[sorted.length - 1].e;
          source = 'location_truth_v2';
          label = `Platsdata finns ${formatStockholmHm(startAt!)}–${formatStockholmHm(endAt!)} · ingen renderbar arbetstid`;
        }
      } else if (rawPingCount > 0) {
        source = 'raw_pings';
        label = 'GPS finns men Time Engine saknas';
      } else {
        out[s.id] = null;
        continue;
      }
      out[s.id] = { startAt, endAt, source, label, rawPingCount, locationTruthSegmentCount: ltCount };
    }
    return out;
  }, [staffList, blocksByStaff, rawPingsData?.perStaff, reportCandidateByStaff]);


  // ── READ-ONLY: emittera Gantt-diagnostik till parent (för Export Trace JSON).
  // Påverkar inte rendering. Aktiveras endast när parent bryr sig (callback satt).
  useEffect(() => {
    if (!onGanttDiagnosticsChange) return;
    const snap: Record<string, import('@/lib/staff/timeEngineTraceExport').GanttExportSnapshotForStaff> = {};
    for (const s of staffList) {
      const blocks = blocksByStaff[s.id] ?? [];
      const counts = sourceCountsByStaff[s.id];
      snap[s.id] = {
        selectedSource: sourceByStaff[s.id] ?? null,
        rawV2: counts?.rawV2 ?? 0,
        mappedV2: counts?.mappedV2 ?? 0,
        rawAllocation: counts?.rawAlloc ?? 0,
        mappedAllocation: counts?.mappedAlloc ?? 0,
        legacyCount: counts?.legacy ?? 0,
        renderedCount: counts?.rendered ?? blocks.length,
        renderedBlocks: blocks.map((b: any) => ({
          id: b.id,
          kind: String(b.kind ?? ''),
          startAt: b.startAt ?? null,
          endAt: b.endAt ?? null,
          durationMinutes: b.durationMinutes ?? null,
          title: b.title ?? null,
          subtitle: b.subtitle ?? null,
          isOpen: !!b.isOpen,
          source: b.source ?? null,
        })),
        visualDiagnostics: visualDiagByStaff[s.id] ?? null,
        sourceCounts: counts ?? null,
      };
    }
    onGanttDiagnosticsChange(snap);
  }, [onGanttDiagnosticsChange, staffList, blocksByStaff, sourceByStaff, sourceCountsByStaff, visualDiagByStaff]);

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
    <div className="flex h-full flex-col">
      {/* Premium top header */}
      <div className="shrink-0 border-b border-border/60 bg-card px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Title + datepicker */}
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tidrapporter</h1>
            <div className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-background px-1.5 py-1 shadow-sm">
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
                  <Button variant="ghost" size="sm" className="h-8 gap-2 rounded-lg px-3 font-medium capitalize">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{dateLabel}</span>
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
          </div>

          {/* Summary cards borttagna per användarens önskemål */}

          {/* Right tools */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Sök personal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-52 rounded-xl border-border/70 bg-background pl-9 text-sm shadow-sm"
              />
            </div>
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-9 appearance-none rounded-xl border border-border/70 bg-background pl-9 pr-8 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                title="Sortering"
              >
                <option value="smart">Smart sortering</option>
                <option value="name">Namn</option>
                <option value="start">Starttid</option>
                <option value="most_work">Mest arbetstid</option>
                <option value="most_review">Mest osäker tid</option>
              </select>
              <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background px-1 shadow-sm">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setHourPx((px) => Math.max(24, px - 16))}
                title="Zooma ut tidslinjen"
                aria-label="Zooma ut"
              >
                <span className="text-base leading-none">−</span>
              </Button>
              <span className="min-w-[2.5rem] text-center text-xs tabular-nums text-muted-foreground">{hourPx}px/h</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setHourPx((px) => Math.min(240, px + 16))}
                title="Zooma in tidslinjen"
                aria-label="Zooma in"
              >
                <span className="text-base leading-none">+</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {engineMode === 'actual_model_fallback' && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3" /> fallback motor
              </span>
            )}
            {totals.stale > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
                <WifiOff className="h-3 w-3" />
                {totals.stale} tappad signal
              </span>
            )}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            title="Anpassa vy"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Anpassa vy
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-auto bg-card">
        <div className="space-y-4 p-5">
      {/* Planned but no report — premium summary panel */}
      {plannedOnly.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold text-foreground">
              Planerade – har inte rapporterat tid <span className="text-muted-foreground font-normal">({plannedOnly.length})</span>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              <Users className="h-3.5 w-3.5" />
              Visa alla ({plannedOnly.length})
            </button>
          </div>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {plannedOnly.map((staff) => (
              <li key={staff.id}>
                <button
                  type="button"
                  onClick={() => setOpenStaffId(staff.id)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-accent/40"
                  title={staff.plannedLabels.join(' · ')}
                >
                  <span className="truncate font-medium text-foreground">{staff.name}</span>
                  <span className="ml-2 truncate text-[11px] font-medium text-primary/80">
                    {staff.plannedLabels[0] ?? 'Planerad'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Calendar main surface — modern timeline 2030 */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_hsl(var(--foreground)/0.04)]">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : ganttStaff.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Ingen aktivitet att visa för {dateLabel.toLowerCase()}.
          </div>
        ) : (
          (() => {
            const NAME_COL_PX = GANTT_NAME_COL_PX;
            const HOUR_PX = hourPx;
            const ROW_PX = GANTT_ROW_PX;
            const timelineWidth = totalHours * HOUR_PX;

            const blockGeometry = (b: GanttBlock) => {
              const sH = hourOfDay(b.startAt, dateStr);
              const eH = hourOfDay(b.endAt, dateStr);
              const clampedS = Math.max(startHour, Math.min(endHour, sH));
              const clampedE = Math.max(startHour, Math.min(endHour, eH));
              if (clampedE <= clampedS) return null;
              const left = (clampedS - startHour) * HOUR_PX;
              const width = Math.max(36, (clampedE - clampedS) * HOUR_PX);
              return { left, width };
            };

            return (
              <div className="overflow-auto overscroll-contain max-h-[calc(100vh-180px)]">
                <div style={{ minWidth: NAME_COL_PX + timelineWidth }}>
                  {/* Header-rad: "Personal" + timmar */}
                  <div
                    className="sticky top-0 z-30 flex border-b border-border/60 bg-card/95 backdrop-blur-md"
                    style={{ height: GANTT_HEADER_PX }}
                  >
                    <div
                      className="sticky left-0 z-40 flex flex-col justify-center border-r border-border/60 bg-card/95 px-4 backdrop-blur-md"
                      style={{ width: NAME_COL_PX, minWidth: NAME_COL_PX }}
                    >
                      <div className="text-[13px] font-semibold tracking-tight">Personal</div>
                      <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">
                        {ganttStaff.length} personer
                      </div>
                    </div>
                      <div className="relative" style={{ width: timelineWidth, height: GANTT_HEADER_PX - 12 }}>
                      {hours.slice(0, -1).map((h, i) => {
                        const isLunch = h === 12;
                        return (
                          <div
                            key={h}
                            className={cn(
                              'absolute top-0 bottom-0 flex items-center text-[11px] tabular-nums',
                              isLunch ? 'text-foreground/80 font-medium' : 'text-muted-foreground/70',
                            )}
                            style={{ left: i * HOUR_PX, width: HOUR_PX, paddingLeft: 8 }}
                          >
                            <span className="text-[11px] uppercase tracking-wider">
                              {String(h).padStart(2, '0')}
                            </span>
                          </div>
                        );
                      })}
                      {nowFrac != null && (
                        <div
                          className="absolute top-0 bottom-0 z-20 w-px bg-emerald-500/90"
                          style={{ left: (nowFrac / 100) * timelineWidth }}
                        >
                          <div className="absolute -left-[3px] top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_hsl(var(--background))]" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Staff-rader */}
                  {ganttStaff.map((staff, rowIdx) => {
                    const blocks = blocksByStaff[staff.id] ?? [];
                    const live = resolveLiveStatus(staff.has_open_report, staff.latestPing);
                    const dotCls =
                      staff.planningStatus === 'workday_active' || live === 'live'
                        ? 'bg-emerald-500'
                        : live === 'stale'
                          ? 'bg-destructive'
                          : blocks.length
                            ? 'bg-muted-foreground/40'
                            : 'bg-muted-foreground/20';
                    const dotPulse =
                      staff.planningStatus === 'workday_active' || live === 'live';
                    const initials = getInitials(staff.name);
                    const ac = colorFromString(staff.id || staff.name);
                    const zebra = rowIdx % 2 === 1;

                    return (
                      <div
                        key={staff.id}
                        className={cn(
                          'group flex border-b border-border/40 transition-colors',
                          zebra ? 'bg-muted/[0.04]' : 'bg-transparent',
                          'hover:bg-primary/[0.03]',
                        )}
                        style={{ height: ROW_PX }}
                      >
                        {/* Namn-kolumn (sticky left) */}
                        <button
                          type="button"
                          onClick={() => setOpenStaffId(staff.id)}
                          className={cn(
                            'sticky left-0 z-20 flex items-center gap-3 border-r border-border/40 px-3 text-left transition-colors',
                            zebra ? 'bg-card/95' : 'bg-card/90',
                            'backdrop-blur group-hover:bg-card',
                          )}
                          style={{ width: NAME_COL_PX, minWidth: NAME_COL_PX }}
                          title={staff.plannedLabels.join(' · ') || staff.role || ''}
                        >
                          {/* Avatar */}
                          <div className="relative shrink-0">
                            <div
                              className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold tracking-wide ring-1 ring-inset ring-foreground/5"
                              style={{ backgroundColor: ac.bg, color: ac.fg }}
                            >
                              {initials}
                            </div>
                            <span
                              className={cn(
                                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card',
                                dotCls,
                                dotPulse && 'animate-pulse',
                              )}
                            />
                          </div>
                          {/* Namn + meta */}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-semibold leading-tight">
                              {staff.name}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                              {(() => {
                                // Suggested-Only: visa SAMMA siffror som modalen (reportCandidateSummary).
                                // staff.metrics är committed/lönegrundande och hör inte hemma i denna vy.
                                const sum = reportCandidateByStaff?.[staff.id]?.summary as
                                  | { workMinutes?: number; transportMinutes?: number }
                                  | null
                                  | undefined;
                                const workMin = sum?.workMinutes ?? staff.metrics.activityMinutes;
                                const travelMin = sum?.transportMinutes ?? staff.metrics.travelMinutes;
                                return (
                                  <>
                                    <span>
                                      <span className="font-semibold text-foreground">
                                        {fmtMin(workMin)}
                                      </span>{' '}
                                      arbete
                                    </span>
                                    {travelMin > 0 && (
                                      <span className="text-sky-600 dark:text-sky-400">
                                        {fmtMin(travelMin)} resa
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            {diagnosticsEnabled && (() => {
                              const diag = diagnosisByStaff.get(staff.id);
                              if (!diag || diag.status === 'ok') return null;
                              const tone =
                                diag.severity === 'critical'
                                  ? 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40'
                                  : diag.severity === 'warning'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
                                    : 'bg-muted text-muted-foreground border-border';
                              return (
                                <div
                                  className={cn(
                                    'mt-1 inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[9.5px]',
                                    tone,
                                  )}
                                  title={`${describeReportDataGapStatus(diag.status)} — ${diag.reason}${diag.suggestedNextAction !== 'none' ? ` (next: ${diag.suggestedNextAction})` : ''}`}
                                >
                                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{describeReportDataGapStatus(diag.status)}</span>
                                </div>
                              );
                            })()}
                            {ganttDebug && (() => {
                              const d = visualDiagByStaff[staff.id];
                              const c = sourceCountsByStaff[staff.id];
                              const src = sourceByStaff[staff.id] ?? 'empty';
                              const srcShort =
                                src === 'displayTimelineV2' ? 'v2'
                                : src === 'workdayAllocation' ? 'alloc'
                                : src === 'reportCandidate' ? 'legacy'
                                : src === 'v2_empty' ? 'v2_empty'
                                : 'empty';
                              if (!d && !c) return null;
                              const absorbed = d
                                ? d.absorbedTransportCount + d.absorbedReviewCount + d.absorbedUnknownCount + d.absorbedPreWorkCount
                                : 0;
                              return (
                                <div
                                  className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/70"
                                  title={
                                    `source=${src}` +
                                    (c ? ` · v2 raw=${c.rawV2} mapped=${c.mappedV2} · alloc raw=${c.rawAlloc} mapped=${c.mappedAlloc} · legacy=${c.legacy} · rendered=${c.rendered}` : '') +
                                    (d ? ` · merge raw=${d.rawBlockCount} visual=${d.visualBlockCount} absorbed=${absorbed} (transport ${d.absorbedTransportCount} · review ${d.absorbedReviewCount} · unknown ${d.absorbedUnknownCount} · pre_work ${d.absorbedPreWorkCount}) hidden=${d.hiddenPreWorkCount} lanes=${d.lanePackedMainBlocksCount}` : '')
                                  }
                                >
                                  {srcShort}
                                  {c ? ` · raw ${srcShort === 'v2' ? c.rawV2 : srcShort === 'alloc' ? c.rawAlloc : c.legacy} → mapped ${srcShort === 'v2' ? c.mappedV2 : srcShort === 'alloc' ? c.mappedAlloc : c.legacy} → rendered ${c.rendered}` : ''}
                                  {d ? ` · absorbed ${absorbed}` : ''}
                                </div>
                              );
                            })()}
                          </div>
                        </button>

                        {/* Timeline-cell */}
                        <div
                          className="relative"
                          style={{ width: timelineWidth, height: ROW_PX }}
                          onClick={() => setOpenStaffId(staff.id)}
                        >
                          {/* timrutnät — luftigare */}
                          {Array.from({ length: totalHours }).map((_, i) => (
                            <div
                              key={i}
                              className={cn(
                                'absolute top-0 bottom-0 border-l',
                                i === 0 ? 'border-transparent' : 'border-border/25',
                              )}
                              style={{ left: i * HOUR_PX }}
                            />
                          ))}
                          {/* lunch-shade */}
                          {(() => {
                            const lunchIdx = 12 - startHour;
                            if (lunchIdx < 0 || lunchIdx >= totalHours) return null;
                            return (
                              <div
                                className="absolute top-0 bottom-0 bg-foreground/[0.015]"
                                style={{ left: lunchIdx * HOUR_PX, width: HOUR_PX }}
                              />
                            );
                          })()}
                          {/* now-line */}
                          {nowFrac != null && (
                            <div
                              className="absolute top-0 bottom-0 z-10 w-px bg-emerald-500/80"
                              style={{ left: (nowFrac / 100) * timelineWidth }}
                            />
                          )}

                          {/* GPS-evidence bar (UI-only; ALDRIG arbetstid) */}
                          {(() => {
                            const ev = evidenceByStaff[staff.id];
                            if (!ev) return null;
                            let left = 8;
                            let width = Math.max(60, timelineWidth - 16);
                            if (ev.startAt && ev.endAt) {
                              const sH = hourOfDay(ev.startAt, dateStr);
                              const eH = hourOfDay(ev.endAt, dateStr);
                              const clampedS = Math.max(startHour, Math.min(endHour, sH));
                              const clampedE = Math.max(startHour, Math.min(endHour, eH));
                              if (clampedE > clampedS) {
                                left = (clampedS - startHour) * HOUR_PX;
                                width = Math.max(40, (clampedE - clampedS) * HOUR_PX);
                              }
                            }
                            return (
                              <div
                                role="button"
                                tabIndex={0}
                                title={ev.label}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenStaffId(staff.id);
                                }}
                                className={cn(
                                  'absolute z-[5] cursor-pointer overflow-hidden rounded-full border border-dashed',
                                  'border-muted-foreground/30 bg-muted/30 text-[9px] text-muted-foreground',
                                  'flex items-center px-1.5 hover:bg-muted/50 hover:border-muted-foreground/50',
                                )}
                                style={{
                                  left: left + 2,
                                  width: Math.max(40, width - 4),
                                  ...getGanttEvidenceBarStyle(ROW_PX),
                                }}
                              >
                                <span className="truncate">GPS</span>
                              </div>
                            );
                          })()}

                          {/* Block — lane-packing */}
                          {(() => {
                            const rects: Array<{
                              b: GanttBlock;
                              left: number;
                              width: number;
                              startMs: number;
                              endMs: number;
                              lane: number;
                              laneCount: number;
                            }> = [];
                            for (const b of blocks) {
                              if (b.isNightGpsOnly) continue; // dölj GPS-natt helt från huvudtidslinjen
                              const g = blockGeometry(b);
                              if (!g) continue;
                              rects.push({
                                b,
                                left: g.left,
                                width: g.width,
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

                            const overlapsPrev = new Set<string>();
                            let group: typeof rects = [];
                            let groupEnd = -Infinity;
                            const flushGroup = () => {
                              if (group.length === 0) return;
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
                                for (const g of group) {
                                  overlapsPrev.add(g.b.id);
                                  overlapsPrev.add(r.b.id);
                                }
                              }
                              group.push(r);
                            }
                            flushGroup();

                            return rects.map(({ b, left, width, lane, laneCount }) => {
                              const style = KIND_STYLE[b.kind];
                              const overlapping = overlapsPrev.has(b.id);
                              const laneMetrics = getGanttLaneMetrics(laneCount, ROW_PX);
                              const laneHeight = laneMetrics.laneHeight;
                              const top = laneMetrics.topInset + lane * laneHeight;
                              const isSecondary = !['work', 'warehouse', 'rig', 'rigdown'].includes(b.kind);
                              const isNarrow = width < 90;
                              const showTime = shouldShowCompactBlockTime({ width, laneHeight, isSecondary });
                              const showChips = false;
                              const showLabel = width >= 50;
                              const showBadge = shouldShowCompactBlockBadge({ width, laneHeight });
                              const displayTitle = blockDisplayTitle(
                                b,
                                b.isNightGpsOnly ? 'GPS-natt' : style.label,
                              );
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
                                    'absolute cursor-pointer overflow-hidden rounded-md border text-[10px] leading-tight backdrop-blur-[2px] transition-all hover:-translate-y-px hover:shadow-md hover:z-20',
                                    isNarrow ? 'px-1 py-0.5' : 'px-1.5 py-0.5',
                                    b.isNightGpsOnly
                                      ? 'bg-muted/40 border-dashed border-border/60 opacity-60'
                                      : style.bg,
                                    !b.isNightGpsOnly && style.border,
                                    isSecondary && !b.isNightGpsOnly && 'opacity-80',
                                    overlapping && 'ring-1 ring-amber-400/70',
                                  )}
                                  style={{
                                    left: left + 2,
                                    width: Math.max(40, width - 4),
                                    top,
                                    height: laneMetrics.blockHeight,
                                    color: '#0a0a0a',
                                    boxShadow: '0 1px 3px hsl(var(--foreground) / 0.06), inset 0 1px 0 hsl(0 0% 100% / 0.5)',
                                  }}
                                  title={blockTooltipText(b, displayTitle, overlapping) + (b.attachedChips?.length ? '\n' + b.attachedChips.map(c => '• ' + c).join('\n') : '')}
                                >
                                  <div className="flex min-w-0 items-center gap-1">
                                    {showBadge && (
                                      <span
                                        className="shrink-0 rounded-[4px] px-1 py-px text-[8px] font-bold uppercase"
                                        style={{
                                          backgroundColor: b.isNightGpsOnly
                                            ? 'hsl(var(--muted) / 0.7)'
                                            : 'hsl(0 0% 0% / 0.08)',
                                          color: b.isNightGpsOnly
                                            ? 'hsl(var(--muted-foreground))'
                                            : 'hsl(0 0% 12%)',
                                        }}
                                      >
                                        {b.isNightGpsOnly ? 'GPS' : style.label}
                                      </span>
                                    )}
                                    {showLabel && (
                                      <span className="min-w-0 truncate font-semibold">{displayTitle}</span>
                                    )}
                                    {showTime && (
                                      <span className="shrink-0 truncate text-[9px] tabular-nums opacity-75">
                                        {formatStockholmHm(b.startAt)}–{formatStockholmHm(b.endAt)}
                                      </span>
                                    )}
                                  </div>
                                  {showChips && (() => {
                                    const { visible, overflowCount } = visibleChips(b.attachedChips!);
                                    return (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {visible.map((chip, ci) => (
                                          <span
                                            key={ci}
                                            className="inline-flex items-center rounded-full bg-black/[0.06] px-1.5 py-px text-[9px] font-medium text-foreground/70"
                                          >
                                            {chip}
                                          </span>
                                        ))}
                                        {overflowCount > 0 && (
                                          <span
                                            className="inline-flex items-center rounded-full bg-black/[0.06] px-1.5 py-px text-[9px] font-medium text-foreground/60"
                                            title={b.attachedChips!.join(' · ')}
                                          >
                                            +{overflowCount}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            });
                          })()}

                          {/* Tom rad — diskret stippel istället för "Ingen aktivitet" */}
                          {blocks.length === 0 && (
                            <div
                              className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
                              style={{
                                backgroundImage:
                                  'repeating-linear-gradient(to right, hsl(var(--muted-foreground) / 0.18) 0 4px, transparent 4px 10px)',
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* Fas-legend (matchar personalkalendern) */}
      <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-[11px] flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span className="font-semibold tracking-wider text-foreground/80 mr-1">FAS</span>
        <LegendDot className="bg-[#F2FCE2] border-[#C9E8A8]" label="Rigg" />
        <LegendDot className="bg-slate-300/70 border-slate-400" label="Arbete" />
        <LegendDot className="bg-[#FFDEE2] border-[#F4B4BC]" label="Rigga ner" />
        <LegendDot className="bg-sky-200/80 border-sky-400" label="Transport" />
        <LegendDot className="bg-[#E5DEFF] border-[#BFB1F5]" label="Lager" />
        <LegendDot className="bg-amber-50 border-amber-300" label="Granska" />
      </div>
        </div>
      </div>

      {/* Detail drawer */}
      <Sheet open={!!openStaff} onOpenChange={(o) => { if (!o) setOpenStaffId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
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
        open={
          !!selectedBlock &&
          !!selectedBlockStaff &&
          (!!selectedCanonicalReportBlock || !!selectedRenderedBlock)
        }
        onOpenChange={(open) => {
          if (!open) setSelectedBlock(null);
        }}
        staff={selectedBlockStaff}
        dateStr={dateStr}
        dateLabel={subLabel}
        reportCandidate={selectedBlockReportCandidate}
        blockId={selectedCanonicalReportBlock?.id ?? null}
        renderedBlock={selectedRenderedBlock}
      />
    </div>
  );
};

const LegendDot: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={cn('h-2.5 w-2.5 rounded-full border', className)} />
    <span>{label}</span>
  </span>
);

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

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  iconClass?: string;
  value: string;
  label: string;
  accent?: 'emerald' | 'amber';
}> = ({ icon, iconClass, value, label, accent }) => (
  <div className="flex min-w-[140px] items-center gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5 shadow-sm">
    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconClass ?? 'bg-muted text-muted-foreground')}>
      {icon}
    </div>
    <div className="flex flex-col leading-tight">
      <span
        className={cn(
          'text-lg font-semibold tabular-nums',
          accent === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
          accent === 'amber' && 'text-amber-600 dark:text-amber-400',
          !accent && 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
    </div>
  </div>
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

const TimelineBlockDetail: React.FC<{ block: GanttBlock }> = ({ block }) => {
  const meta = block.meta ?? {};
  const sourceLabel =
    block.source === 'displayTimelineV2' ? 'Display Timeline V2'
    : block.source === 'workdayAllocation' ? 'Workday Allocation (Lager 3)'
    : 'Legacy';
  const allocIds = Array.isArray((meta as any).sourceAllocationSegmentIds) ? (meta as any).sourceAllocationSegmentIds : null;
  const truthIds = Array.isArray((meta as any).sourceLocationTruthSegmentIds) ? (meta as any).sourceLocationTruthSegmentIds : null;
  return (
    <div className="rounded-md border bg-card px-3 py-3 space-y-2 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span><span className="text-muted-foreground">Källa:</span> <span className="font-medium">{sourceLabel}</span></span>
        {block.targetType && (
          <span><span className="text-muted-foreground">Target:</span> <span className="font-mono">{block.targetType}{block.targetId ? `:${block.targetId}` : ''}</span></span>
        )}
        {block.sessionKey && (
          <span><span className="text-muted-foreground">Session:</span> <span className="font-mono">{block.sessionKey}</span></span>
        )}
      </div>
      {(() => {
        const m: any = meta;
        const targetLabel = (m.targetLabel as string | null) ?? null;
        const addressLabel = (m.addressLabel as string | null) ?? null;
        const locationName = (m.locationName as string | null) ?? null;
        const address = block.address ?? null;
        const lat = typeof m.latitude === 'number' ? m.latitude : m.centroid?.lat ?? null;
        const lng = typeof m.longitude === 'number' ? m.longitude : m.centroid?.lng ?? null;
        const primary =
          targetLabel || addressLabel || locationName || address || null;
        const fallbackCoords = !primary && typeof lat === 'number' && typeof lng === 'number'
          ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          : null;
        return (
          <div className="rounded-sm border bg-muted/40 px-2 py-1.5 space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Plats</div>
            {primary ? (
              <div className="font-medium text-foreground">{primary}</div>
            ) : fallbackCoords ? (
              <div className="font-mono text-foreground">{fallbackCoords}</div>
            ) : (
              <div className="italic text-muted-foreground">Platsnamn saknas</div>
            )}
            {address && primary && address !== primary && (
              <div className="text-muted-foreground">{address}</div>
            )}
            {typeof lat === 'number' && typeof lng === 'number' && (
              <div className="font-mono text-[10px] text-muted-foreground">
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </div>
            )}
          </div>
        );
      })()}
      {(() => {
        const m: any = meta;
        const physLabel = (m.physicalLocationLabel as string | null) ?? null;
        const physAddress = (m.physicalLocationAddress as string | null) ?? null;
        const physLat = typeof m.physicalLocationLat === 'number' ? m.physicalLocationLat : null;
        const physLng = typeof m.physicalLocationLng === 'number' ? m.physicalLocationLng : null;
        const physSource = (m.physicalLocationSource as string | null) ?? null;
        const physConf = (m.physicalLocationConfidence as string | null) ?? null;
        const matchDiag = (m.locationMatchDiagnostics as any) ?? null;
        const bcr = (m.businessContextResolution as any) ?? null;
        if (!physLabel && !physAddress && physLat == null && !matchDiag && !bcr) return null;
        const matched = matchDiag?.matchedTarget ?? null;
        const candidates: any[] = Array.isArray(matchDiag?.candidates) ? matchDiag.candidates : [];
        const rejected: any[] = Array.isArray(matchDiag?.rejectedCandidates) ? matchDiag.rejectedCandidates : [];
        const matchWarnings: string[] = Array.isArray(matchDiag?.warnings) ? matchDiag.warnings : [];
        return (
          <div className="rounded-sm border bg-muted/30 px-2 py-1.5 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Platsmatchning</div>
            <div className="space-y-0.5">
              <div className="text-[10px] text-muted-foreground">Fysisk plats</div>
              <div className="font-medium">{physLabel ?? 'okänd'}</div>
              {physAddress && <div className="text-muted-foreground">{physAddress}</div>}
              {physLat != null && physLng != null && (
                <div className="font-mono text-[10px] text-muted-foreground">
                  {physLat.toFixed(5)}, {physLng.toFixed(5)}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground">
                källa: <span className="font-mono">{physSource ?? '—'}</span>
                {physConf && <> · konfidens: <span className="font-mono">{physConf}</span></>}
              </div>
            </div>
            {matched && (
              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground">Matchad EventFlow-target</div>
                <div className="font-medium">
                  {matched.label ?? '—'}
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    {matched.knownTargetType ?? matched.type}{matched.targetId ? `:${matched.targetId}` : ''}
                  </span>
                </div>
              </div>
            )}
            {matchDiag?.decisionReason && (
              <div className="text-[11px]">
                <span className="text-muted-foreground">Varför vald:</span>{' '}
                <span className="font-mono">{matchDiag.decisionReason}</span>
              </div>
            )}
            {bcr?.fallbackUsed && (
              <div className="text-[11px]">
                <span className="text-muted-foreground">Business-fallback:</span>{' '}
                <span className="font-mono">{String(bcr.fallbackUsed)}</span>
              </div>
            )}
            {candidates.length > 0 && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground">
                  Kandidater inom radie ({candidates.length})
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {candidates.map((c, i) => (
                    <li key={i} className="font-mono">
                      {c.targetType}:{c.targetId} · {c.label} ·{' '}
                      {Math.round(c.distanceMeters)}m / {Math.round(c.effectiveRadiusMeters)}m
                      {c.assignmentSupports && ' · assignment'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {rejected.length > 0 && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground">
                  Avvisade kandidater ({rejected.length})
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {rejected.map((c, i) => (
                    <li key={i} className="font-mono">
                      {c.targetType}:{c.targetId} · {c.label} ·{' '}
                      {Number.isFinite(c.distanceMeters) ? `${Math.round(c.distanceMeters)}m` : '∞'}
                      {c.rejectReason && ` · ${c.rejectReason}`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {matchWarnings.length > 0 && (
              <div className="text-[11px]">
                <span className="text-muted-foreground">Warnings:</span>{' '}
                <span className="font-mono">{matchWarnings.join(', ')}</span>
              </div>
            )}
          </div>
        );
      })()}
      {block.warnings && block.warnings.length > 0 && (
        <div className="rounded-sm border border-amber-300/60 bg-amber-50 dark:bg-amber-400/10 px-2 py-1.5">
          <div className="font-medium text-amber-900 dark:text-amber-200 mb-0.5">Varningar</div>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-900 dark:text-amber-100">
            {block.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {(meta as any).displayType && (
        <div><span className="text-muted-foreground">displayType:</span> <span className="font-mono">{String((meta as any).displayType)}</span></div>
      )}
      {(meta as any).allocationType && (
        <div><span className="text-muted-foreground">allocationType:</span> <span className="font-mono">{String((meta as any).allocationType)}</span></div>
      )}
      {(meta as any).severity && (
        <div><span className="text-muted-foreground">severity:</span> <span className="font-mono">{String((meta as any).severity)}</span></div>
      )}
      {(meta as any).confidence && (
        <div><span className="text-muted-foreground">confidence:</span> <span className="font-mono">{String((meta as any).confidence)}</span></div>
      )}
      {allocIds && allocIds.length > 0 && (
        <div className="text-[10px] font-mono text-muted-foreground break-all">allocation ids: {allocIds.join(', ')}</div>
      )}
      {truthIds && truthIds.length > 0 && (
        <div className="text-[10px] font-mono text-muted-foreground break-all">location-truth ids: {truthIds.join(', ')}</div>
      )}
      {block.absorbedSourceIds && block.absorbedSourceIds.length > 0 && (
        <div className="text-[10px] font-mono text-muted-foreground break-all">absorbed: {block.absorbedSourceIds.join(', ')}</div>
      )}
    </div>
  );
};

interface BlockDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffWithDayReport | null;
  dateStr: string;
  dateLabel: string;
  reportCandidate?: any;
  blockId: string | null;
  /** V2/allocation/legacy renderat block — används som fallback när blocket
   *  inte finns i legacy reportCandidate.blocks. */
  renderedBlock?: GanttBlock | null;
}

const BlockDetailDialog: React.FC<BlockDetailDialogProps> = ({
  open,
  onOpenChange,
  staff,
  dateStr,
  dateLabel,
  reportCandidate,
  blockId,
  renderedBlock,
}) => {
  const blocks = reportCandidate?.blocks ?? [];
  const excludedPreWork = reportCandidate?.excludedPreWorkBlocks ?? [];
  const legacyBlock: ReportCandidateBlockUI | null = blockId
    ? (blocks.find((block: ReportCandidateBlockUI) => block.id === blockId)
        ?? (blockId.startsWith('pre-')
          ? excludedPreWork.find((block: ReportCandidateBlockUI) => block.id === blockId.slice(4)) ?? null
          : null))
    : null;
  const isTimelineSource =
    !legacyBlock &&
    !!renderedBlock &&
    (renderedBlock.source === 'displayTimelineV2' ||
      renderedBlock.source === 'workdayAllocation');
  const selectedBlock: any = legacyBlock ?? renderedBlock?.reportCandidateBlock ?? renderedBlock ?? null;
  // Map Trace 1: raw GPS hämtas alltid (även för V2/allocation-block),
  // så vi kan filtrera och visa pings för det valda blocket.
  const { pings } = useDayPings({ staffId: staff?.id ?? '', date: dateStr, enabled: open && !!staff?.id });
  const { events } = useDayTimeline({ staffId: staff?.id ?? '', date: dateStr, enabled: open && !!staff?.id && !isTimelineSource });
  const selectedEvent = useMemo(() => {
    if (!selectedBlock || isTimelineSource) return null;
    const start = new Date(selectedBlock.startAt).getTime();
    const end = new Date(selectedBlock.endAt).getTime();
    return events.find((event) => {
      const ts = new Date(event.ts).getTime();
      return Number.isFinite(ts) && ts >= start && ts <= end;
    }) ?? null;
  }, [events, selectedBlock, isTimelineSource]);

  const blockPings = useMemo(() => {
    if (!selectedBlock) return [] as typeof pings;
    const startMs = new Date(selectedBlock.startAt).getTime();
    const endMs = new Date(selectedBlock.endAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
    return pings.filter((p) => {
      const t = new Date(p.recorded_at).getTime();
      return Number.isFinite(t) && t >= startMs && t <= endMs;
    });
  }, [pings, selectedBlock]);

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
                {isTimelineSource && renderedBlock ? (
                  <TimelineBlockDetail block={renderedBlock} />
                ) : (
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
                )}
              </div>
            </TabsContent>

            <TabsContent value="map" className="mt-0">
              <DecisionMapTab
                staffId={staff.id}
                date={dateStr}
                reportCandidateBlocks={
                  legacyBlock
                    ? [legacyBlock]
                    : ([{
                        id: selectedBlock.id,
                        startAt: selectedBlock.startAt,
                        endAt: selectedBlock.endAt,
                        title: selectedBlock.title,
                        kind: selectedBlock.kind,
                      }] as unknown as ReportCandidateBlockUI[])
                }
                initialFromIso={selectedBlock.startAt}
                initialToIso={selectedBlock.endAt}
              />
            </TabsContent>

            <TabsContent value="raw" className="mt-0 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground tabular-nums">
                  {blockPings.length} pings i blocket
                  {blockPings.length > 0 ? (
                    <>
                      {' · '}första {formatStockholmHm(blockPings[0].recorded_at)}
                      {' · '}sista {formatStockholmHm(blockPings[blockPings.length - 1].recorded_at)}
                    </>
                  ) : null}
                  <span className="ml-2 opacity-60">({pings.length} totalt på dagen)</span>
                </div>
                <div className="mb-2 text-[10px] text-muted-foreground/70">
                  Blocket innehåller bara GPS inom valt tidsintervall. Total dag-GPS används som jämförelse.
                </div>
                <RawGpsDrawer
                  pings={pings}
                  date={dateStr}
                  staffName={staff.name}
                  selectedEvent={selectedEvent}
                />
              </div>
              <div className="rounded-md border border-border/60">
                <div className="max-h-[420px] overflow-auto">
                  {blockPings.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      Inga pings i blockets tidsintervall.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="text-left font-medium px-2 py-1">Tid</th>
                          <th className="text-left font-medium px-2 py-1">Lat</th>
                          <th className="text-left font-medium px-2 py-1">Lng</th>
                          <th className="text-right font-medium px-2 py-1">Acc (m)</th>
                          <th className="text-right font-medium px-2 py-1">Speed</th>
                          <th className="text-left font-medium px-2 py-1">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blockPings.map((p) => (
                          <tr key={p.id} className="border-t border-border/40">
                            <td className="px-2 py-1 font-mono tabular-nums">{formatStockholmHm(p.recorded_at)}</td>
                            <td className="px-2 py-1 font-mono">{p.lat.toFixed(5)}</td>
                            <td className="px-2 py-1 font-mono">{p.lng.toFixed(5)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{p.accuracy != null ? Math.round(p.accuracy) : '—'}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{p.speed != null ? p.speed.toFixed(1) : '—'}</td>
                            <td className="px-2 py-1 text-muted-foreground">{p.source ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
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
  const { pings } = useDayPings({ staffId: staff.id, date: dateStr, enabled: true });
  return (
    <div className="space-y-3">
      {staff.pingsFetchError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          GPS-historik kunde inte hämtas. ({staff.pingsFetchError})
        </div>
      )}
      <Tabs defaultValue="overview" className="flex flex-col gap-3">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Översikt</TabsTrigger>
          <TabsTrigger value="map">Karta ({pings.length})</TabsTrigger>
          <TabsTrigger value="raw">Rå GPS ({pings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
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
        </TabsContent>

        <TabsContent value="map" className="mt-0">
          <DecisionMapTab
            staffId={staff.id}
            date={dateStr}
            reportCandidateBlocks={(reportCandidate?.blocks ?? []) as ReportCandidateBlockUI[]}
          />
        </TabsContent>

        <TabsContent value="raw" className="mt-0">
          <div className="rounded-md border border-border/60">
            <div className="px-3 py-2 text-xs text-muted-foreground border-b">
              {pings.length} pings på {dateStr}
              {pings.length > 0 && (
                <>
                  {' · '}första {formatStockholmHm(pings[0].recorded_at)}
                  {' · '}sista {formatStockholmHm(pings[pings.length - 1].recorded_at)}
                </>
              )}
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {pings.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">Inga pings för dagen.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-2 py-1">Tid</th>
                      <th className="text-left font-medium px-2 py-1">Lat</th>
                      <th className="text-left font-medium px-2 py-1">Lng</th>
                      <th className="text-right font-medium px-2 py-1">Acc (m)</th>
                      <th className="text-right font-medium px-2 py-1">Speed</th>
                      <th className="text-left font-medium px-2 py-1">Källa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pings.map((p) => (
                      <tr key={p.id} className="border-t border-border/40">
                        <td className="px-2 py-1 font-mono tabular-nums">{formatStockholmHm(p.recorded_at)}</td>
                        <td className="px-2 py-1 font-mono">{p.lat.toFixed(5)}</td>
                        <td className="px-2 py-1 font-mono">{p.lng.toFixed(5)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.accuracy != null ? Math.round(p.accuracy) : '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.speed != null ? p.speed.toFixed(1) : '—'}</td>
                        <td className="px-2 py-1 text-muted-foreground">{p.source ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

