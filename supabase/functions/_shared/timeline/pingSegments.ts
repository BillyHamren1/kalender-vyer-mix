// Deno-port av src/lib/staff/pingPlaceSegments.ts
// SAMMA logik som frontend "Faktiska besök & förflyttningar" — ren motor för
// "var har personen faktiskt varit idag?". Detta är sanningskällan.
//
// MIRROR — ändra alltid båda i samma commit.
// Se mem://constraints/gps-visit-exact-ping-membership-v1.

import type { Ping, Segment, KnownPlace } from "./types.ts";
import { distanceMeters, minutesBetween } from "./geo.ts";

interface RawPing { ts: string; lat: number; lng: number; accuracy: number | null }

export interface PlaceVisit {
  placeKey: string;
  knownPlace: KnownPlace | null;
  centre: { lat: number; lng: number };
  start: string;
  end: string;
  durationMin: number;
  pingCount: number;
  /** Exakta pings som hör till vistelsen. UI får aldrig återskapa via tidsfilter. */
  pings: RawPing[];
}

export interface TravelGap {
  start: string;
  end: string;
  durationMin: number;
  fromCentre: { lat: number; lng: number };
  toCentre: { lat: number; lng: number };
}

export interface BuildOptions {
  unknownRadiusMeters?: number;
  minDurationMin?: number;
  confirmAwayPings?: number;
  maxPingGapMin?: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

const centreOf = (pings: RawPing[]) => ({
  lat: median(pings.map((p) => p.lat)),
  lng: median(pings.map((p) => p.lng)),
});

function matchKnownSite(ping: RawPing, sites: KnownPlace[]): KnownPlace | null {
  let best: { site: KnownPlace; dist: number } | null = null;
  for (const s of sites) {
    const d = distanceMeters(s.lat, s.lng, ping.lat, ping.lng);
    if (d <= s.radiusM && (!best || d < best.dist)) {
      best = { site: s, dist: d };
    }
  }
  return best?.site ?? null;
}

interface OpenSegment {
  knownSite: KnownPlace | null;
  pings: RawPing[];
  anchor: { lat: number; lng: number };
  radius: number;
}

export function buildPlaceVisits(
  rawPings: Ping[],
  knownSites: KnownPlace[],
  opts: BuildOptions = {},
): PlaceVisit[] {
  const unknownRadius = Math.max(40, opts.unknownRadiusMeters ?? 150);
  const minDuration = Math.max(0, opts.minDurationMin ?? 5);
  const confirmAway = Math.max(1, opts.confirmAwayPings ?? 2);
  const maxPingGapMs = Math.max(1, opts.maxPingGapMin ?? 20) * 60_000;

  if (rawPings.length === 0) return [];

  const sorted: RawPing[] = [...rawPings]
    .map((p) => ({ ts: p.ts, lat: p.lat, lng: p.lng, accuracy: p.accuracy }))
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const closed: OpenSegment[] = [];
  let current: OpenSegment | null = null;
  let pendingAway: RawPing[] = [];
  let unknownCounter = 0;

  const startSegment = (seedPings: RawPing[], site: KnownPlace | null) => {
    const anchor = site
      ? { lat: site.lat, lng: site.lng }
      : centreOf(seedPings);
    current = {
      knownSite: site,
      pings: [...seedPings],
      anchor,
      radius: site ? site.radiusM : unknownRadius,
    };
  };

  const closeCurrent = (absorbPendingAway = false) => {
    if (absorbPendingAway && current && pendingAway.length) {
      current.pings.push(...pendingAway);
    }
    if (current) closed.push(current);
    current = null;
    pendingAway = [];
  };

  // refreshUnknownAnchor borttagen — ankaret får inte drifta.
  // Se mem://constraints/gps-visit-exact-ping-membership-v1.

  for (const p of sorted) {
    const matchedSite = matchKnownSite(p, knownSites);

    if (!current) {
      startSegment([p], matchedSite);
      continue;
    }

    const previousPing = pendingAway[pendingAway.length - 1] ?? current.pings[current.pings.length - 1];
    const gapMs = new Date(p.ts).getTime() - new Date(previousPing.ts).getTime();
    if (gapMs > maxPingGapMs) {
      closeCurrent(true);
      startSegment([p], matchedSite);
      continue;
    }

    if (current.knownSite && matchedSite && matchedSite.id === current.knownSite.id) {
      if (pendingAway.length) {
        current.pings.push(...pendingAway);
        pendingAway = [];
      }
      current.pings.push(p);
      continue;
    }

    const distFromAnchor = distanceMeters(current.anchor.lat, current.anchor.lng, p.lat, p.lng);
    const stillAtCurrentUnknown =
      !current.knownSite && !matchedSite && distFromAnchor <= current.radius;

    if (stillAtCurrentUnknown) {
      if (pendingAway.length) {
        current.pings.push(...pendingAway);
        pendingAway = [];
      }
      current.pings.push(p);
      refreshUnknownAnchor();
      continue;
    }

    pendingAway.push(p);

    if (matchedSite && (!current.knownSite || matchedSite.id !== current.knownSite.id)) {
      closeCurrent();
      startSegment([p], matchedSite);
      continue;
    }

    const tail = pendingAway.slice(-confirmAway);
    if (tail.length >= confirmAway) {
      const tailCentre = centreOf(tail);
      const tailSpread = Math.max(
        ...tail.map((t) => distanceMeters(tailCentre.lat, tailCentre.lng, t.lat, t.lng)),
      );
      const distTailToAnchor = distanceMeters(current.anchor.lat, current.anchor.lng, tailCentre.lat, tailCentre.lng);
      if (tailSpread <= unknownRadius && distTailToAnchor > current.radius) {
        closeCurrent();
        startSegment(tail, null);
      }
    }
  }

  if (current) {
    if (pendingAway.length) (current as OpenSegment).pings.push(...pendingAway);
    closed.push(current);
    current = null;
  }

  const visits: PlaceVisit[] = closed
    .map((seg): PlaceVisit => {
      const start = seg.pings[0].ts;
      const end = seg.pings[seg.pings.length - 1].ts;
      const durationMin = minutesBetween(start, end);
      const knownPlace = seg.knownSite;
      const placeKey = knownPlace
        ? `site:${knownPlace.id}`
        : `unknown:${unknownCounter++}`;
      const centre = seg.knownSite
        ? { lat: seg.knownSite.lat, lng: seg.knownSite.lng }
        : centreOf(seg.pings);
      return {
        placeKey,
        knownPlace,
        centre,
        start,
        end,
        durationMin,
        pingCount: seg.pings.length,
      };
    })
    .filter((v) => v.durationMin >= minDuration);

  // Slå ihop angränsande visits med samma identitet
  const merged: PlaceVisit[] = [];
  for (const v of visits) {
    const last = merged[merged.length - 1];
    if (!last) { merged.push(v); continue; }

    const sameKnown = last.knownPlace && v.knownPlace && last.knownPlace.id === v.knownPlace.id;
    const sameUnknown = !last.knownPlace && !v.knownPlace &&
      distanceMeters(last.centre.lat, last.centre.lng, v.centre.lat, v.centre.lng) <= unknownRadius * 2;
    const gapMs = new Date(v.start).getTime() - new Date(last.end).getTime();
    const closeEnoughInTime = gapMs >= 0 && gapMs <= maxPingGapMs;

    if ((sameKnown || sameUnknown) && closeEnoughInTime) {
      const totalPings = last.pingCount + v.pingCount;
      const blended = sameKnown
        ? last.centre
        : {
            lat: (last.centre.lat * last.pingCount + v.centre.lat * v.pingCount) / totalPings,
            lng: (last.centre.lng * last.pingCount + v.centre.lng * v.pingCount) / totalPings,
          };
      merged[merged.length - 1] = {
        placeKey: last.placeKey,
        knownPlace: last.knownPlace,
        centre: blended,
        start: last.start,
        end: v.end,
        durationMin: minutesBetween(last.start, v.end),
        pingCount: totalPings,
      };
    } else {
      merged.push(v);
    }
  }

  return merged;
}

/** Bygg travel-gaps mellan på varandra följande visits. */
export function buildTravelGaps(visits: PlaceVisit[]): TravelGap[] {
  const sorted = [...visits].sort((a, b) => a.start.localeCompare(b.start));
  const gaps: TravelGap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const startMs = new Date(from.end).getTime();
    const endMs = new Date(to.start).getTime();
    if (endMs <= startMs) continue;
    gaps.push({
      start: from.end,
      end: to.start,
      durationMin: Math.max(0, Math.round((endMs - startMs) / 60_000)),
      fromCentre: from.centre,
      toCentre: to.centre,
    });
  }
  return gaps;
}

/**
 * Konvertera visits + travels till samma `Segment[]`-format som
 * `clusterPings + matchSegmentsToPlaces` returnerade. Tillåter
 * eventBuilder/suggestionEngine att fortsätta funka oförändrade.
 */
export function visitsToSegments(visits: PlaceVisit[], travels: TravelGap[]): Segment[] {
  const segs: Segment[] = [];

  for (const v of visits) {
    segs.push({
      startTs: v.start,
      endTs: v.end,
      centerLat: v.centre.lat,
      centerLng: v.centre.lng,
      pingCount: v.pingCount,
      durationMin: v.durationMin,
      matchedPlace: v.knownPlace,
      isStationary: true,
    });
  }
  for (const t of travels) {
    segs.push({
      startTs: t.start,
      endTs: t.end,
      centerLat: (t.fromCentre.lat + t.toCentre.lat) / 2,
      centerLng: (t.fromCentre.lng + t.toCentre.lng) / 2,
      pingCount: 0,
      durationMin: t.durationMin,
      matchedPlace: null,
      isStationary: false,
    });
  }

  return segs.sort((a, b) => a.startTs.localeCompare(b.startTs));
}
