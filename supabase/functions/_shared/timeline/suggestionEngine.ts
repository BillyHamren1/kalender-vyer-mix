// Suggestion engine: compare each time_report to verified GPS presence
// and propose corrections.

import type {
  CorrectionSuggestion,
  DayEvent,
  KnownPlace,
  Segment,
  TimeReportRow,
} from "./types.ts";
import { isoToLocalHHMM, minutesBetween } from "./geo.ts";

export interface SuggestEngineInput {
  reports: TimeReportRow[];
  segments: Segment[];
  events: DayEvent[];
  reportedPlaceForReport: (r: TimeReportRow) => KnownPlace | null;
}

export function buildSuggestions(input: SuggestEngineInput): CorrectionSuggestion[] {
  const out: CorrectionSuggestion[] = [];
  const stationary = input.segments.filter((s) => s.isStationary);

  for (const r of input.reports) {
    if (!r.start_time || !r.end_time) continue;
    const reportedPlace = input.reportedPlaceForReport(r);
    if (!reportedPlace) continue;

    const matched = stationary.filter(
      (s) => s.matchedPlace?.id === reportedPlace.id && s.matchedPlace?.type === reportedPlace.type,
    );

    // Case 1: never present at reported site → suggest mark_as_unclear
    if (matched.length === 0) {
      out.push({
        timeReportId: r.id,
        reportDate: r.report_date,
        suggestionType: "mark_as_unclear",
        suggestedStartTime: null,
        suggestedEndTime: null,
        suggestedDurationMin: null,
        originalStartTime: r.start_time,
        originalEndTime: r.end_time,
        differenceMin: null,
        targetBookingId: null,
        targetProjectId: null,
        targetLocationId: null,
        reason: "no_gps_at_reported_site",
        confidence: 0.75,
        humanReadableText: `Ingen GPS-närvaro på ${reportedPlace.name}. Markera som oklar tid eller flytta till rätt plats.`,
      });
      continue;
    }

    // Compute total presence at reported site (sum minutes of matched segments).
    const earliestArrival = matched[0].startTs;
    const latestDeparture = matched[matched.length - 1].endTs;
    const arrivalLocal = isoToLocalHHMM(earliestArrival);
    const departureLocal = isoToLocalHHMM(latestDeparture);

    // Case 2: report ends after the person left → shorten_end
    const reportEndMin = parseHHMM(r.end_time);
    const departureMin = parseHHMM(departureLocal);
    if (reportEndMin !== null && departureMin !== null && reportEndMin - departureMin >= 10) {
      out.push({
        timeReportId: r.id,
        reportDate: r.report_date,
        suggestionType: "shorten_end",
        suggestedStartTime: r.start_time,
        suggestedEndTime: `${departureLocal}:00`,
        suggestedDurationMin: durationMinHHMM(r.start_time, `${departureLocal}:00`),
        originalStartTime: r.start_time,
        originalEndTime: r.end_time,
        differenceMin: reportEndMin - departureMin,
        targetBookingId: r.booking_id,
        targetProjectId: r.large_project_id,
        targetLocationId: r.location_id,
        reason: "left_reported_site_before_report_end",
        confidence: 0.85,
        humanReadableText: `Du lämnade ${reportedPlace.name} kl ${departureLocal} men rapporten slutar kl ${isoToLocalHHMM(synthIso(r.report_date, r.end_time))}. Föreslår att rapporten avslutas kl ${departureLocal}.`,
      });
    }

    // Case 3: report starts before person arrived → shift_start
    const reportStartMin = parseHHMM(r.start_time);
    const arrivalMin = parseHHMM(arrivalLocal);
    if (reportStartMin !== null && arrivalMin !== null && arrivalMin - reportStartMin >= 10) {
      out.push({
        timeReportId: r.id,
        reportDate: r.report_date,
        suggestionType: "shift_start",
        suggestedStartTime: `${arrivalLocal}:00`,
        suggestedEndTime: r.end_time,
        suggestedDurationMin: durationMinHHMM(`${arrivalLocal}:00`, r.end_time),
        originalStartTime: r.start_time,
        originalEndTime: r.end_time,
        differenceMin: arrivalMin - reportStartMin,
        targetBookingId: r.booking_id,
        targetProjectId: r.large_project_id,
        targetLocationId: r.location_id,
        reason: "arrived_reported_site_after_report_start",
        confidence: 0.8,
        humanReadableText: `Du anlände ${reportedPlace.name} kl ${arrivalLocal} men rapporten börjar tidigare. Föreslår att starttiden flyttas till kl ${arrivalLocal}.`,
      });
    }
  }

  return out;
}

function parseHHMM(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function durationMinHHMM(a: string, b: string): number {
  const aM = parseHHMM(a) ?? 0;
  const bM = parseHHMM(b) ?? 0;
  return Math.max(0, bM - aM);
}

function synthIso(date: string, time: string): string {
  const t = time.length === 5 ? `${time}:00` : time;
  return `${date}T${t}+01:00`;
}

// Re-export for tests
export { minutesBetween };
