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

export interface MobileTrackingPolicy {
  mode: string;
  heartbeatMs: number;
  distanceFilter: number;
  expectedHeartbeatMs: number;
  maxSilenceMs: number;
  lastPingAt: string | null;
  isSignalStale: boolean;
}

export interface MobileWorkday {
  startedAt: string;
  endedAt: string | null;
  isOpen: boolean;
  status: MobileWorkdayStatus;
}

export interface MobileDayReport {
  date: string;
  staffId: string;
  engineVersion: string | null;
  cacheStatus: MobileCacheStatus;
  cacheError: string | null;
  workdayStatus: MobileWorkdayStatus;
  workday: MobileWorkday | null;
  summary: MobileSummary;
  segments: MobileSegment[];
  actionsNeeded: MobileActionItem[];
  submission: MobileSubmission | null;
  trackingPolicy: MobileTrackingPolicy | null;
  lastUpdatedAt: string | null;
}
