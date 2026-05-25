/**
 * Time v2 — frontend types for the GPS Day View.
 * Mirrors the shape returned by `get-mobile-gps-day-view` /
 * `submit-mobile-gps-day-v2`. The app is a dumb renderer of these objects;
 * it never computes time, reads pings or talks to legacy tables.
 */

export type MobileGpsSegmentKind = 'stay' | 'travel' | 'gps_gap';
export type MobileGpsMatchedKind =
  | 'project'
  | 'location'
  | 'booking'
  | 'large_project'
  | 'home'
  | null;

export interface MobileGpsManualOverride {
  /** Stable segment key — comes from backend (`${startTs}|${siteId|"unknown"}`). */
  segmentKey: string;
  startIso?: string | null;
  endIso?: string | null;
  reason?: string | null;
}

export interface MobileGpsDaySegment {
  segmentKey: string;
  kind: MobileGpsSegmentKind;
  type: string;
  label: string;
  originalStartTime: string;
  originalEndTime: string;
  currentStartTime: string;
  currentEndTime: string;
  durationMinutes: number;
  durationLabel: string;
  matched: {
    kind: MobileGpsMatchedKind;
    id: string | null;
    name: string | null;
  };
  manualOverride: {
    hasOverride: boolean;
    reason: string | null;
  };
  confidence: number;
}

export interface MobileGpsDayRow {
  rowKey: string;
  label: string;
  kind: 'project' | 'location' | 'booking' | 'large_project' | 'home' | 'transport' | 'gap' | 'unknown';
  totalMinutes: number;
  totalLabel: string;
  segmentKeys: string[];
}

export interface MobileGpsDayTotals {
  totalDurationMinutes: number;
  totalDurationLabel: string;
  workMinutes: number;
  travelMinutes: number;
  gapMinutes: number;
}

export type MobileGpsSubmissionStatus =
  | 'not_submitted'
  | 'submitted'
  | 'correction_requested'
  | 'approved'
  | 'payroll_approved';

export interface MobileGpsDaySubmission {
  hasSubmission: boolean;
  status: MobileGpsSubmissionStatus;
  submittedAt: string | null;
  submittedBy: string | null;
  userComment: string | null;
  reviewComment: string | null;
  correctionRequestedAt: string | null;
  correctionRequestedBy: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  needsCorrection: boolean;
}

export interface MobileGpsDayMessage {
  id: string;
  authorRole: 'staff' | 'admin' | string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface MobileGpsDayDebug {
  rawPingCount: number;
  firstPingAt: string | null;
  lastPingAt: string | null;
}

export interface MobileGpsDayView {
  source: 'mobile_gps_day_view_v2';
  staffId: string;
  date: string;
  sourceSnapshotId: string;
  title: string;
  subtitle: string;
  segments: MobileGpsDaySegment[];
  rows: MobileGpsDayRow[];
  totals: MobileGpsDayTotals;
  manualOverridesSummary: {
    count: number;
    appliedSegmentKeys: string[];
  };
  submission: MobileGpsDaySubmission;
  messages: MobileGpsDayMessage[];
  debug: MobileGpsDayDebug;
  generatedAt: string;
}

export interface SubmitMobileGpsDayV2Input {
  staffId: string;
  date: string;
  userComment?: string | null;
  manualOverrides: MobileGpsManualOverride[];
  expectedSourceSnapshotId?: string | null;
}

export interface SubmitMobileGpsDayV2Result {
  ok: boolean;
  source: 'mobile_gps_day_view_v2';
  staffId: string;
  date: string;
  sourceSnapshotId: string;
  submission: {
    id: string;
    status: string;
    submittedAt: string;
    userComment: string | null;
  };
  priorStatus: string | null;
}
