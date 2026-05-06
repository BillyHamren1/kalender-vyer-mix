// Day Timeline Engine — shared types
// engine_version bumpas vid breaking change i event/suggestion-schemat

export const ENGINE_VERSION = "v2";

export type EventType =
  | "workday_started"
  | "workday_ended"
  | "timer_started"
  | "timer_stopped"
  // v2: konsoliderade segment — en rad per stopp / en rad per resa
  | "stay_segment"
  | "travel_segment"
  // legacy (lämnas i typunionen för bakåtläsning av äldre rader)
  | "arrived_at_reported_site"
  | "left_reported_site"
  | "arrived_at_known_location"
  | "left_known_location"
  | "stopped_at_unknown_location"
  | "movement_started"
  | "movement_ended"
  | "gps_gap_started"
  | "gps_gap_ended"
  | "stale_phone_detected"
  | "report_mismatch_detected";

export type MatchedSiteType = "booking" | "project" | "location" | "home" | "unknown";

export type SuggestionType =
  | "shorten_end"
  | "shift_start"
  | "move_to_other_site"
  | "mark_as_travel"
  | "mark_as_unclear"
  | "split";

export interface Ping {
  ts: string;            // ISO timestamptz
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface KnownPlaceAlternative {
  id: string;
  type: MatchedSiteType;
  name: string;
  /** Distance in days from the target date to the closest relevant date of this candidate. */
  dayDistance: number;
  /** True if the visit date falls inside this candidate's auto-window (rig-2 → rigdown+2). */
  insideAutoWindow: boolean;
}

export interface KnownPlace {
  id: string;            // booking_id (text), project_id (uuid), location_id (uuid), or "home:<staffId>"
  type: MatchedSiteType;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;       // default 100
  /**
   * True if this is the chosen primary among multiple candidates at the same
   * address but the visit date sits OUTSIDE the auto-window — UI should ask
   * staff/admin to confirm which project the visit belongs to.
   */
  requiresConfirmation?: boolean;
  /** Other candidates sharing this address (excluding the primary). */
  alternatives?: KnownPlaceAlternative[];
}

export interface Segment {
  startTs: string;
  endTs: string;
  centerLat: number;
  centerLng: number;
  pingCount: number;
  durationMin: number;
  matchedPlace: KnownPlace | null;
  isStationary: boolean; // true = stop, false = movement
}

export interface DayEvent {
  eventType: EventType;
  ts: string;
  endTs?: string | null;          // v2: end of stay/travel segment
  durationMin?: number | null;    // v2: minutes for stay/travel
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  source: string;         // "gps" | "workday" | "timer" | "report"
  matchedSiteId: string | null;
  matchedSiteType: MatchedSiteType | null;
  matchedSiteName: string | null;
  distanceToReportedSiteM: number | null;
  confidence: number;     // 0..1
  humanReadableText: string;
  relatedTimeReportId: string | null;
  relatedWorkdayId: string | null;
  planned?: boolean;              // v2: was this stop planned (matched/reported)?
}

export interface CorrectionSuggestion {
  timeReportId: string;
  reportDate: string; // YYYY-MM-DD
  suggestionType: SuggestionType;
  suggestedStartTime: string | null; // HH:MM
  suggestedEndTime: string | null;
  suggestedDurationMin: number | null;
  originalStartTime: string | null;
  originalEndTime: string | null;
  differenceMin: number | null;
  targetBookingId: string | null;
  targetProjectId: string | null;
  targetLocationId: string | null;
  reason: string;
  confidence: number;
  humanReadableText: string;
}

export interface TimeReportRow {
  id: string;
  staff_id: string;
  organization_id: string;
  report_date: string;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  hours_worked: number | null;
  booking_id: string | null;
  large_project_id: string | null;
  location_id: string | null;
  source: string | null;
}

export interface WorkdayRow {
  id: string;
  staff_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface LocationEntryRow {
  id: string;
  staff_id: string;
  entered_at: string;
  exited_at: string | null;
  location_id: string | null;
  booking_id: string | null;
  large_project_id: string | null;
  source: string | null;
}
