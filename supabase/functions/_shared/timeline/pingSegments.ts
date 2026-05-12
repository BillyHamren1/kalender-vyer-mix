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
  /** Max tidsglapp för att slå ihop två visits med samma identitet. Default 15 min. */
  mergeGapMaxMin?: number;
}

/** Hård regel: vistelser kortare än så collapsas alltid. */
export const MIN_VISIT_DURATION_MIN = 10;
/** Travel-segment kortare än så surface:as aldrig. */
export const MIN_TRAVEL_DURATION_MIN = 5;

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

/**
 * Tolerans utöver platsens egen radie (meter). Speglar
 * src/lib/staff/pingPlaceSegments.ts → KNOWN_SITE_TOLERANCE_METERS.
 * GPS-noise gör att en stationär person nära ett känt projekt/lager ofta
 * landar 50–150 m utanför geofencen — acceptera som matchning istället för
 * att klassa som okänd plats.
 */
export const KNOWN_SITE_TOLERANCE_METERS = 150;

function matchKnownSite(ping: RawPing, sites: KnownPlace[]): KnownPlace | null {
  let best: { site: KnownPlace; dist: number } | null = null;
  for (const s of sites) {
    const d = distanceMeters(s.lat, s.lng, ping.lat, ping.lng);
    if (d <= s.radiusM + KNOWN_SITE_TOLERANCE_METERS && (!best || d < best.dist)) {
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
  const minDuration = Math.max(1, opts.minDurationMin ?? MIN_VISIT_DURATION_MIN);
  const confirmAway = Math.max(2, opts.confirmAwayPings ?? 4);
  const maxPingGapMs = Math.max(1, opts.maxPingGapMin ?? 20) * 60_000;
  const mergeGapMaxMs = Math.max(1, opts.mergeGapMaxMin ?? 15) * 60_000;

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
      // ankaret uppdateras inte — håll segmentet stabilt.
      continue;
    }

    pendingAway.push(p);

    // Stabilisera känd-plats-matchning: kräv confirmAway pings i rad mot
    // SAMMA nya plats — annars är det troligt brus / radie-överlapp.
    if (matchedSite && (!current.knownSite || matchedSite.id !== current.knownSite.id)) {
      const tail = pendingAway.slice(-confirmAway);
      const allSameSite =
        tail.length >= confirmAway &&
        tail.every((t) => {
          const m = matchKnownSite(t, knownSites);
          return m && m.id === matchedSite.id;
        });
      if (allSameSite) {
        closeCurrent();
        startSegment(tail, matchedSite);
      }
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

  // Bygg PlaceVisit av varje stängt segment. Filtrera INTE på minDuration här
  // — vi behöver behålla mikro-vistelser så att merge-passet kan absorbera dem.
  const rawVisits: PlaceVisit[] = closed.map((seg): PlaceVisit => {
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
      pings: [...seg.pings],
    };
  });

  const combine = (a: PlaceVisit, b: PlaceVisit): PlaceVisit => {
    const totalPings = a.pingCount + b.pingCount;
    const blended = a.knownPlace
      ? a.centre
      : {
          lat: (a.centre.lat * a.pingCount + b.centre.lat * b.pingCount) / totalPings,
          lng: (a.centre.lng * a.pingCount + b.centre.lng * b.pingCount) / totalPings,
        };
    const start = a.start < b.start ? a.start : b.start;
    const end = a.end > b.end ? a.end : b.end;
    const allPings = [...a.pings, ...b.pings].sort(
      (x, y) => new Date(x.ts).getTime() - new Date(y.ts).getTime(),
    );
    return {
      placeKey: a.placeKey,
      knownPlace: a.knownPlace,
      centre: blended,
      start,
      end,
      durationMin: minutesBetween(start, end),
      pingCount: totalPings,
      pings: allPings,
    };
  };

  const samePlace = (a: PlaceVisit, b: PlaceVisit): boolean => {
    if (a.knownPlace && b.knownPlace) return a.knownPlace.id === b.knownPlace.id;
    if (!a.knownPlace && !b.knownPlace) {
      return distanceMeters(a.centre.lat, a.centre.lng, b.centre.lat, b.centre.lng) <= unknownRadius * 2;
    }
    return false;
  };

  let working = rawVisits;
  for (let pass = 0; pass < 5; pass++) {
    const before = working.length;

    const adjacent: PlaceVisit[] = [];
    for (const v of working) {
      const last = adjacent[adjacent.length - 1];
      if (!last) { adjacent.push(v); continue; }
      const gapMs = new Date(v.start).getTime() - new Date(last.end).getTime();
      if (samePlace(last, v) && gapMs >= 0 && gapMs <= mergeGapMaxMs) {
        adjacent[adjacent.length - 1] = combine(last, v);
      } else {
        adjacent.push(v);
      }
    }

    const sandwiched: PlaceVisit[] = [];
    for (let i = 0; i < adjacent.length; i++) {
      const v = adjacent[i];
      const prev = sandwiched[sandwiched.length - 1];
      const next = adjacent[i + 1];
      if (
        prev && next &&
        v.durationMin < MIN_VISIT_DURATION_MIN &&
        samePlace(prev, next)
      ) {
        const gapToNext = new Date(next.start).getTime() - new Date(v.end).getTime();
        if (gapToNext <= mergeGapMaxMs) {
          const combined = combine(combine(prev, v), next);
          sandwiched[sandwiched.length - 1] = { ...combined, placeKey: prev.placeKey, knownPlace: prev.knownPlace, centre: prev.centre };
          i++;
          continue;
        }
      }
      sandwiched.push(v);
    }

    working = sandwiched;
    if (working.length === before) break;
  }

  const filtered: PlaceVisit[] = [];
  working.forEach((v, idx) => {
    const isEdge = idx === 0 || idx === working.length - 1;
    const meetsMin = v.durationMin >= Math.max(minDuration, MIN_VISIT_DURATION_MIN);
    if (meetsMin || isEdge) filtered.push(v);
  });

  const finalVisits: PlaceVisit[] = [];
  for (const v of filtered) {
    const last = finalVisits[finalVisits.length - 1];
    const gapMs = last ? new Date(v.start).getTime() - new Date(last.end).getTime() : Infinity;
    if (last && samePlace(last, v) && gapMs >= 0 && gapMs <= maxPingGapMs) {
      finalVisits[finalVisits.length - 1] = combine(last, v);
    } else {
      finalVisits.push(v);
    }
  }

  return finalVisits;
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
    const durationMin = Math.max(0, Math.round((endMs - startMs) / 60_000));
    if (durationMin < MIN_TRAVEL_DURATION_MIN) continue;
    gaps.push({
      start: from.end,
      end: to.start,
      durationMin,
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
