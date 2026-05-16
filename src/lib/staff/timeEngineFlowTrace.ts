/**
 * Time Engine Flow Trace (read-only, pure helper)
 * ─────────────────────────────────────────────────────────────
 * Återanvänder befintlig debug-/diagnostics-data från:
 *   - get-staff-presence-day response
 *       • dayEvidenceDiagnostics
 *       • locationTruthV2Diagnostics (+ locationTruthV2Segments)
 *       • workdayAllocationDiagnostics (+ workdayAllocationSegments)
 *       • displayTimelineDiagnosticsV2 (+ displayTimelineBlocksV2)
 *       • reportCandidateDiagnostics (+ reportCandidateBlocks)
 *       • rawGpsTimeline / technicalTimeline / pings
 *       • targetResolution / targets
 *       • activeTimerInfo / summary.activeTimer
 *   - StaffGanttView sourceCountsByStaff (+ selectedGanttSource per staff)
 *
 * Bygger en samlad TimeEngineFlowTrace. Skriver inget, anropar inga API:er.
 * Saknad data → missingDataWarnings i layer, status="problem" i flow step
 * när det är relevant.
 */

export type FlowStepStatus = 'ok' | 'warning' | 'problem';

export type TimeEngineLayerKey =
  | 'dayEvidence'
  | 'locationTruthV2'
  | 'workdayAllocation'
  | 'displayTimelineV2'
  | 'gantt'
  | 'legacyReportCandidate';

export type SuspectedProblemKey =
  | 'stale_open_timer_created_day_from_midnight'
  | 'location_truth_missing_despite_pings'
  | 'workday_uncovered_minutes_high'
  | 'display_timeline_empty'
  | 'gantt_selected_v2_but_rendered_zero'
  | 'unlinked_address_rendered_as_review'
  | 'break_or_gap_rendered_as_large_block'
  | 'assignment_overrode_gps'
  | 'child_booking_used_instead_of_large_project'
  | 'raw_pings_exist_but_no_location_truth'
  | 'raw_pings_exist_but_no_display_blocks'
  | 'raw_pings_exist_but_staff_missing_from_report'
  | 'stale_timer_but_no_same_day_pings'
  | 'large_raw_gap_before_first_location_truth'
  | 'battery_low_before_signal_loss';

/**
 * Optional battery diagnostics-snapshot för en staff/dag.
 * Speglar fält från `computeBatteryDiagnostics` + valfritt sista ping
 * före stort signal-gap för bannertext.
 */
export interface BatteryDiagnosticsSnapshot {
  hasBatteryData: boolean;
  firstBatteryPercent: number | null;
  lastBatteryPercent: number | null;
  minBatteryPercent: number | null;
  latestIsCharging: boolean | null;
  batterySamplesCount: number;
  missingBatterySamplesCount: number;
  likelyBatteryRelatedSignalLoss: boolean;
  batteryDroppedFast: boolean;
  /** Valfri lista över snabba batterifall (>15pp / 60min eller >30pp totalt). */
  batteryDropEvents?: Array<{
    fromPercent: number;
    toPercent: number;
    startedAt: string | null;
    endedAt: string | null;
    windowMinutes: number | null;
  }>;
  /**
   * Valfritt: sista ping innan ett stort signal-gap (>30 min). Används endast
   * för att bygga summary-bannertext typ "GPS-signal tappades efter 12:04…".
   */
  lastPingBeforeLargeGap?: {
    recordedAt: string;
    batteryPercent: number | null;
    isCharging: boolean | null;
    gapAfterMinutes: number;
  } | null;
}

/**
 * Optional raw GPS debug snapshot för en specifik staff/dag.
 * Speglar fält från debug-raw-staff-pings (perStaff entry).
 */
export interface RawPingDebugSnapshot {
  rawPingCount: number;
  firstRawPingAt: string | null;
  lastRawPingAt: string | null;
  maxRawPingGapMinutes: number | null;
  medianAccuracy: number | null;
  p90Accuracy: number | null;
  /** True om personen INTE finns i rapportlistans staffIds-set. */
  missingFromReportList?: boolean;
}

export interface TimeEngineLayerInfo {
  key: TimeEngineLayerKey;
  available: boolean;
  diagnostics: any | null;
  missingDataWarnings: string[];
  /** Snabbnyckeltal vi vill visa i en kortet-i-kortet vy. */
  metrics: Record<string, number | string | null>;
}

export interface TimeEngineFlowStep {
  layer: TimeEngineLayerKey;
  title: string;
  status: FlowStepStatus;
  beforeCount: number | null;
  afterCount: number | null;
  reason: string | null;
  warnings: string[];
  metrics: Record<string, number | string | null>;
}

export interface TimeEngineBlockLineage {
  displayBlockId: string | null;
  allocationSegmentIds: string[];
  locationTruthSegmentIds: string[];
  ganttBlockId: string | null;
  source: string | null;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  targetType: string | null;
  targetId: string | null;
  warnings: string[];
}

export interface TimeEngineSuspectedProblem {
  key: SuspectedProblemKey;
  layer: TimeEngineLayerKey;
  severity: 'warning' | 'problem';
  title: string;
  detail: string;
}

export interface TimeEngineFlowTraceSummary {
  staffId: string;
  staffName: string | null;
  date: string;
  selectedGanttSource: string | null;
  rawPingCount: number;
  locationLogicPingCount: number;
  locationTruthSegmentCount: number;
  workdayAllocationSegmentCount: number;
  displayTimelineBlockCount: number;
  mappedGanttBlockCount: number;
  renderedGanttBlockCount: number;
  effectiveWorkdayStartAt: string | null;
  effectiveWorkdayEndAt: string | null;
  staleOpenTimer: boolean;
  uncoveredWorkdayMinutes: number | null;
  largestGapMinutes: number | null;
  suspectedProblemLayer: TimeEngineLayerKey | null;
  // ── Raw GPS snapshot (från debug-raw-staff-pings) ────────────────
  rawDebug: {
    available: boolean;
    rawPingCount: number;
    firstRawPingAt: string | null;
    lastRawPingAt: string | null;
    maxRawPingGapMinutes: number | null;
    medianAccuracy: number | null;
    p90Accuracy: number | null;
    hasRawPingsButNoLocationTruth: boolean;
    hasRawPingsButNoDisplayBlocks: boolean;
    hasRawPingsButMissingFromReportList: boolean | null;
  };
  /** Diagnostics för batteri — kopplar inte mot Time Engine, bara visning. */
  batteryDiagnostics: BatteryDiagnosticsSnapshot & {
    /** Förbyggd text att visa i banner/summary om signal-loss-kandidat. */
    signalLossBannerText: string | null;
  };
}

/** Lättviktig decision-trace för battery-laget (visas i DecisionTraceDrawer). */
export interface TimeEngineDecisionTraceItem {
  layer: TimeEngineLayerKey | 'day_evidence';
  decision: string;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  warnings: string[];
}

export interface TimeEngineFlowTrace {
  summary: TimeEngineFlowTraceSummary;
  layers: Record<TimeEngineLayerKey, TimeEngineLayerInfo>;
  flowSteps: TimeEngineFlowStep[];
  suspectedProblems: TimeEngineSuspectedProblem[];
  blockLineage: TimeEngineBlockLineage[];
  missingDataWarnings: string[];
  /** Read-only diagnostic decision trace items (battery m.fl.). */
  decisionTrace: TimeEngineDecisionTraceItem[];
}

export interface GanttSourceCounts {
  rawV2: number;
  mappedV2: number;
  rawAlloc: number;
  mappedAlloc: number;
  legacy: number;
  rendered: number;
}

export interface BuildTimeEngineFlowTraceInput {
  staffId: string;
  staffName?: string | null;
  date: string;
  /** Hela response-objektet från get-staff-presence-day. */
  presenceResponse: any | null;
  /** Vald källa enligt selectGanttSourceFromMapped. */
  selectedGanttSource?:
    | 'displayTimelineV2'
    | 'workdayAllocation'
    | 'reportCandidate'
    | null;
  /** Räknare från StaffGanttView.sourceCountsByStaff[staffId]. */
  ganttSourceCounts?: GanttSourceCounts | null;
  /** Optional raw GPS-debug-snapshot för personen (debug-raw-staff-pings). */
  rawPingDebug?: RawPingDebugSnapshot | null;
  /** Optional battery diagnostics-snapshot (från computeBatteryDiagnostics). */
  batteryDiagnostics?: (Partial<BatteryDiagnosticsSnapshot> & {
    hasBatteryData?: boolean;
  }) | null;
}

// ── helpers ────────────────────────────────────────────────────────

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

const pickStartEnd = (b: any): { startAt: string | null; endAt: string | null } => ({
  startAt: b?.startAt ?? b?.start_at ?? b?.start ?? null,
  endAt: b?.endAt ?? b?.end_at ?? b?.end ?? null,
});

const minutesBetween = (startIso: string | null, endIso: string | null): number | null => {
  if (!startIso || !endIso) return null;
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 60000);
};

// ── main builder ───────────────────────────────────────────────────

export function buildTimeEngineFlowTrace(
  input: BuildTimeEngineFlowTraceInput,
): TimeEngineFlowTrace {
  const r = input.presenceResponse ?? null;
  const missing: string[] = [];

  if (!r) missing.push('presenceResponse saknas helt');

  // ── pull existing diagnostics ───────────────────────────────────
  const dayEvidence = r?.dayEvidenceDiagnostics ?? null;
  const ltV2 = r?.locationTruthV2Diagnostics ?? r?.locationTruthDiagnostics ?? null;
  const ltV2Segments = arr(r?.locationTruthV2Segments ?? r?.locationTruthSegments);
  const wda = r?.workdayAllocationDiagnostics ?? null;
  const wdaSegments = arr(r?.workdayAllocationSegments);
  const dtV2Diag = r?.displayTimelineDiagnosticsV2 ?? null;
  const dtV2Blocks = arr(r?.displayTimelineBlocksV2);
  const rcDiag = r?.reportCandidateDiagnostics ?? null;
  const rcBlocks = arr(r?.reportCandidateBlocks);
  const rawGps = r?.rawGpsTimeline ?? null;
  const technicalTimeline = arr(r?.technicalTimeline);
  const targetResolution = r?.targetResolution ?? rcDiag?.targetResolution ?? null;
  const activeTimer = r?.summary?.activeTimer ?? r?.activeTimerInfo ?? null;

  // ── counts ──────────────────────────────────────────────────────
  const counts = input.ganttSourceCounts ?? null;
  const rawPingCount =
    num(rawGps?.rawPingCount, NaN) || num(rawGps?.pings?.length, NaN) ||
    num(dayEvidence?.rawPingCount, NaN) || 0;
  const locationLogicPingCount =
    num(dayEvidence?.locationLogicPingCount, NaN) ||
    num(ltV2?.inputPingCount, NaN) ||
    num(rawPingCount, 0);
  const outliersRemoved = Math.max(0, rawPingCount - locationLogicPingCount);

  const ltSegCount = num(ltV2Segments.length, 0) || num(ltV2?.segmentsCount, 0);
  const wdaSegCount = num(wdaSegments.length, 0) || num(wda?.segmentsCount, 0);
  const dtBlockCount = num(dtV2Blocks.length, 0) || num(dtV2Diag?.blocksCount, 0);
  const mappedGantt = num(counts?.mappedV2, 0) || num(counts?.mappedAlloc, 0) || num(counts?.legacy, 0);
  const renderedGantt = num(counts?.rendered, 0);

  const effectiveWorkdayStartAt =
    wda?.envelope?.startAt ?? wda?.effectiveStartAt ?? rcDiag?.dayEndDecision?.startAt ?? null;
  const effectiveWorkdayEndAt =
    wda?.envelope?.endAt ?? wda?.effectiveEndAt ?? rcDiag?.dayEndDecision?.endAt ?? null;
  const envelopeMinutes = minutesBetween(effectiveWorkdayStartAt, effectiveWorkdayEndAt);
  const allocatedMinutes = num(wda?.allocatedMinutes, NaN) ||
    wdaSegments.reduce((acc, s) => acc + (minutesBetween(s?.startAt, s?.endAt) ?? 0), 0);
  const uncoveredWorkdayMinutes = envelopeMinutes != null
    ? Math.max(0, envelopeMinutes - allocatedMinutes)
    : null;
  const largestGapMinutes =
    num(wda?.largestGapMinutes, NaN) ||
    num(dtV2Diag?.largestGapMinutes, NaN) ||
    null;

  const staleOpenTimer = Boolean(
    activeTimer &&
      (activeTimer.startedAt ?? activeTimer.started_at) &&
      /T00:00/.test(String(activeTimer.startedAt ?? activeTimer.started_at)) &&
      !activeTimer.stoppedAt &&
      !activeTimer.stopped_at,
  );

  // ── layers ──────────────────────────────────────────────────────
  const layers: Record<TimeEngineLayerKey, TimeEngineLayerInfo> = {
    dayEvidence: {
      key: 'dayEvidence',
      available: !!dayEvidence,
      diagnostics: dayEvidence,
      missingDataWarnings: dayEvidence ? [] : ['dayEvidenceDiagnostics saknas'],
      metrics: {
        rawPingCount,
        locationLogicPingCount,
        outliersRemoved,
      },
    },
    locationTruthV2: {
      key: 'locationTruthV2',
      available: !!ltV2,
      diagnostics: ltV2,
      missingDataWarnings: ltV2 ? [] : ['locationTruthV2Diagnostics saknas'],
      metrics: {
        segments: ltSegCount,
        transportSegments: num(ltV2?.transport?.transportSegmentsCount, 0),
      },
    },
    workdayAllocation: {
      key: 'workdayAllocation',
      available: !!wda,
      diagnostics: wda,
      missingDataWarnings: wda ? [] : ['workdayAllocationDiagnostics saknas'],
      metrics: {
        segments: wdaSegCount,
        envelopeStart: effectiveWorkdayStartAt,
        envelopeEnd: effectiveWorkdayEndAt,
        envelopeMinutes: envelopeMinutes ?? null,
        allocatedMinutes,
        uncoveredMinutes: uncoveredWorkdayMinutes,
      },
    },
    displayTimelineV2: {
      key: 'displayTimelineV2',
      available: !!dtV2Diag || dtBlockCount > 0,
      diagnostics: dtV2Diag,
      missingDataWarnings: dtV2Diag ? [] : ['displayTimelineDiagnosticsV2 saknas'],
      metrics: {
        blocks: dtBlockCount,
      },
    },
    gantt: {
      key: 'gantt',
      available: !!counts,
      diagnostics: counts,
      missingDataWarnings: counts ? [] : ['ganttSourceCounts saknas'],
      metrics: {
        selectedSource: input.selectedGanttSource ?? null,
        mappedGanttBlockCount: mappedGantt,
        renderedGanttBlockCount: renderedGantt,
      },
    },
    legacyReportCandidate: {
      key: 'legacyReportCandidate',
      available: !!rcDiag || rcBlocks.length > 0,
      diagnostics: rcDiag,
      missingDataWarnings: rcDiag ? [] : ['reportCandidateDiagnostics saknas'],
      metrics: {
        blocks: rcBlocks.length,
      },
    },
  };

  // ── flow steps ──────────────────────────────────────────────────
  const flowSteps: TimeEngineFlowStep[] = [];

  flowSteps.push({
    layer: 'dayEvidence',
    title: 'raw_pings_loaded',
    status: rawPingCount > 0 ? 'ok' : 'warning',
    beforeCount: null,
    afterCount: rawPingCount,
    reason: rawPingCount > 0 ? null : 'Inga råpings för dagen',
    warnings: [],
    metrics: { rawPingCount },
  });

  flowSteps.push({
    layer: 'dayEvidence',
    title: 'pings_normalized',
    status: 'ok',
    beforeCount: rawPingCount,
    afterCount: locationLogicPingCount,
    reason: null,
    warnings: [],
    metrics: { locationLogicPingCount },
  });

  flowSteps.push({
    layer: 'dayEvidence',
    title: 'outliers_removed_from_location_logic',
    status: outliersRemoved > 0 ? 'ok' : 'ok',
    beforeCount: rawPingCount,
    afterCount: locationLogicPingCount,
    reason: outliersRemoved > 0 ? `Tog bort ${outliersRemoved} outlier-pings` : 'Inga outliers borttagna',
    warnings: [],
    metrics: { outliersRemoved },
  });

  flowSteps.push({
    layer: 'locationTruthV2',
    title: 'location_truth_segments_created',
    status:
      ltSegCount === 0 && locationLogicPingCount > 0
        ? 'problem'
        : layers.locationTruthV2.available
        ? 'ok'
        : 'warning',
    beforeCount: locationLogicPingCount,
    afterCount: ltSegCount,
    reason:
      ltSegCount === 0 && locationLogicPingCount > 0
        ? 'Inga LocationTruth-segment trots pings'
        : null,
    warnings: [],
    metrics: { segments: ltSegCount },
  });

  flowSteps.push({
    layer: 'workdayAllocation',
    title: 'workday_envelope_selected',
    status:
      effectiveWorkdayStartAt && effectiveWorkdayEndAt
        ? 'ok'
        : layers.workdayAllocation.available
        ? 'warning'
        : 'warning',
    beforeCount: null,
    afterCount: envelopeMinutes ?? null,
    reason:
      effectiveWorkdayStartAt && effectiveWorkdayEndAt
        ? `Envelope ${effectiveWorkdayStartAt} → ${effectiveWorkdayEndAt}`
        : 'Ingen tydlig arbetsdags-envelope',
    warnings: staleOpenTimer ? ['Aktiv timer från midnatt — kan ha skapat fel envelope'] : [],
    metrics: {
      startAt: effectiveWorkdayStartAt,
      endAt: effectiveWorkdayEndAt,
      envelopeMinutes: envelopeMinutes ?? null,
    },
  });

  flowSteps.push({
    layer: 'workdayAllocation',
    title: 'workday_allocation_created',
    status:
      wdaSegCount === 0 && ltSegCount > 0
        ? 'problem'
        : (uncoveredWorkdayMinutes ?? 0) > 90
        ? 'warning'
        : 'ok',
    beforeCount: ltSegCount,
    afterCount: wdaSegCount,
    reason:
      wdaSegCount === 0 && ltSegCount > 0
        ? 'Inga allocation-segment trots LocationTruth-segment'
        : (uncoveredWorkdayMinutes ?? 0) > 90
        ? `Otäckta arbetsdags-minuter: ${uncoveredWorkdayMinutes}`
        : null,
    warnings: [],
    metrics: {
      allocatedMinutes,
      uncoveredWorkdayMinutes: uncoveredWorkdayMinutes ?? null,
      largestGapMinutes: largestGapMinutes ?? null,
    },
  });

  flowSteps.push({
    layer: 'displayTimelineV2',
    title: 'display_timeline_created',
    status:
      dtBlockCount === 0 && wdaSegCount > 0
        ? 'problem'
        : dtBlockCount === 0
        ? 'warning'
        : 'ok',
    beforeCount: wdaSegCount,
    afterCount: dtBlockCount,
    reason: dtBlockCount === 0 ? 'Display timeline tom' : null,
    warnings: [],
    metrics: { blocks: dtBlockCount },
  });

  flowSteps.push({
    layer: 'gantt',
    title: 'gantt_source_selected',
    status: input.selectedGanttSource ? 'ok' : 'warning',
    beforeCount: null,
    afterCount: mappedGantt,
    reason: input.selectedGanttSource
      ? `Vald källa: ${input.selectedGanttSource}`
      : 'Ingen Gantt-källa vald',
    warnings: [],
    metrics: {
      selected: input.selectedGanttSource ?? null,
      mappedV2: counts?.mappedV2 ?? 0,
      mappedAlloc: counts?.mappedAlloc ?? 0,
      legacy: counts?.legacy ?? 0,
    },
  });

  flowSteps.push({
    layer: 'gantt',
    title: 'gantt_blocks_rendered',
    status:
      input.selectedGanttSource === 'displayTimelineV2' && renderedGantt === 0 && dtBlockCount > 0
        ? 'problem'
        : renderedGantt === 0
        ? 'warning'
        : 'ok',
    beforeCount: mappedGantt,
    afterCount: renderedGantt,
    reason:
      renderedGantt === 0
        ? 'Inga Gantt-block renderade'
        : null,
    warnings: [],
    metrics: { rendered: renderedGantt },
  });

  // ── suspected problems ─────────────────────────────────────────
  const suspected: TimeEngineSuspectedProblem[] = [];

  if (staleOpenTimer) {
    suspected.push({
      key: 'stale_open_timer_created_day_from_midnight',
      layer: 'workdayAllocation',
      severity: 'problem',
      title: 'Aktiv timer öppen från midnatt',
      detail:
        'En active_time_registration startade vid 00:00 och har inget stopp — envelope kan ha klampats till hela dygnet.',
    });
  }
  if (locationLogicPingCount > 0 && ltSegCount === 0) {
    suspected.push({
      key: 'location_truth_missing_despite_pings',
      layer: 'locationTruthV2',
      severity: 'problem',
      title: 'LocationTruth saknas trots pings',
      detail: `Pings finns (${locationLogicPingCount}) men inga LocationTruth-segment producerades.`,
    });
  }
  if ((uncoveredWorkdayMinutes ?? 0) > 90) {
    suspected.push({
      key: 'workday_uncovered_minutes_high',
      layer: 'workdayAllocation',
      severity: 'warning',
      title: 'Stor otäckt arbetsdag',
      detail: `Otäckta minuter: ${uncoveredWorkdayMinutes}. Största gap: ${largestGapMinutes ?? '?'} min.`,
    });
  }
  if (dtBlockCount === 0) {
    suspected.push({
      key: 'display_timeline_empty',
      layer: 'displayTimelineV2',
      severity: wdaSegCount > 0 ? 'problem' : 'warning',
      title: 'Display timeline är tom',
      detail:
        wdaSegCount > 0
          ? 'Allocation-segment finns men display timeline blev tom.'
          : 'Inga display-block för dagen.',
    });
  }
  if (
    input.selectedGanttSource === 'displayTimelineV2' &&
    dtBlockCount > 0 &&
    renderedGantt === 0
  ) {
    suspected.push({
      key: 'gantt_selected_v2_but_rendered_zero',
      layer: 'gantt',
      severity: 'problem',
      title: 'V2 valdes men inget renderades',
      detail: 'V2-källan valdes men 0 block kom genom visual pipeline.',
    });
  }

  // Heuristik: needs_review-block utan target_id → unlinked_address
  const needsReview = rcBlocks.filter(
    (b: any) => (b?.kind ?? b?.status) === 'needs_review' && !b?.targetId && !b?.target_id,
  );
  if (needsReview.length > 0) {
    suspected.push({
      key: 'unlinked_address_rendered_as_review',
      layer: 'legacyReportCandidate',
      severity: 'warning',
      title: 'Olänkad adress som "Behöver granskas"',
      detail: `${needsReview.length} block utan target_id renderas som needs_review.`,
    });
  }
  // Heuristik: ett enskilt block > 4h utan target → troligt gap/rast
  const bigBlankBlock = (rcBlocks as any[]).find((b) => {
    const m = minutesBetween(b?.startAt ?? b?.start_at, b?.endAt ?? b?.end_at);
    return (m ?? 0) > 240 && !b?.targetId && !b?.target_id;
  });
  if (bigBlankBlock) {
    suspected.push({
      key: 'break_or_gap_rendered_as_large_block',
      layer: 'legacyReportCandidate',
      severity: 'warning',
      title: 'Stort block utan target',
      detail: 'Ett block >4h utan target_id — kan vara rast eller gap som renderats som arbete.',
    });
  }
  // Heuristik: assignment trumfade GPS
  if (
    rcDiag?.assignmentOverrideUsed ||
    wda?.assignmentOverrideUsed ||
    dayEvidence?.assignmentOverrideUsed
  ) {
    suspected.push({
      key: 'assignment_overrode_gps',
      layer: 'workdayAllocation',
      severity: 'warning',
      title: 'Schemarad övertrumfade GPS',
      detail: 'Schemarad användes istället för GPS-fakta.',
    });
  }
  // Heuristik: child booking använt istället för large project
  const usedChildBooking = (rcBlocks as any[]).some(
    (b) => (b?.targetType ?? b?.target_type) === 'booking' && (b?.large_project_id || b?.largeProjectId),
  );
  if (usedChildBooking) {
    suspected.push({
      key: 'child_booking_used_instead_of_large_project',
      layer: 'legacyReportCandidate',
      severity: 'warning',
      title: 'Underbokning istället för stort projekt',
      detail: 'Block länkades till en underbokning trots att den tillhör ett stort projekt.',
    });
  }

  // ── block lineage ───────────────────────────────────────────────
  const lineage: TimeEngineBlockLineage[] = [];
  for (const b of dtV2Blocks as any[]) {
    const se = pickStartEnd(b);
    lineage.push({
      displayBlockId: b?.id ?? null,
      allocationSegmentIds: arr(b?.allocationSegmentIds ?? b?.sourceAllocationSegmentIds),
      locationTruthSegmentIds: arr(b?.locationTruthSegmentIds ?? b?.sourceLocationTruthSegmentIds),
      ganttBlockId: b?.ganttBlockId ?? b?.id ?? null,
      source: b?.source ?? 'displayTimelineV2',
      title: b?.title ?? b?.label ?? null,
      startAt: se.startAt,
      endAt: se.endAt,
      targetType: b?.targetType ?? b?.target_type ?? null,
      targetId: b?.targetId ?? b?.target_id ?? null,
      warnings: arr(b?.warnings),
    });
  }
  // Lägg till legacy block som inte täcks av V2 (fallback-rendering)
  if (dtV2Blocks.length === 0) {
    for (const b of rcBlocks as any[]) {
      const se = pickStartEnd(b);
      lineage.push({
        displayBlockId: null,
        allocationSegmentIds: [],
        locationTruthSegmentIds: [],
        ganttBlockId: b?.id ?? null,
        source: b?.source ?? 'reportCandidate',
        title: b?.title ?? b?.targetLabel ?? null,
        startAt: se.startAt,
        endAt: se.endAt,
        targetType: b?.targetType ?? b?.target_type ?? null,
        targetId: b?.targetId ?? b?.target_id ?? null,
        warnings: arr(b?.warnings),
      });
    }
  }

  // ── raw GPS debug snapshot ──────────────────────────────────────
  const rpd = input.rawPingDebug ?? null;
  const rawDebugAvailable = !!rpd;
  const rawDebugCount = num(rpd?.rawPingCount, 0);
  const hasRawPingsButNoLocationTruth = rawDebugAvailable && rawDebugCount > 0 && ltSegCount === 0;
  const hasRawPingsButNoDisplayBlocks = rawDebugAvailable && rawDebugCount > 0 && dtBlockCount === 0;
  const hasRawPingsButMissingFromReportList = rawDebugAvailable
    ? Boolean(rpd?.missingFromReportList && rawDebugCount > 0)
    : false;
  const noSameDayPings = rawDebugAvailable && rawDebugCount === 0;

  if (hasRawPingsButNoLocationTruth) {
    suspected.push({
      key: 'raw_pings_exist_but_no_location_truth',
      layer: 'locationTruthV2',
      severity: 'problem',
      title: 'Råa pings finns men ingen LocationTruth',
      detail: `Råa pings: ${rawDebugCount}, men 0 LocationTruth-segment producerades.`,
    });
  }
  if (hasRawPingsButNoDisplayBlocks) {
    suspected.push({
      key: 'raw_pings_exist_but_no_display_blocks',
      layer: 'displayTimelineV2',
      severity: 'problem',
      title: 'Råa pings finns men inga display-block',
      detail: `Råa pings: ${rawDebugCount}, men display timeline är tom.`,
    });
  }
  if (hasRawPingsButMissingFromReportList) {
    suspected.push({
      key: 'raw_pings_exist_but_staff_missing_from_report',
      layer: 'gantt',
      severity: 'problem',
      title: 'Person saknas i rapportlistan trots pings',
      detail: `Personen har ${rawDebugCount} råa pings men finns inte i rapportlistans staff-set.`,
    });
  }
  if (staleOpenTimer && noSameDayPings) {
    suspected.push({
      key: 'stale_timer_but_no_same_day_pings',
      layer: 'workdayAllocation',
      severity: 'problem',
      title: 'Stale timer utan dagens pings',
      detail: 'Aktiv timer rullar från midnatt men inga råa pings finns för dagen.',
    });
  }
  if (
    rawDebugAvailable &&
    rpd?.firstRawPingAt &&
    effectiveWorkdayStartAt &&
    ltSegCount > 0
  ) {
    const firstLtStart =
      (ltV2Segments[0] as any)?.startAt ?? (ltV2Segments[0] as any)?.start_at ?? null;
    const gap = minutesBetween(rpd.firstRawPingAt, firstLtStart);
    if (gap != null && gap > 30) {
      suspected.push({
        key: 'large_raw_gap_before_first_location_truth',
        layer: 'locationTruthV2',
        severity: 'warning',
        title: 'Stort gap mellan första ping och första LocationTruth',
        detail: `Första råa ping ${rpd.firstRawPingAt} → första LT-segment ${firstLtStart} (${gap} min).`,
      });
    }
  }

  // ── battery diagnostics ─────────────────────────────────────────
  const bdInput = input.batteryDiagnostics ?? null;
  const hasBatteryData = Boolean(
    bdInput &&
      (bdInput.hasBatteryData ??
        ((bdInput.batterySamplesCount ?? 0) > 0)),
  );
  const batterySnapshot: BatteryDiagnosticsSnapshot = {
    hasBatteryData,
    firstBatteryPercent: bdInput?.firstBatteryPercent ?? null,
    lastBatteryPercent: bdInput?.lastBatteryPercent ?? null,
    minBatteryPercent: bdInput?.minBatteryPercent ?? null,
    latestIsCharging: bdInput?.latestIsCharging ?? null,
    batterySamplesCount: bdInput?.batterySamplesCount ?? 0,
    missingBatterySamplesCount: bdInput?.missingBatterySamplesCount ?? 0,
    likelyBatteryRelatedSignalLoss: Boolean(bdInput?.likelyBatteryRelatedSignalLoss),
    batteryDroppedFast: Boolean(bdInput?.batteryDroppedFast),
    batteryDropEvents: bdInput?.batteryDropEvents ?? [],
    lastPingBeforeLargeGap: bdInput?.lastPingBeforeLargeGap ?? null,
  };

  const decisionTrace: TimeEngineDecisionTraceItem[] = [];
  let signalLossBannerText: string | null = null;

  if (hasBatteryData) {
    const lp = batterySnapshot.lastPingBeforeLargeGap;
    const lastPctLow =
      typeof batterySnapshot.lastBatteryPercent === 'number' &&
      batterySnapshot.lastBatteryPercent <= 10;
    const gapAfterLow =
      (lp && lp.gapAfterMinutes > 30) ||
      (batterySnapshot.likelyBatteryRelatedSignalLoss === true) ||
      ((rpd?.maxRawPingGapMinutes ?? 0) > 30 && lastPctLow);

    if ((lastPctLow || batterySnapshot.batteryDroppedFast) && gapAfterLow) {
      const pct =
        lp?.batteryPercent ?? batterySnapshot.lastBatteryPercent ?? null;
      const charging =
        lp?.isCharging ?? batterySnapshot.latestIsCharging ?? null;
      const timeLabel = lp?.recordedAt
        ? new Date(lp.recordedAt).toISOString().slice(11, 16)
        : null;
      signalLossBannerText = timeLabel
        ? `GPS-signal tappades efter ${timeLabel}. Batteri vid sista ping: ${
            pct != null ? `${pct} %` : 'okänt'
          }, laddar: ${charging === true ? 'ja' : charging === false ? 'nej' : 'okänt'}.`
        : `Sista batteri-läsning ${pct != null ? `${pct} %` : 'okänt'}, laddar: ${
            charging === true ? 'ja' : charging === false ? 'nej' : 'okänt'
          }. Signal tappades därefter.`;

      suspected.push({
        key: 'battery_low_before_signal_loss',
        layer: 'dayEvidence',
        severity: 'warning',
        title: 'Lågt batteri före signalförlust',
        detail: signalLossBannerText,
      });

      decisionTrace.push({
        layer: 'day_evidence',
        decision: 'battery_signal_loss_candidate',
        reason:
          'Last ping before large gap had battery_percent <= 10 (or fast battery drop) followed by >30 min signal silence.',
        confidence: 'medium',
        warnings: ['low_battery_before_signal_gap'],
      });
    }
  }

  // ── summary ─────────────────────────────────────────────────────
  const summary: TimeEngineFlowTraceSummary = {
    staffId: input.staffId,
    staffName: input.staffName ?? r?.staff?.name ?? null,
    date: input.date,
    selectedGanttSource: input.selectedGanttSource ?? null,
    rawPingCount,
    locationLogicPingCount,
    locationTruthSegmentCount: ltSegCount,
    workdayAllocationSegmentCount: wdaSegCount,
    displayTimelineBlockCount: dtBlockCount,
    mappedGanttBlockCount: mappedGantt,
    renderedGanttBlockCount: renderedGantt,
    effectiveWorkdayStartAt,
    effectiveWorkdayEndAt,
    staleOpenTimer,
    uncoveredWorkdayMinutes,
    largestGapMinutes,
    suspectedProblemLayer:
      suspected.find((s) => s.severity === 'problem')?.layer ??
      suspected[0]?.layer ??
      null,
    rawDebug: {
      available: rawDebugAvailable,
      rawPingCount: rawDebugCount,
      firstRawPingAt: rpd?.firstRawPingAt ?? null,
      lastRawPingAt: rpd?.lastRawPingAt ?? null,
      maxRawPingGapMinutes: rpd?.maxRawPingGapMinutes ?? null,
      medianAccuracy: rpd?.medianAccuracy ?? null,
      p90Accuracy: rpd?.p90Accuracy ?? null,
      hasRawPingsButNoLocationTruth,
      hasRawPingsButNoDisplayBlocks,
      hasRawPingsButMissingFromReportList: rawDebugAvailable
        ? hasRawPingsButMissingFromReportList
        : null,
    },
    batteryDiagnostics: {
      ...batterySnapshot,
      signalLossBannerText,
    },
  };

  // Indikera saknad data globalt
  for (const l of Object.values(layers)) {
    for (const w of l.missingDataWarnings) missing.push(`[${l.key}] ${w}`);
  }
  if (!targetResolution) missing.push('targetResolution saknas');
  if (!rawGps && technicalTimeline.length === 0)
    missing.push('rawGpsTimeline + technicalTimeline saknas');

  return {
    summary,
    layers,
    flowSteps,
    suspectedProblems: suspected,
    blockLineage: lineage,
    missingDataWarnings: missing,
  };
}
