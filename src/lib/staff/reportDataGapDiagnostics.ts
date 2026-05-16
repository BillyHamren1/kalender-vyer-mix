/**
 * reportDataGapDiagnostics — pure helper för felsökning av tomma/glappiga
 * rader i /staff-management/time-reports.
 *
 * VIKTIGT:
 *   - Detta är ENDAST diagnostics.
 *   - Skriver ingen data.
 *   - Ändrar inte Time Engine, LocationTruth, allocation, Gantt eller
 *     report-buildern.
 *   - Alla optional-fält degraderar mjukt: saknas en signal → vi rapporterar
 *     bara på det vi vet.
 */

export type ReportDataGapStatus =
  | 'ok'
  | 'raw_pings_missing'
  | 'staff_missing_from_report'
  | 'pings_exist_but_no_location_truth'
  | 'location_truth_exists_but_no_display_blocks'
  | 'display_blocks_exist_but_no_gantt_blocks'
  | 'stale_timer_created_empty_day'
  | 'app_seen_but_no_gps'
  | 'likely_battery_signal_loss'
  | 'unknown_problem';

export type ReportDataGapSeverity = 'info' | 'warning' | 'critical';

export type ReportDataGapNextAction =
  | 'check_phone_permissions'
  | 'check_app_background_state'
  | 'inspect_day_evidence'
  | 'inspect_location_truth'
  | 'fix_stale_timer'
  | 'fix_display_timeline_gap_rendering'
  | 'fix_gantt_mapping'
  | 'none';

export interface RawPingDiagnosticsInput {
  rawPingCount: number;
  firstRawPingAt: string | null;
  lastRawPingAt: string | null;
  maxRawGapMinutes: number | null;
  gapCountOver15Min?: number;
  gapCountOver60Min?: number;
  medianAccuracy?: number | null;
  p90Accuracy?: number | null;
  /** True om en GPS-ping precis före ett stort gap hade <= 10% batteri. */
  lowBatteryBeforeGap?: boolean;
  batteryDroppedFast?: boolean;
  lastBatteryPercent?: number | null;
}

export interface AppHealthDiagnosticsInput {
  lastAppSeenAt: string | null;
  lastAppState?: string | null;
  lastHealthEventType?: string | null;
  lastBatteryPercent?: number | null;
  latestIsCharging?: boolean | null;
}

export interface ReportChainInput {
  /** Är staff med i rapportlistan på /staff-management/time-reports? */
  isShownInReportList: boolean;
  /** Hur många LocationTruth-segment som finns för staff+dag. */
  locationTruthSegmentCount?: number | null;
  /** Antal blocks i display-timeline v2. */
  displayTimelineBlocksV2Count?: number | null;
  /** Hur många faktiskt renderade Gantt-blocks. */
  renderedGanttBlocks?: number | null;
  /** Workday-allocation segments. */
  workdayAllocationSegmentCount?: number | null;
  /** Minuter i workday som inte täcks av allocation. */
  uncoveredWorkdayMinutes?: number | null;
  effectiveWorkdayStartAt?: string | null;
  effectiveWorkdayEndAt?: string | null;
  /** Sant om det finns en öppen timer som verkar ha skapat hela dagen från 00:00. */
  staleOpenTimer?: boolean;
  selectedGanttSource?: string | null;
  rawV2?: number | null;
  mappedV2?: number | null;
  rawAllocation?: number | null;
  mappedAllocation?: number | null;
  legacyCount?: number | null;
}

export interface ReportDataGapInput {
  staffId: string;
  staffName: string | null;
  date: string; // YYYY-MM-DD
  rawPings: RawPingDiagnosticsInput;
  appHealth?: AppHealthDiagnosticsInput | null;
  reportChain: ReportChainInput;
}

export interface ReportDataGapMetrics {
  rawPingCount: number;
  locationTruthSegmentCount: number | null;
  displayTimelineBlocksV2Count: number | null;
  renderedGanttBlocks: number | null;
  uncoveredWorkdayMinutes: number | null;
  maxRawGapMinutes: number | null;
  effectiveWorkdayStartAt: string | null;
  effectiveWorkdayEndAt: string | null;
  lastAppSeenAt: string | null;
  lastRawPingAt: string | null;
  lastBatteryPercent: number | null;
}

export interface ReportDataGapDiagnosis {
  staffId: string;
  staffName: string | null;
  date: string;
  status: ReportDataGapStatus;
  severity: ReportDataGapSeverity;
  reason: string;
  metrics: ReportDataGapMetrics;
  suggestedNextAction: ReportDataGapNextAction;
}

const STATUS_LABEL: Record<ReportDataGapStatus, string> = {
  ok: 'OK',
  raw_pings_missing: 'Inga GPS-pings',
  staff_missing_from_report: 'Pings finns men saknas i rapport',
  pings_exist_but_no_location_truth: 'GPS finns men LocationTruth saknas',
  location_truth_exists_but_no_display_blocks: 'LocationTruth finns men inga display-blocks',
  display_blocks_exist_but_no_gantt_blocks: 'Display-blocks finns men inga Gantt-blocks',
  stale_timer_created_empty_day: 'Stale timer skapar tom dag',
  app_seen_but_no_gps: 'App sågs men GPS saknas',
  likely_battery_signal_loss: 'Låg batteri före signalgap',
  unknown_problem: 'Okänt problem',
};

export function describeReportDataGapStatus(status: ReportDataGapStatus): string {
  return STATUS_LABEL[status];
}

function isStartOfDay(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  // Tolerant: räknar 00:00–00:05 lokal+UTC som "nära midnatt".
  const hhmm = iso.slice(11, 16);
  if (hhmm === '00:00' || hhmm === '00:01' || hhmm === '00:02' || hhmm === '00:03' || hhmm === '00:04' || hhmm === '00:05') {
    return true;
  }
  return d.getUTCHours() === 0 && d.getUTCMinutes() < 6;
}

function appSeenAfterLastGps(
  appHealth: AppHealthDiagnosticsInput | null | undefined,
  lastRawPingAt: string | null,
): boolean {
  if (!appHealth?.lastAppSeenAt) return false;
  if (!lastRawPingAt) return appHealth.lastAppSeenAt !== null;
  const app = new Date(appHealth.lastAppSeenAt).getTime();
  const ping = new Date(lastRawPingAt).getTime();
  if (!Number.isFinite(app) || !Number.isFinite(ping)) return false;
  // Kräv minst 5 min för att räkna som "app sågs senare än sista ping".
  return app - ping >= 5 * 60_000;
}

export function buildReportDataGapDiagnosis(
  input: ReportDataGapInput,
): ReportDataGapDiagnosis {
  const { staffId, staffName, date, rawPings, appHealth, reportChain } = input;

  const metrics: ReportDataGapMetrics = {
    rawPingCount: rawPings.rawPingCount,
    locationTruthSegmentCount: reportChain.locationTruthSegmentCount ?? null,
    displayTimelineBlocksV2Count: reportChain.displayTimelineBlocksV2Count ?? null,
    renderedGanttBlocks: reportChain.renderedGanttBlocks ?? null,
    uncoveredWorkdayMinutes: reportChain.uncoveredWorkdayMinutes ?? null,
    maxRawGapMinutes: rawPings.maxRawGapMinutes ?? null,
    effectiveWorkdayStartAt: reportChain.effectiveWorkdayStartAt ?? null,
    effectiveWorkdayEndAt: reportChain.effectiveWorkdayEndAt ?? null,
    lastAppSeenAt: appHealth?.lastAppSeenAt ?? null,
    lastRawPingAt: rawPings.lastRawPingAt,
    lastBatteryPercent:
      rawPings.lastBatteryPercent ?? appHealth?.lastBatteryPercent ?? null,
  };

  const base = { staffId, staffName, date, metrics };

  // 1. raw_pings_missing — det viktigaste signalfallet först.
  if (rawPings.rawPingCount === 0) {
    // Om appen ändå syns: app_seen_but_no_gps är starkare signal.
    if (appHealth?.lastAppSeenAt) {
      return {
        ...base,
        status: 'app_seen_but_no_gps',
        severity: 'warning',
        reason: `Appen sågs ${appHealth.lastHealthEventType ?? ''} men inga GPS-pings registrerades för dagen.`,
        suggestedNextAction: 'check_phone_permissions',
      };
    }
    return {
      ...base,
      status: 'raw_pings_missing',
      severity: 'warning',
      reason: 'Inga GPS-pings för dagen.',
      suggestedNextAction: 'check_app_background_state',
    };
  }

  // 2. staff_missing_from_report — pings finns men staff saknas i listan.
  if (!reportChain.isShownInReportList) {
    return {
      ...base,
      status: 'staff_missing_from_report',
      severity: 'critical',
      reason: `${rawPings.rawPingCount} GPS-pings finns men staff visas inte i rapportlistan.`,
      suggestedNextAction: 'inspect_day_evidence',
    };
  }

  // 6. stale_timer_created_empty_day — kollas före gantt-stegen, eftersom en
  // stale timer ofta ger 0 i alla efterföljande räkneverk.
  if (
    reportChain.staleOpenTimer === true &&
    isStartOfDay(reportChain.effectiveWorkdayStartAt ?? null) &&
    (reportChain.uncoveredWorkdayMinutes ?? 0) >= 240
  ) {
    return {
      ...base,
      status: 'stale_timer_created_empty_day',
      severity: 'critical',
      reason: `Öppen timer från 00:00 lämnar ${reportChain.uncoveredWorkdayMinutes} min utan täckning.`,
      suggestedNextAction: 'fix_stale_timer',
    };
  }

  // 3. pings_exist_but_no_location_truth
  if (
    reportChain.locationTruthSegmentCount != null &&
    reportChain.locationTruthSegmentCount === 0
  ) {
    return {
      ...base,
      status: 'pings_exist_but_no_location_truth',
      severity: 'warning',
      reason: `${rawPings.rawPingCount} pings finns men LocationTruth genererade 0 segment.`,
      suggestedNextAction: 'inspect_location_truth',
    };
  }

  // 4. location_truth_exists_but_no_display_blocks
  if (
    (reportChain.locationTruthSegmentCount ?? 0) > 0 &&
    reportChain.displayTimelineBlocksV2Count != null &&
    reportChain.displayTimelineBlocksV2Count === 0
  ) {
    return {
      ...base,
      status: 'location_truth_exists_but_no_display_blocks',
      severity: 'warning',
      reason: `${reportChain.locationTruthSegmentCount} LocationTruth-segment men 0 display-blocks v2.`,
      suggestedNextAction: 'fix_display_timeline_gap_rendering',
    };
  }

  // 5. display_blocks_exist_but_no_gantt_blocks
  if (
    (reportChain.displayTimelineBlocksV2Count ?? 0) > 0 &&
    reportChain.renderedGanttBlocks != null &&
    reportChain.renderedGanttBlocks === 0
  ) {
    return {
      ...base,
      status: 'display_blocks_exist_but_no_gantt_blocks',
      severity: 'warning',
      reason: `${reportChain.displayTimelineBlocksV2Count} display-blocks men 0 renderade Gantt-blocks.`,
      suggestedNextAction: 'fix_gantt_mapping',
    };
  }

  // 7. app_seen_but_no_gps — appen sågs senare än sista ping och inga nya kom.
  if (appSeenAfterLastGps(appHealth, rawPings.lastRawPingAt)) {
    return {
      ...base,
      status: 'app_seen_but_no_gps',
      severity: 'info',
      reason: 'Appen sågs efter sista GPS-ping utan att skicka nya pings.',
      suggestedNextAction: 'check_app_background_state',
    };
  }

  // 8. likely_battery_signal_loss
  if (rawPings.lowBatteryBeforeGap === true || rawPings.batteryDroppedFast === true) {
    return {
      ...base,
      status: 'likely_battery_signal_loss',
      severity: 'info',
      reason: rawPings.lowBatteryBeforeGap
        ? 'Sista GPS-ping före stort gap hade ≤10% batteri.'
        : 'Batteri föll snabbt under dagen — kan ha orsakat signalförlust.',
      suggestedNextAction: 'check_phone_permissions',
    };
  }

  return {
    ...base,
    status: 'ok',
    severity: 'info',
    reason: 'Inga gap-problem upptäckta.',
    suggestedNextAction: 'none',
  };
}
