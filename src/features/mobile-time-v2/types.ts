/**
 * Time v2 — frontend types for the Day Report view & report queue.
 * Mirrors the shape returned by `get-mobile-gps-day-view`,
 * `submit-mobile-gps-day-v2` and `get-mobile-time-report-queue`.
 * The app is a dumb renderer — never computes time, reads pings or
 * talks to legacy tables.
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
  | 'edited'
  | 'ai_flagged'
  | 'needs_user_attention'
  | 'needs_control'
  | 'correction_requested'
  | 'approved'
  | 'payroll_approved'
  | 'rejected'
  | 'withdrawn';

export type MobileGpsReportMode =
  | 'gps_suggestion'
  | 'manual_empty'
  | 'submitted'
  | 'locked';

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

export interface MobileGpsMapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export type MobileGpsMapMarkerKind =
  | 'project'
  | 'large_project'
  | 'location'
  | 'booking'
  | 'home'
  | 'unknown'
  | 'travel_start'
  | 'travel_end';

export interface MobileGpsMapMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: MobileGpsMapMarkerKind;
  segmentKey: string | null;
}

export type MobileGpsMapAreaKind =
  | 'project'
  | 'large_project'
  | 'location'
  | 'booking'
  | 'home';

export interface MobileGpsMapArea {
  id: string;
  label: string;
  kind: MobileGpsMapAreaKind;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}

export interface MobileGpsRouteGeoJson {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: Record<string, unknown>;
}

export interface MobileGpsMap {
  type: 'empty' | 'geojson';
  hasPings: boolean;
  routeGeoJson: MobileGpsRouteGeoJson | null;
  bounds: MobileGpsMapBounds | null;
  markers: MobileGpsMapMarker[];
  areas: MobileGpsMapArea[];
}

// =========================================================================
// Manual work targets — picked by the user. The system never auto-selects.
// =========================================================================
export type ManualWorkTargetType =
  | 'booking'
  | 'project'
  | 'large_project'
  | 'location'
  | 'other';

export interface ManualWorkTarget {
  targetType: ManualWorkTargetType;
  targetId: string | null;
  label: string;
  subtitle: string | null;
  booking_id?: string | null;
  project_id?: string | null;
  large_project_id?: string | null;
  location_id?: string | null;
}

export interface ManualWorkTargets {
  assignedTargets: ManualWorkTarget[];
  locationTargets: ManualWorkTarget[];
  searchableTargets: ManualWorkTarget[];
}

export interface ManualWorkSegmentInput {
  id: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  breakMinutes?: number;
  target: ManualWorkTarget | null;
  comment?: string | null;
  sourceSegmentId?: string | null;
}

export interface ManualDayPayload {
  dayStartTime: string;            // "HH:mm" — whole day start
  dayEndTime: string;              // "HH:mm" — whole day end
  breakMinutes: number;            // total break for the day
  segments: ManualWorkSegmentInput[];
  deletedSegmentIds?: string[];    // sourceSegmentIds removed by the user
  comment?: string | null;
}

export interface MobileGpsDayView {
  source: 'mobile_gps_day_view_v2';
  staffId: string;
  date: string;
  sourceSnapshotId: string;
  title: string;
  subtitle: string;
  reportMode?: MobileGpsReportMode;
  canSubmitManual?: boolean;
  map: MobileGpsMap;
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
  manualTargets: ManualWorkTargets;
  generatedAt: string;
}

export interface SubmitMobileGpsDayV2Input {
  staffId: string;
  date: string;
  userComment?: string | null;
  manualOverrides: MobileGpsManualOverride[];
  expectedSourceSnapshotId?: string | null;
  manualDay?: ManualDayPayload | null;
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

// =========================================================================
// Report queue — overview of recent days that need action or are submitted.
// =========================================================================
export type TimeReportQueueStatus =
  | 'correction_requested'
  | 'needs_submit'
  | 'manual_needed'
  | 'submitted'
  | 'edited'
  | 'needs_user_attention'
  | 'needs_control'
  | 'ai_flagged'
  | 'approved'
  | 'payroll_approved'
  | 'rejected'
  | 'withdrawn';

export interface TimeReportQueueDay {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  status: TimeReportQueueStatus;
  statusLabel: string;
  priority: number;
  hasSubmission: boolean;
  hasEngineSuggestion: boolean;
  hasGps: boolean;
  needsAction: boolean;
  totalMinutes: number;
  totalLabel: string;
  startLabel: string | null;
  endLabel: string | null;
  source: string | null;
  submissionId: string | null;
  reviewComment: string | null;
  canSubmit: boolean;
  canEdit: boolean;
  canOpen: boolean;
}

export interface TimeReportQueue {
  staffId: string;
  from: string;
  to: string;
  days: TimeReportQueueDay[];
}
