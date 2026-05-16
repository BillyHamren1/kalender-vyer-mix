/**
 * timeEngineTraceExport — pure builder för "Export Trace JSON" på
 * /staff-management/time-reports.
 *
 * VIKTIGT:
 *   - READ-ONLY. Bygger bara en JSON-payload.
 *   - Skriver ingen data.
 *   - Ändrar inte Time Engine-logik, Gantt-rendering eller report-buildern.
 *   - Lägger ALDRIG till heuristik som påverkar siffror i UI.
 *   - All data återanvänds från befintliga källor (debug-raw-staff-pings,
 *     reportCandidateByStaff, staffList, StaffGanttView-diagnostik).
 */
import type { RawPingsResponse, RawPingStaffEntry, RawPingSampleRow } from '@/hooks/staff/useRawStaffPingsDebug';

export interface GanttExportSnapshotForStaff {
  selectedSource: string | null;
  rawV2: number;
  mappedV2: number;
  rawAllocation: number;
  mappedAllocation: number;
  legacyCount: number;
  renderedCount: number;
  renderedBlocks: Array<{
    id: string;
    kind: string;
    startAt: string | null;
    endAt: string | null;
    durationMinutes: number | null;
    title: string | null;
    subtitle: string | null;
    isOpen: boolean;
    source?: string | null;
  }>;
  visualDiagnostics: any;
  sourceCounts: {
    rawV2: number;
    mappedV2: number;
    rawAlloc: number;
    mappedAlloc: number;
    legacy: number;
    rendered: number;
  } | null;
}

export interface ReportCandidateLikeForExport {
  blocks?: any[];
  summary?: any;
  diagnostics?: any;
  displayTimelineBlocksV2?: any[];
  displayTimelineDiagnosticsV2?: any;
  workdayAllocationSegments?: any[];
  workdayAllocationDiagnostics?: any;
  // Lager 2.10 — LocationTruth V2 (top-level på presence-day-svaret).
  locationTruthV2Segments?: any[];
  locationTruthV2Diagnostics?: any;
  locationTruthV2NotBuiltReason?: string | null;
  presenceBlocks?: any[];
  presenceDaySummary?: any;
  presenceDayAggregation?: any;
  targetMatchSummary?: any;
  targets?: any[];
  counts?: any;
  loading?: boolean;
  missing?: boolean;
  // Eventuella AI/review-fält som backend kan ha lagt på i framtiden.
  aiWorkdayReviewSummary?: any;
  aiWorkdayReviewProposals?: any[];
  workdayAllocationProposals?: any[];
}

export interface StaffSeedForExport {
  staffId: string;
  staffName: string | null;
  appearsInReportList: boolean;
}

export interface BuildTraceExportInput {
  exportedAt: string;       // ISO
  organizationId: string;
  date: string;             // YYYY-MM-DD
  timezone: string;         // ex. 'Europe/Stockholm'
  staffSeeds: StaffSeedForExport[];
  reportCandidateByStaff?: Record<string, ReportCandidateLikeForExport | undefined> | null;
  rawPings?: RawPingsResponse | null;
  ganttDiagnosticsByStaff?: Record<string, GanttExportSnapshotForStaff | undefined> | null;
  /** Hård gräns för rader per person i exporten (default 10000). */
  maxRowsPerStaff?: number;
}

export type DiffFindingType =
  | 'raw_pings_missing'
  | 'staff_has_pings_but_missing_from_report'
  | 'pings_exist_but_no_location_truth'
  | 'location_truth_exists_but_no_display'
  | 'display_exists_but_no_gantt'
  | 'stale_timer_created_large_empty_day'
  | 'large_uncovered_time'
  | 'battery_low_before_signal_gap'
  | 'rendered_gap_too_large'
  | 'allocation_references_unknown_location_truth_segment';

export type DiffFindingSeverity = 'info' | 'warning' | 'critical';

export interface DiffFinding {
  severity: DiffFindingSeverity;
  type: DiffFindingType;
  message: string;
  evidence: Record<string, unknown>;
}

export interface TraceComparison {
  hasRawPings: boolean;
  appearsInReportList: boolean;
  hasLocationTruth: boolean;
  hasWorkdayAllocation: boolean;
  hasDisplayTimeline: boolean;
  hasRenderedGantt: boolean;
  rawPingsButNoLocationTruth: boolean;
  locationTruthButNoDisplay: boolean;
  displayButNoGantt: boolean;
  staleTimerSuspected: boolean;
  uncoveredWorkdayMinutes: number | null;
  largestEmptyRenderedPeriodMinutes: number | null;
}

export interface TraceStaffEntry {
  staffId: string;
  staffName: string | null;
  rawPings: {
    count: number;
    firstRecordedAt: string | null;
    lastRecordedAt: string | null;
    maxGapMinutes: number | null;
    gapCountOver15Min: number | null;
    gapCountOver60Min: number | null;
    medianAccuracy: number | null;
    p90Accuracy: number | null;
    truncated: boolean;
    totalCountBeforeLimit: number | null;
    rows: Array<{
      id: string;
      recorded_at: string;
      created_at: string | null;
      latitude: number | null;
      longitude: number | null;
      accuracy: number | null;
      speed_mps: number | null;
      source: string | null;
      battery_percent: number | null;
      is_charging: boolean | null;
      battery_source: string | null;
    }>;
  };
  appHealth: {
    count: number;
    lastAppSeenAt: string | null;
    lastEventType: string | null;
    lastBatteryPercent: number | null;
    rows: any[];
  };
  timeEngine: {
    dayEvidenceDiagnostics: any;
    locationTruthV2Diagnostics: any;
    locationTruthV2Segments: any[];
    locationTruthV2NotBuiltReason: string | null;
    /** Time Engine Core Fix 1 — top-level guard-spegling. */
    locationTruthV2SegmentCount?: number;
    rawPingCount?: number | null;
    engineBlockedBecauseLocationTruthMissing?: boolean;
    hasRawPingsButNoLocationTruth?: boolean;
    displaySuppressedBecauseMissingLocationTruth?: boolean;
    openTimerIgnoredForDisplay?: boolean;
    workdayAllocationDiagnostics: any;
    workdayAllocationSegments: any[];
    workdayAllocationProposals: any[];
    displayTimelineDiagnosticsV2: any;
    displayTimelineBlocksV2: any[];
    aiWorkdayReviewSummary: any;
    aiWorkdayReviewProposals: any[];
  };
  gantt: {
    selectedSource: string | null;
    rawV2: number;
    mappedV2: number;
    rawAllocation: number;
    mappedAllocation: number;
    legacyCount: number;
    renderedCount: number;
    renderedBlocks: GanttExportSnapshotForStaff['renderedBlocks'];
    visualDiagnostics: any;
    sourceCounts: GanttExportSnapshotForStaff['sourceCounts'];
  };
  finalProduct: {
    reportBlocks: any[];
    displayBlocks: any[];
    ganttBlocks: GanttExportSnapshotForStaff['renderedBlocks'];
    visibleTimelineBlocks: any[];
  };
  comparison: TraceComparison;
  diffFindings: DiffFinding[];
}

export interface TimeEngineTraceExport {
  exportedAt: string;
  organizationId: string;
  date: string;
  timezone: string;
  summary: {
    totalStaff: number;
    staffWithRawPings: number;
    staffMissingFromReport: number;
    totalDiffFindings: number;
    criticalFindings: number;
    warningFindings: number;
    /** Antal staff där rawPings.truncated=true. */
    rawPingsTruncatedStaffCount: number;
    /** Totalt antal rader som inte kom med över alla truncerade staff. */
    rawPingsTruncatedTotalMissingRows: number;
    /** True om Edge Function nådde sin HARD_CAP (50000) totalt. */
    rawPingsHardCapReached: boolean;
    /** Edge Function-warnings (t.ex. row_hard_cap_50000_reached). */
    rawPingsWarnings: string[];
  };
  staff: TraceStaffEntry[];
}

const DEFAULT_MAX_ROWS = 10_000;

function safeArr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function diffMinutes(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.max(0, (tb - ta) / 60000);
}

function isStartOfDayIso(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const hhmm = iso.slice(11, 16);
  if (['00:00', '00:01', '00:02', '00:03', '00:04', '00:05'].includes(hhmm)) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCHours() === 0 && d.getUTCMinutes() < 6;
}

function largestRenderedGapMinutes(blocks: GanttExportSnapshotForStaff['renderedBlocks']): number | null {
  if (!blocks || blocks.length < 2) return null;
  const sorted = [...blocks]
    .filter(b => b.startAt && b.endAt)
    .sort((a, b) => (a.startAt! < b.startAt! ? -1 : 1));
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].endAt!;
    const curStart = sorted[i].startAt!;
    const gap = diffMinutes(prevEnd, curStart);
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap > 0 ? maxGap : null;
}

function buildRawPingsSection(
  entry: RawPingStaffEntry | undefined,
  maxRows: number,
): TraceStaffEntry['rawPings'] {
  if (!entry) {
    return {
      count: 0,
      firstRecordedAt: null,
      lastRecordedAt: null,
      maxGapMinutes: null,
      gapCountOver15Min: null,
      gapCountOver60Min: null,
      medianAccuracy: null,
      p90Accuracy: null,
      truncated: false,
      totalCountBeforeLimit: null,
      rows: [],
    };
  }
  const rowsAll = safeArr<RawPingSampleRow>(entry.sampleRows)
    .slice()
    .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1));
  const rows = rowsAll.slice(0, maxRows).map(r => ({
    id: r.id,
    recorded_at: r.recorded_at,
    created_at: r.created_at ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    accuracy: r.accuracy ?? null,
    speed_mps: r.speed_mps ?? null,
    source: (r as any).source ?? null,
    battery_percent: r.battery_percent ?? null,
    is_charging: r.is_charging ?? null,
    battery_source: r.battery_source ?? null,
  }));
  // Truncated om EF sade så, eller om pingCount > vad vi faktiskt har, eller om
  // vår egen builder-cap kapade. totalCountBeforeLimit = verkligt pingCount.
  const edgeFunctionTruncated = entry.rowsTruncated === true;
  const moreThanRows = entry.pingCount > rows.length;
  const truncated = edgeFunctionTruncated || moreThanRows;
  return {
    count: entry.pingCount,
    firstRecordedAt: entry.firstRecordedAt ?? null,
    lastRecordedAt: entry.lastRecordedAt ?? null,
    maxGapMinutes: entry.maxPingGapMinutes ?? null,
    gapCountOver15Min: entry.gapCountOver15Min ?? null,
    gapCountOver60Min: entry.gapCountOver60Min ?? null,
    medianAccuracy: entry.medianAccuracy ?? null,
    p90Accuracy: entry.p90Accuracy ?? null,
    truncated,
    totalCountBeforeLimit: truncated ? entry.pingCount : null,
    rows,
  };
}

function buildAppHealthSection(entry: RawPingStaffEntry | undefined): TraceStaffEntry['appHealth'] {
  const h = entry?.appHealth ?? null;
  return {
    count: h ? 1 : 0,
    lastAppSeenAt: h?.lastAppSeenAt ?? null,
    lastEventType: h?.lastEventType ?? null,
    lastBatteryPercent: h?.lastBatteryPercent ?? null,
    rows: h ? [h] : [],
  };
}

function buildGanttSection(
  snap: GanttExportSnapshotForStaff | undefined,
): TraceStaffEntry['gantt'] {
  return {
    selectedSource: snap?.selectedSource ?? null,
    rawV2: snap?.rawV2 ?? 0,
    mappedV2: snap?.mappedV2 ?? 0,
    rawAllocation: snap?.rawAllocation ?? 0,
    mappedAllocation: snap?.mappedAllocation ?? 0,
    legacyCount: snap?.legacyCount ?? 0,
    renderedCount: snap?.renderedCount ?? 0,
    renderedBlocks: safeArr(snap?.renderedBlocks),
    visualDiagnostics: snap?.visualDiagnostics ?? null,
    sourceCounts: snap?.sourceCounts ?? null,
  };
}

function buildComparison(
  rawPings: TraceStaffEntry['rawPings'],
  timeEngine: TraceStaffEntry['timeEngine'],
  gantt: TraceStaffEntry['gantt'],
  appearsInReportList: boolean,
  workdayAllocDiag: any,
): TraceComparison {
  const hasRawPings = rawPings.count > 0;
  const hasLocationTruth = (timeEngine.locationTruthV2Segments?.length ?? 0) > 0;
  const hasWorkdayAllocation = (timeEngine.workdayAllocationSegments?.length ?? 0) > 0;
  const hasDisplayTimeline = (timeEngine.displayTimelineBlocksV2?.length ?? 0) > 0;
  const hasRenderedGantt = (gantt.renderedCount ?? 0) > 0;

  const uncoveredWorkdayMinutes =
    typeof workdayAllocDiag?.uncoveredWorkdayMinutes === 'number'
      ? workdayAllocDiag.uncoveredWorkdayMinutes
      : null;
  const effectiveStartAt = workdayAllocDiag?.effectiveWorkdayStartAt ?? null;

  const staleTimerSuspected =
    isStartOfDayIso(effectiveStartAt) && (uncoveredWorkdayMinutes ?? 0) > 240;

  return {
    hasRawPings,
    appearsInReportList,
    hasLocationTruth,
    hasWorkdayAllocation,
    hasDisplayTimeline,
    hasRenderedGantt,
    rawPingsButNoLocationTruth: hasRawPings && !hasLocationTruth,
    locationTruthButNoDisplay: hasLocationTruth && !hasDisplayTimeline,
    displayButNoGantt: hasDisplayTimeline && !hasRenderedGantt,
    staleTimerSuspected,
    uncoveredWorkdayMinutes,
    largestEmptyRenderedPeriodMinutes: largestRenderedGapMinutes(gantt.renderedBlocks),
  };
}

function buildDiffFindings(
  rawPings: TraceStaffEntry['rawPings'],
  appHealth: TraceStaffEntry['appHealth'],
  comparison: TraceComparison,
  rawPingsRaw: RawPingStaffEntry | undefined,
  timeEngine: TraceStaffEntry['timeEngine'],
): DiffFinding[] {
  const findings: DiffFinding[] = [];

  if (!comparison.hasRawPings) {
    findings.push({
      severity: appHealth.lastAppSeenAt ? 'warning' : 'info',
      type: 'raw_pings_missing',
      message: appHealth.lastAppSeenAt
        ? 'Inga GPS-pings för dagen, men appen har setts.'
        : 'Inga GPS-pings för dagen.',
      evidence: { lastAppSeenAt: appHealth.lastAppSeenAt },
    });
  }

  if (comparison.hasRawPings && !comparison.appearsInReportList) {
    findings.push({
      severity: 'critical',
      type: 'staff_has_pings_but_missing_from_report',
      message: 'Personen har GPS-pings men finns inte i rapportlistan.',
      evidence: {
        rawPingCount: rawPings.count,
        firstRecordedAt: rawPings.firstRecordedAt,
        lastRecordedAt: rawPings.lastRecordedAt,
      },
    });
  }

  if (comparison.rawPingsButNoLocationTruth) {
    findings.push({
      severity: 'warning',
      type: 'pings_exist_but_no_location_truth',
      message: 'GPS-pings finns men LocationTruth genererade inga segment.',
      evidence: { rawPingCount: rawPings.count },
    });
  }
  if (comparison.locationTruthButNoDisplay) {
    findings.push({
      severity: 'warning',
      type: 'location_truth_exists_but_no_display',
      message: 'LocationTruth-segment finns men display-timelinen är tom.',
      evidence: {},
    });
  }
  if (comparison.displayButNoGantt) {
    findings.push({
      severity: 'critical',
      type: 'display_exists_but_no_gantt',
      message: 'Display-timeline har block men Gantt renderade inga.',
      evidence: {},
    });
  }
  if (comparison.staleTimerSuspected) {
    findings.push({
      severity: 'warning',
      type: 'stale_timer_created_large_empty_day',
      message: 'Workday startar 00:00 och stora delar är ofördelad tid — sannolikt stale timer.',
      evidence: { uncoveredWorkdayMinutes: comparison.uncoveredWorkdayMinutes },
    });
  } else if ((comparison.uncoveredWorkdayMinutes ?? 0) > 120) {
    findings.push({
      severity: 'info',
      type: 'large_uncovered_time',
      message: 'Mer än 2 timmar workday är ofördelad.',
      evidence: { uncoveredWorkdayMinutes: comparison.uncoveredWorkdayMinutes },
    });
  }
  if (rawPingsRaw?.battery?.likelyBatteryRelatedSignalLoss) {
    findings.push({
      severity: 'warning',
      type: 'battery_low_before_signal_gap',
      message: 'Låg batteri innan stor GPS-tystnad — sannolik batterirelaterad signalförlust.',
      evidence: {
        lastBatteryPercent: rawPingsRaw.battery.lastBatteryPercent,
        minBatteryPercent: rawPingsRaw.battery.minBatteryPercent,
        maxGapMinutes: rawPings.maxGapMinutes,
      },
    });
  }
  if ((comparison.largestEmptyRenderedPeriodMinutes ?? 0) > 90) {
    findings.push({
      severity: 'info',
      type: 'rendered_gap_too_large',
      message: 'Mer än 90 minuter mellan två renderade Gantt-block.',
      evidence: { largestEmptyRenderedPeriodMinutes: comparison.largestEmptyRenderedPeriodMinutes },
    });
  }

  // Lineage-check: workdayAllocationSegments refererar till
  // sourceLocationTruthSegmentIds (t.ex. seg_cluster_57). Om något av
  // dessa IDn inte återfinns i locationTruthV2Segments betyder det att
  // exporten har tappat segmenten (eller att backend byggde dem och
  // sedan släppte dem mellan stegen). Detta är exakt det fel som
  // tidigare gjorde att locationTruthV2Segments = [] medan allocation
  // refererade till seg_cluster_N-IDn.
  const ltIds = new Set<string>(
    safeArr<any>(timeEngine.locationTruthV2Segments)
      .map((s) => (s && typeof s.id === 'string' ? s.id : null))
      .filter((x): x is string => !!x),
  );
  const referencedLtIds = new Set<string>();
  for (const a of safeArr<any>(timeEngine.workdayAllocationSegments)) {
    for (const sid of safeArr<any>(a?.sourceLocationTruthSegmentIds)) {
      if (typeof sid === 'string') referencedLtIds.add(sid);
    }
  }
  const orphanLtIds = [...referencedLtIds].filter((id) => !ltIds.has(id));
  if (orphanLtIds.length > 0) {
    findings.push({
      severity: 'critical',
      type: 'allocation_references_unknown_location_truth_segment',
      message:
        'WorkdayAllocation refererar till LocationTruth-segment som inte finns med i exporten — lineage bruten.',
      evidence: {
        orphanSourceLocationTruthSegmentIds: orphanLtIds.slice(0, 20),
        orphanCount: orphanLtIds.length,
        locationTruthSegmentCount: ltIds.size,
        notBuiltReason: timeEngine.locationTruthV2NotBuiltReason,
      },
    });
  }

  return findings;
}

export function buildTimeEngineTraceExport(input: BuildTraceExportInput): TimeEngineTraceExport {
  const maxRows = input.maxRowsPerStaff ?? DEFAULT_MAX_ROWS;
  const rawPingsByStaff = new Map<string, RawPingStaffEntry>();
  for (const e of safeArr(input.rawPings?.perStaff)) rawPingsByStaff.set(e.staffId, e);

  // Union: alla staff vi sett i rapport-seedet + alla med raw pings.
  const knownIds = new Set<string>();
  for (const s of input.staffSeeds) knownIds.add(s.staffId);
  for (const id of rawPingsByStaff.keys()) knownIds.add(id);

  const seedById = new Map<string, StaffSeedForExport>();
  for (const s of input.staffSeeds) seedById.set(s.staffId, s);

  const staffEntries: TraceStaffEntry[] = [];
  for (const staffId of knownIds) {
    const seed = seedById.get(staffId) ?? null;
    const rawEntry = rawPingsByStaff.get(staffId);
    const cand = input.reportCandidateByStaff?.[staffId];
    const ganttSnap = input.ganttDiagnosticsByStaff?.[staffId];

    const staffName =
      seed?.staffName ?? rawEntry?.staffName ?? null;
    const appearsInReportList = seed?.appearsInReportList ?? false;

    const rawPings = buildRawPingsSection(rawEntry, maxRows);
    const appHealth = buildAppHealthSection(rawEntry);

    const timeEngine: TraceStaffEntry['timeEngine'] = {
      dayEvidenceDiagnostics: cand?.diagnostics ?? null,
      // FIX: LocationTruth V2 ligger top-level på presence-day-svaret —
      // INTE under displayTimelineDiagnosticsV2.locationTruth*. Tidigare
      // path gav alltid null/[] vilket gjorde att exporten såg ut som om
      // LocationTruth aldrig byggts, trots att workdayAllocationSegments
      // refererade till seg_cluster_N-IDn från LocationTruth.
      locationTruthV2Diagnostics:
        cand?.locationTruthV2Diagnostics
        ?? cand?.displayTimelineDiagnosticsV2?.locationTruth
        ?? null,
      locationTruthV2Segments: safeArr(
        cand?.locationTruthV2Segments
        ?? cand?.displayTimelineDiagnosticsV2?.locationTruthSegments,
      ),
      locationTruthV2NotBuiltReason: cand?.locationTruthV2NotBuiltReason ?? null,
      workdayAllocationDiagnostics: cand?.workdayAllocationDiagnostics ?? null,
      workdayAllocationSegments: safeArr(cand?.workdayAllocationSegments),
      workdayAllocationProposals: safeArr(cand?.workdayAllocationProposals),
      displayTimelineDiagnosticsV2: cand?.displayTimelineDiagnosticsV2 ?? null,
      displayTimelineBlocksV2: safeArr(cand?.displayTimelineBlocksV2),
      aiWorkdayReviewSummary: cand?.aiWorkdayReviewSummary ?? null,
      aiWorkdayReviewProposals: safeArr(cand?.aiWorkdayReviewProposals),
    };

    const gantt = buildGanttSection(ganttSnap);

    const comparison = buildComparison(
      rawPings,
      timeEngine,
      gantt,
      appearsInReportList,
      timeEngine.workdayAllocationDiagnostics,
    );

    const diffFindings = buildDiffFindings(rawPings, appHealth, comparison, rawEntry, timeEngine);

    const finalProduct: TraceStaffEntry['finalProduct'] = {
      reportBlocks: safeArr(cand?.blocks),
      displayBlocks: timeEngine.displayTimelineBlocksV2,
      ganttBlocks: gantt.renderedBlocks,
      visibleTimelineBlocks: timeEngine.displayTimelineBlocksV2.filter(
        (b: any) => b?.lane !== 'raw_only',
      ),
    };

    staffEntries.push({
      staffId,
      staffName,
      rawPings,
      appHealth,
      timeEngine,
      gantt,
      finalProduct,
      comparison,
      diffFindings,
    });
  }

  staffEntries.sort((a, b) =>
    (a.staffName ?? a.staffId).localeCompare(b.staffName ?? b.staffId, 'sv'),
  );

  const truncatedStaff = staffEntries.filter(s => s.rawPings.truncated);
  const rawPingsTruncatedTotalMissingRows = truncatedStaff.reduce((sum, s) => {
    const total = s.rawPings.totalCountBeforeLimit ?? s.rawPings.count;
    const got = s.rawPings.rows.length;
    return sum + Math.max(0, total - got);
  }, 0);
  const rawPingsWarnings = safeArr<string>(input.rawPings?.diagnostics?.warnings);
  const rawPingsHardCapReached =
    input.rawPings?.diagnostics?.paginationUsed?.truncated === true ||
    rawPingsWarnings.some(w => w.startsWith('row_hard_cap_'));

  const summary = {
    totalStaff: staffEntries.length,
    staffWithRawPings: staffEntries.filter(s => s.rawPings.count > 0).length,
    staffMissingFromReport: staffEntries.filter(
      s => s.rawPings.count > 0 && !s.comparison.appearsInReportList,
    ).length,
    totalDiffFindings: staffEntries.reduce((sum, s) => sum + s.diffFindings.length, 0),
    criticalFindings: staffEntries.reduce(
      (sum, s) => sum + s.diffFindings.filter(f => f.severity === 'critical').length,
      0,
    ),
    warningFindings: staffEntries.reduce(
      (sum, s) => sum + s.diffFindings.filter(f => f.severity === 'warning').length,
      0,
    ),
    rawPingsTruncatedStaffCount: truncatedStaff.length,
    rawPingsTruncatedTotalMissingRows,
    rawPingsHardCapReached,
    rawPingsWarnings,
  };

  return {
    exportedAt: input.exportedAt,
    organizationId: input.organizationId,
    date: input.date,
    timezone: input.timezone,
    summary,
    staff: staffEntries,
  };
}

/**
 * Triggers a JSON file download in the browser. Behåller load-from-data
 * read-only — anropas bara från debug-knappen.
 */
export function downloadTraceExportJson(exp: TimeEngineTraceExport): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `time-engine-trace-${exp.date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Fördröj revoke så Safari hinner starta nedladdning.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
