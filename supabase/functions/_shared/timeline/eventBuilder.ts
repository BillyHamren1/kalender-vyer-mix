// Build chronological DayEvent[] for v2:
// EN rad per stopp (stay_segment) och EN rad per resa (travel_segment) — aldrig blandat.
// Workday/timer-händelser läggs in som markörer ovanpå segmenten.

import type {
  DayEvent,
  KnownPlace,
  LocationEntryRow,
  Segment,
  TimeReportRow,
  WorkdayRow,
} from "./types.ts";
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

interface ReportedSiteFallback {
  name: string;
  type: "booking" | "project" | "location";
  id: string;
  startMs: number;
  endMs: number;
}

export function buildEvents(input: BuildEventsInput): DayEvent[] {
  const events: DayEvent[] = [];

  // Bygg fallback-lista över rapporterade platser (även utan koordinater) för att
  // kunna namnge ett stopp som inte gick att GPS-matcha.
  const reportedFallbacks: ReportedSiteFallback[] = [];
  for (const r of input.reports) {
    if (!r.start_time || !r.end_time) continue;
    const place = input.reportedPlaceForReport(r);
    // Om vi har koordinater så hanteras matchning av matcher; här bryr vi oss
    // bara om de namngivna platser som saknar geocod (annars riskerar vi
    // dubbelnamning).
    if (place) continue;
    const name = pickReportName(r);
    if (!name) continue;
    reportedFallbacks.push({
      name,
      type: r.large_project_id ? "project" : r.booking_id ? "booking" : "location",
      id: (r.large_project_id ?? r.booking_id ?? r.location_id ?? r.id) as string,
      startMs: new Date(toIsoFromLocal(r.report_date, r.start_time)).getTime(),
      endMs: new Date(toIsoFromLocal(r.report_date, r.end_time)).getTime(),
    });
  }

  // 1. Workday-markörer
  for (const wd of input.workdays) {
    events.push(makeWorkdayEvent("workday_started", wd));
    if (wd.ended_at) events.push(makeWorkdayEvent("workday_ended", wd));
  }

  // 2. Timer-markörer
  for (const e of input.entries) {
    events.push(makeTimerEvent("timer_started", e));
    if (e.exited_at) events.push(makeTimerEvent("timer_stopped", e));
  }

  // 3. Sammanhängande stay/travel-rader
  for (const seg of input.segments) {
    if (seg.isStationary) {
      const matched = seg.matchedPlace;
      const fallback = matched ? null : findReportedFallback(seg, reportedFallbacks);
      const name =
        matched?.name ??
        fallback?.name ??
        (isLikelyHome(seg, input.homePlace) ? "Hem" : null);
      const siteType =
        matched?.type ??
        fallback?.type ??
        (isLikelyHome(seg, input.homePlace) ? "home" : "unknown");
      const planned = !!matched || !!fallback;
      const dur = Math.round(seg.durationMin);
      const text = name
        ? planned
          ? `Stannade – ${name} (${formatDur(dur)})`
          : `Stannade på ${name} (${formatDur(dur)}) · Ej planerat`
        : `Stannade på okänd plats (${formatDur(dur)}) · Ej planerat`;

      events.push({
        eventType: "stay_segment",
        ts: seg.startTs,
        endTs: seg.endTs,
        durationMin: dur,
        lat: seg.centerLat,
        lng: seg.centerLng,
        accuracy: null,
        source: "gps",
        matchedSiteId: matched?.id ?? fallback?.id ?? null,
        matchedSiteType: siteType as DayEvent["matchedSiteType"],
        matchedSiteName: name,
        distanceToReportedSiteM: null,
        confidence: matched ? 0.9 : fallback ? 0.75 : 0.6,
        humanReadableText: `${isoToLocalHHMM(seg.startTs)}–${isoToLocalHHMM(seg.endTs)} · ${text}`,
        relatedTimeReportId: null,
        relatedWorkdayId: null,
        planned,
      });
    } else {
      // Rörelse mellan två kända/okända stopp = resa
      const dur = Math.round(seg.durationMin);
      if (dur < 1) continue;
      events.push({
        eventType: "travel_segment",
        ts: seg.startTs,
        endTs: seg.endTs,
        durationMin: dur,
        lat: seg.centerLat,
        lng: seg.centerLng,
        accuracy: null,
        source: "gps",
        matchedSiteId: null,
        matchedSiteType: null,
        matchedSiteName: null,
        distanceToReportedSiteM: null,
        confidence: 0.7,
        humanReadableText: `${isoToLocalHHMM(seg.startTs)}–${isoToLocalHHMM(seg.endTs)} · Resa (${formatDur(dur)})`,
        relatedTimeReportId: null,
        relatedWorkdayId: null,
        planned: false,
      });
    }
  }

  // 4. GPS-luckor (>30 min utan ping under dagen)
  const sortedSegs = [...input.segments].sort((a, b) => a.startTs.localeCompare(b.startTs));
  for (let i = 0; i < sortedSegs.length - 1; i++) {
    const gap = minutesBetween(sortedSegs[i].endTs, sortedSegs[i + 1].startTs);
    if (gap >= 30) {
      events.push({
        eventType: "gps_gap_started",
        ts: sortedSegs[i].endTs,
        endTs: sortedSegs[i + 1].startTs,
        durationMin: Math.round(gap),
        lat: null, lng: null, accuracy: null,
        source: "gps",
        matchedSiteId: null, matchedSiteType: null, matchedSiteName: null,
        distanceToReportedSiteM: null,
        confidence: 0.8,
        humanReadableText: `GPS-lucka ${Math.round(gap)} min`,
        relatedTimeReportId: null, relatedWorkdayId: null,
        planned: false,
      });
    }
  }

  events.sort((a, b) => a.ts.localeCompare(b.ts));
  return events;
}

function pickReportName(r: TimeReportRow): string | null {
  // booking_id/location_id är text/uuid utan namn här — vi har bara IDn att gå på.
  // För visning räcker en generisk etikett om vi inte vet namnet.
  if (r.large_project_id) return "Projektplats";
  if (r.booking_id) return "Bokningsplats";
  if (r.location_id) return "Platsbesök";
  return null;
}

function findReportedFallback(seg: Segment, list: ReportedSiteFallback[]): ReportedSiteFallback | null {
  const sStart = new Date(seg.startTs).getTime();
  const sEnd = new Date(seg.endTs).getTime();
  let best: ReportedSiteFallback | null = null;
  let bestOverlap = 0;
  for (const f of list) {
    const overlap = Math.max(0, Math.min(sEnd, f.endMs) - Math.max(sStart, f.startMs));
    if (overlap > bestOverlap) { bestOverlap = overlap; best = f; }
  }
  // Kräv minst 10 min överlapp för att namnge stoppet med rapport-fallback.
  return bestOverlap >= 10 * 60 * 1000 ? best : null;
}

function isLikelyHome(seg: Segment, home: KnownPlace | null): boolean {
  if (!home) return false;
  const dLat = seg.centerLat - home.lat;
  const dLng = seg.centerLng - home.lng;
  // ~200m grov approximation
  return Math.hypot(dLat, dLng) * 111000 < 250;
}

function formatDur(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function makeWorkdayEvent(type: "workday_started" | "workday_ended", wd: WorkdayRow): DayEvent {
  const ts = type === "workday_started" ? wd.started_at : (wd.ended_at ?? wd.started_at);
  return {
    eventType: type,
    ts, endTs: null, durationMin: null,
    lat: null, lng: null, accuracy: null,
    source: "workday",
    matchedSiteId: null, matchedSiteType: null, matchedSiteName: null,
    distanceToReportedSiteM: null,
    confidence: 1,
    humanReadableText: type === "workday_started"
      ? `Arbetsdag startad kl ${isoToLocalHHMM(ts)}`
      : `Arbetsdag avslutad kl ${isoToLocalHHMM(ts)}`,
    relatedTimeReportId: null,
    relatedWorkdayId: wd.id,
    planned: false,
  };
}

function makeTimerEvent(type: "timer_started" | "timer_stopped", e: LocationEntryRow): DayEvent {
  const ts = type === "timer_started" ? e.entered_at : (e.exited_at ?? e.entered_at);
  return {
    eventType: type,
    ts, endTs: null, durationMin: null,
    lat: null, lng: null, accuracy: null,
    source: "timer",
    matchedSiteId: e.booking_id ?? e.large_project_id ?? e.location_id ?? null,
    matchedSiteType: e.booking_id ? "booking" : e.large_project_id ? "project" : e.location_id ? "location" : null,
    matchedSiteName: null,
    distanceToReportedSiteM: null,
    confidence: 1,
    humanReadableText: type === "timer_started"
      ? `Timer startad kl ${isoToLocalHHMM(ts)}`
      : `Timer stoppad kl ${isoToLocalHHMM(ts)}`,
    relatedTimeReportId: null, relatedWorkdayId: null,
    planned: false,
  };
}

// Convert "YYYY-MM-DD" + "HH:MM:SS" (Europe/Stockholm) → ISO timestamptz.
export function toIsoFromLocal(date: string, time: string): string {
  const t = time.length === 5 ? `${time}:00` : time;
  return `${date}T${t}+01:00`;
}
