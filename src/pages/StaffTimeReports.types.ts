// Typer som tidigare bodde i StaffTimeReports.tsx. Bryts ut så att den
// nya dashboard-sidan kan ersätta UI utan att gamla importörer (StaffGanttView,
// StaffTimeReportsList m.fl.) går sönder.
import type { StaffDayJournal } from '@/lib/staff/dayJournal';
import type { DayMetrics } from '@/lib/staff/dayMetrics';
import type { CanonicalStaffDayModel } from '@/lib/staff/canonicalDayModel';
import type { ActualStaffDayModel } from '@/lib/staff/actualStaffDayModel';

export type SegmentKind = 'location' | 'booking' | 'travel' | 'workday';

export interface DaySegment {
  id: string;
  kind: SegmentKind;
  label: string;
  start: string;
  end: string | null;
  isOpen: boolean;
  hours: number;
}

export interface ProjectInfo {
  booking_id: string;
  label: string;
  is_open: boolean;
  total_hours: number;
}

export interface LatestPing {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  app_version: string | null;
  app_build: string | null;
  app_platform: string | null;
}

export interface PresenceDebug {
  plannedFromBookingStaffAssignments: boolean;
  plannedFromStaffAssignments: boolean;
  plannedFromLargeProjectStaff: boolean;
  hasWorkday: boolean;
  hasOpenWorkday: boolean;
  hasTimeReports: boolean;
  hasLocationTimeEntries: boolean;
  hasTravelLogs: boolean;
  hasGpsPings: boolean;
  hasAssistantEvents: boolean;
  hasWorkdayFlags: boolean;
  visibilityReason: string;
  statusReason: string;
}

export type PlanningStatus =
  | 'planned_not_started'
  | 'missing_workday'
  | 'unplanned_activity'
  | 'workday_active'
  | 'planned'
  | 'completed'
  | 'gps_only';

export interface StaffWithDayReport {
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
  pingsTruncated: boolean;
  pingsFetchError: string | null;
  planningStatus: PlanningStatus;
  plannedLabels: string[];
  presence: PresenceDebug;
}
