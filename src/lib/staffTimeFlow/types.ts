// Gemensam week-flow view model för admin (Tid & Lön) och personalappen.
// Mappas från GPS-summering + staff_day_submissions — INGEN egen tidberäkning,
// INGA skrivningar till time_reports / workdays / location_time_entries /
// travel_time_logs / staff_day_report_cache. Se .lovable/plan.md.

export type WeekFlowStatus =
  | "gps_proposal"
  | "submitted_waiting_approval"
  | "correction_requested"
  | "approved";

export type WeekFlowViewer = "admin" | "staff";

export type WeekFlowRowKind =
  | "work"
  | "travel"
  | "private"
  | "unknown_place"
  | "gps_gap"
  | "other";

export interface WeekFlowRow {
  key: string;
  kind: WeekFlowRowKind;
  label: string;
  startIso: string | null;
  endIso: string | null;
  minutes: number;
  /** Plats man lämnade (för travel/gap). */
  fromLabel?: string | null;
  /** Plats man var på väg till (för travel/gap). */
  toLabel?: string | null;
  /** Submission-source: targetType/targetId om snapshot. */
  targetType?: string | null;
  targetId?: string | null;
  /** Varnings-flagga (t.ex. "GPS-glapp", "Okänd plats"). */
  warning?: string | null;
}

export interface WeekFlowDay {
  date: string;
  status: WeekFlowStatus;
  /** HH:mm i Stockholm-tid, eller null om dagen saknar data. */
  startTime: string | null;
  endTime: string | null;
  workMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  /** Arbetstid 07:00–17:00 (Stockholm), efter rast. */
  normalMinutes: number;
  /** Arbetstid utanför 07:00–17:00 (Stockholm), efter rast. */
  overtimeMinutes: number;
  rows: WeekFlowRow[];
  source: "gps_proposal" | "submission_snapshot" | "empty";
  submissionId: string | null;
  gpsAvailable: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canRequestCorrection: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  reviewComment: string | null;
  /** Antal pings (visuell konfidens). */
  pingCount: number;
}

export interface WeekFlow {
  staffId: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;   // YYYY-MM-DD
  viewer: WeekFlowViewer;
  days: WeekFlowDay[];
}
