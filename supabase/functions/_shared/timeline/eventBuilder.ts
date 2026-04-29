// Build chronological DayEvent[] from segments + reports + workdays + timer entries.

import type {
  DayEvent,
  KnownPlace,
  LocationEntryRow,
  Segment,
  TimeReportRow,
  WorkdayRow,
} from "./types.ts";
import { distanceFromSegmentTo } from "./matcher.ts";
import { isUnknownStopReportable, type SmartFilterContext } from "./smartFilter.ts";
import { isoToLocalHHMM, minutesBetween } from "./geo.ts";

export interface BuildEventsInput {
  segments: Segment[];
  reports: TimeReportRow[];
  workdays: WorkdayRow[];
  entries: LocationEntryRow[];
  knownPlaces: KnownPlace[];
  homePlace: KnownPlace | null;
  reportedPlaceForReport: (r: TimeReportRow) => KnownPlace | null;
}

export function buildEvents(input: BuildEventsInput): DayEvent[] {
  const events: DayEvent[] = [];

  // 1. Workday events
  for (const wd of input.workdays) {
    events.push(makeWorkdayEvent("workday_started", wd));
    if (wd.ended_at) events.push(makeWorkdayEvent("workday_ended", wd));
  }

  // 2. Timer events
  for (const e of input.entries) {
    events.push(makeTimerEvent("timer_started", e));
    if (e.exited_at) events.push(makeTimerEvent("timer_stopped", e));
  }

  // 3. Stationary segment events (arrivals/departures)
  const stationary = input.segments.filter((s) => s.isStationary);
  for (const seg of stationary) {
    if (seg.matchedPlace) {
      events.push(makeArrivalEvent("arrived_at_known_location", seg, seg.matchedPlace));
      events.push(makeArrivalEvent("left_known_location", seg, seg.matchedPlace, true));
    }
  }

  // 4. Reported-site arrival/departure cross-reference
  for (const r of input.reports) {
    const reportedPlace = input.reportedPlaceForReport(r);
    if (!reportedPlace) continue;

    // Find segments that match this reported place
    const matched = stationary.filter(
      (s) => s.matchedPlace && s.matchedPlace.id === reportedPlace.id && s.matchedPlace.type === reportedPlace.type,
    );
    if (matched.length > 0) {
      const first = matched[0];
      const last = matched[matched.length - 1];
      events.push({
        eventType: "arrived_at_reported_site",
        ts: first.startTs,
        lat: first.centerLat,
        lng: first.centerLng,
        accuracy: null,
        source: "gps",
        matchedSiteId: reportedPlace.id,
        matchedSiteType: reportedPlace.type,
        matchedSiteName: reportedPlace.name,
        distanceToReportedSiteM: distanceFromSegmentTo(first, reportedPlace),
        confidence: 0.9,
        humanReadableText: `Anlände ${reportedPlace.name} kl ${isoToLocalHHMM(first.startTs)}`,
        relatedTimeReportId: r.id,
        relatedWorkdayId: null,
      });
      events.push({
        eventType: "left_reported_site",
        ts: last.endTs,
        lat: last.centerLat,
        lng: last.centerLng,
        accuracy: null,
        source: "gps",
        matchedSiteId: reportedPlace.id,
        matchedSiteType: reportedPlace.type,
        matchedSiteName: reportedPlace.name,
        distanceToReportedSiteM: distanceFromSegmentTo(last, reportedPlace),
        confidence: 0.9,
        humanReadableText: `Lämnade ${reportedPlace.name} kl ${isoToLocalHHMM(last.endTs)}`,
        relatedTimeReportId: r.id,
        relatedWorkdayId: null,
      });
    } else {
      // Mismatch — reported site never appeared in GPS
      events.push({
        eventType: "report_mismatch_detected",
        ts: r.start_time
          ? toIsoFromLocal(r.report_date, r.start_time)
          : new Date().toISOString(),
        lat: null,
        lng: null,
        accuracy: null,
        source: "report",
        matchedSiteId: reportedPlace.id,
        matchedSiteType: reportedPlace.type,
        matchedSiteName: reportedPlace.name,
        distanceToReportedSiteM: null,
        confidence: 0.7,
        humanReadableText: `Rapport gäller ${reportedPlace.name} men ingen GPS-närvaro där`,
        relatedTimeReportId: r.id,
        relatedWorkdayId: null,
      });
    }
  }

  // 5. Unknown stops (smart filter)
  const ctx: SmartFilterContext = {
    workdays: input.workdays,
    homePlace: input.homePlace,
  };
  for (const seg of stationary) {
    if (isUnknownStopReportable(seg, ctx)) {
      events.push({
        eventType: "stopped_at_unknown_location",
        ts: seg.startTs,
        lat: seg.centerLat,
        lng: seg.centerLng,
        accuracy: null,
        source: "gps",
        matchedSiteId: null,
        matchedSiteType: "unknown",
        matchedSiteName: null,
        distanceToReportedSiteM: null,
        confidence: 0.6,
        humanReadableText: `Stannade på okänd plats i ${Math.round(seg.durationMin)} min`,
        relatedTimeReportId: null,
        relatedWorkdayId: null,
      });
    }
  }

  // 6. GPS gaps (>30 min) within workday
  for (const wd of input.workdays) {
    const wdStart = new Date(wd.started_at).getTime();
    const wdEnd = wd.ended_at ? new Date(wd.ended_at).getTime() : Date.now();
    const segsInWd = input.segments.filter((s) => {
      const sStart = new Date(s.startTs).getTime();
      const sEnd = new Date(s.endTs).getTime();
      return sStart < wdEnd && sEnd > wdStart;
    });
    for (let i = 0; i < segsInWd.length - 1; i++) {
      const gap = minutesBetween(segsInWd[i].endTs, segsInWd[i + 1].startTs);
      if (gap >= 30) {
        events.push({
          eventType: "gps_gap_started",
          ts: segsInWd[i].endTs,
          lat: segsInWd[i].centerLat,
          lng: segsInWd[i].centerLng,
          accuracy: null,
          source: "gps",
          matchedSiteId: null,
          matchedSiteType: null,
          matchedSiteName: null,
          distanceToReportedSiteM: null,
          confidence: 0.8,
          humanReadableText: `GPS-lucka börjar (${Math.round(gap)} min utan signal)`,
          relatedTimeReportId: null,
          relatedWorkdayId: wd.id,
        });
        events.push({
          eventType: "gps_gap_ended",
          ts: segsInWd[i + 1].startTs,
          lat: segsInWd[i + 1].centerLat,
          lng: segsInWd[i + 1].centerLng,
          accuracy: null,
          source: "gps",
          matchedSiteId: null,
          matchedSiteType: null,
          matchedSiteName: null,
          distanceToReportedSiteM: null,
          confidence: 0.8,
          humanReadableText: `GPS-lucka slutar`,
          relatedTimeReportId: null,
          relatedWorkdayId: wd.id,
        });
      }
    }
  }

  // 7. Stale phone (same coord >2h while a timer is open)
  for (const seg of stationary) {
    if (seg.durationMin >= 120) {
      const overlapsTimer = input.entries.some((e) => {
        const eStart = new Date(e.entered_at).getTime();
        const eEnd = e.exited_at ? new Date(e.exited_at).getTime() : Date.now();
        const sStart = new Date(seg.startTs).getTime();
        const sEnd = new Date(seg.endTs).getTime();
        return sStart < eEnd && sEnd > eStart;
      });
      if (overlapsTimer && !seg.matchedPlace) {
        events.push({
          eventType: "stale_phone_detected",
          ts: seg.startTs,
          lat: seg.centerLat,
          lng: seg.centerLng,
          accuracy: null,
          source: "gps",
          matchedSiteId: null,
          matchedSiteType: null,
          matchedSiteName: null,
          distanceToReportedSiteM: null,
          confidence: 0.7,
          humanReadableText: `Telefonen står still ${Math.round(seg.durationMin)} min med öppen timer`,
          relatedTimeReportId: null,
          relatedWorkdayId: null,
        });
      }
    }
  }

  // Sort chronologically
  events.sort((a, b) => a.ts.localeCompare(b.ts));
  return events;
}

function makeWorkdayEvent(type: "workday_started" | "workday_ended", wd: WorkdayRow): DayEvent {
  const ts = type === "workday_started" ? wd.started_at : (wd.ended_at ?? wd.started_at);
  return {
    eventType: type,
    ts,
    lat: null,
    lng: null,
    accuracy: null,
    source: "workday",
    matchedSiteId: null,
    matchedSiteType: null,
    matchedSiteName: null,
    distanceToReportedSiteM: null,
    confidence: 1,
    humanReadableText: type === "workday_started"
      ? `Arbetsdag startad kl ${isoToLocalHHMM(ts)}`
      : `Arbetsdag avslutad kl ${isoToLocalHHMM(ts)}`,
    relatedTimeReportId: null,
    relatedWorkdayId: wd.id,
  };
}

function makeTimerEvent(type: "timer_started" | "timer_stopped", e: LocationEntryRow): DayEvent {
  const ts = type === "timer_started" ? e.entered_at : (e.exited_at ?? e.entered_at);
  return {
    eventType: type,
    ts,
    lat: null,
    lng: null,
    accuracy: null,
    source: "timer",
    matchedSiteId: e.booking_id ?? e.large_project_id ?? e.location_id ?? null,
    matchedSiteType: e.booking_id ? "booking" : e.large_project_id ? "project" : e.location_id ? "location" : null,
    matchedSiteName: null,
    distanceToReportedSiteM: null,
    confidence: 1,
    humanReadableText: type === "timer_started"
      ? `Timer startad kl ${isoToLocalHHMM(ts)}`
      : `Timer stoppad kl ${isoToLocalHHMM(ts)}`,
    relatedTimeReportId: null,
    relatedWorkdayId: null,
  };
}

function makeArrivalEvent(
  type: "arrived_at_known_location" | "left_known_location",
  seg: Segment,
  place: KnownPlace,
  useEnd = false,
): DayEvent {
  const ts = useEnd ? seg.endTs : seg.startTs;
  return {
    eventType: type,
    ts,
    lat: seg.centerLat,
    lng: seg.centerLng,
    accuracy: null,
    source: "gps",
    matchedSiteId: place.id,
    matchedSiteType: place.type,
    matchedSiteName: place.name,
    distanceToReportedSiteM: null,
    confidence: 0.85,
    humanReadableText: type === "arrived_at_known_location"
      ? `Anlände ${place.name} kl ${isoToLocalHHMM(ts)}`
      : `Lämnade ${place.name} kl ${isoToLocalHHMM(ts)}`,
    relatedTimeReportId: null,
    relatedWorkdayId: null,
  };
}

// Convert "YYYY-MM-DD" + "HH:MM:SS" (Europe/Stockholm) → ISO timestamptz.
// Used for synthetic timestamps when only a time-of-day is known.
export function toIsoFromLocal(date: string, time: string): string {
  // Best-effort: assume +01:00/+02:00 (CET/CEST). Use sv-SE Intl roundtrip.
  // Construct a Date in UTC then offset by Stockholm.
  // Simpler: return `${date}T${time}+01:00` — slight DST skew acceptable
  // since this is only for sort-key fallback when no GPS.
  const t = time.length === 5 ? `${time}:00` : time;
  return `${date}T${t}+01:00`;
}
