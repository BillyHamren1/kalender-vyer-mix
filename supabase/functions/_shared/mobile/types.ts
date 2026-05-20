// Shared types for the mobile Time-app day-report endpoint.
// Kept tiny + deterministic — the mobile UI must NEVER reinterpret blocks.

export type MobileSegmentKind =
  | "project"
  | "booking"
  | "large_project"
  | "warehouse"
  | "location"
  | "travel"
  | "break"
  | "unknown"
  | "needs_review";

export type MobileSegmentConfidence = "high" | "medium" | "low";

/**
 * Time Reporting Fix 6 — varje segment bär sin källa så UI/debug kan se om
 * mobilen renderar V2 (display_timeline_v2), workday_allocation_fallback
 * eller legacy report_candidate_legacy_fallback.
 */
export type MobileSegmentSource =
  | "display_timeline_v2"
  | "workday_allocation_fallback"
  | "report_candidate_legacy_fallback";

export interface MobileSegment {
  id: string;
  kind: MobileSegmentKind;
  label: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  isActive: boolean;
  confidence: MobileSegmentConfidence;
  statusLabel: string | null;
  warningLabel: string | null;
  projectId: string | null;
  bookingId: string | null;
  largeProjectId: string | null;
  locationId: string | null;
  sourceBlockId: string;
  /** Time Reporting Fix 6 — vilken cache-källa byggde detta segment. */
  source: MobileSegmentSource;
}

export interface MobileSummary {
  workMinutes: number;
  travelMinutes: number;
  breakMinutes: number;
  reviewMinutes: number;
  payableMinutes: number;
}

export interface MobileActionItem {
  id: string;
  title: string;
  description?: string | null;
  severity: "info" | "warning" | "error";
}

export interface MobileSubmission {
  status: "submitted" | "approved" | "rejected" | "correction_requested" | "withdrawn";
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  breakMinutes: number;
  comment: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewComment: string | null;
}

export type MobileCacheStatus = "ready" | "missing" | "stale" | "error";
export type MobileWorkdayStatus = "inactive" | "active" | "ended";

/**
 * Time Reporting Fix 2 — Day status får ALDRIG härledas från att alla segment
 * har endedAt. Endast explicit dagtimer-stop, backend dayEnded eller
 * submission/approve får sätta dagen som avslutad/inskickad.
 */
export type MobileDayStatus =
  | "active_day"
  | "ended_day"
  | "submitted_day"
  | "has_time_not_submitted"
  | "empty_day";

export interface MobileDayStatusDebug {
  dayStatus: MobileDayStatus;
  reasonForDayStatus: string;
  activeTimerExists: boolean;
  hasSegments: boolean;
  hasWorkBlocks: boolean;
  hasExplicitStoppedAt: boolean;
  hasSubmission: boolean;
  submissionStatus: string | null;
  lastSegmentKind: string | null;
  lastSegmentEndedAt: string | null;
}

export interface MobileTrackingPolicy {
  mode: string;
  heartbeatMs: number;
  distanceFilter: number;
  expectedHeartbeatMs: number;
  maxSilenceMs: number;
  lastPingAt: string | null;
  isSignalStale: boolean;
}

/**
 * Time Reporting Fix 6 — diagnostik för vilken cache-källa mobilen valde.
 * Surfar hasDisplayTimelineV2Field, counts och fallbackReason så admin och
 * mobil kan jämföra sanning utan att gissa.
 */
export interface MobileSourceSelection {
  hasDisplayTimelineV2Field: boolean;
  displayTimelineV2Count: number;
  reportCandidateCount: number;
  selectedSegmentSource: MobileSegmentSource | "none";
  fallbackReason:
    | "v2_present"
    | "v2_present_empty_no_fallback"
    | "v2_missing_used_legacy"
    | "no_cache_or_blocks";
}

export interface MobileWorkday {
  startedAt: string;
  endedAt: string | null;
  isOpen: boolean;
  status: MobileWorkdayStatus;
}

export interface MobileGpsEvidence {
  /** True när V2 inte gav arbetstid men raw GPS finns för dagen. */
  hasGpsEvidenceButNoRenderedWork: boolean;
  gpsEvidenceStartAt: string | null;
  gpsEvidenceEndAt: string | null;
  rawPingCount: number;
  reasonNoWorkRendered: string | null;
}

export interface MobileDayReport {
  date: string;
  staffId: string;
  engineVersion: string | null;
  cacheStatus: MobileCacheStatus;
  cacheError: string | null;
  workdayStatus: MobileWorkdayStatus;
  workday: MobileWorkday | null;
  /** Time Reporting Fix 2 — explicit day-level status (preferred by UI). */
  dayStatus: MobileDayStatus;
  debugDayStatus: MobileDayStatusDebug;
  /** Time Reporting Fix 6 — vilken cache-källa drev segments. */
  debugSourceSelection: MobileSourceSelection;
  summary: MobileSummary;
  segments: MobileSegment[];
  actionsNeeded: MobileActionItem[];
  submission: MobileSubmission | null;
  trackingPolicy: MobileTrackingPolicy | null;
  lastUpdatedAt: string | null;
  /** Time Legacy Purge 4 — info-rad, ALDRIG arbetstid. */
  gpsEvidence?: MobileGpsEvidence | null;
  /**
   * Read-only mirror payload for mobile Gantt parity.
   * Exponeras från get-mobile-staff-day-report så mobilen slipper ett extra
   * skört live-anrop till get-staff-presence-day.
   */
  reportCandidateBlocks?: unknown[] | null;
  displayTimelineBlocksV2?: unknown[] | null;
  workdayAllocationSegments?: unknown[] | null;
  presenceBlocks?: unknown[] | null;
  targets?: unknown[] | null;
}
