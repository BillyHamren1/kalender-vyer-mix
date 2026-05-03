/**
 * pingPlaceSegments — ren motor för "var har personen faktiskt varit idag?".
 *
 * Tar in:
 *   - råa GPS-pings (oavsett ordning)
 *   - kända arbetsplatser (organization_locations + ev. radie)
 *
 * Returnerar kronologiska "vistelser" där varje vistelse har:
 *   - start  = första ping på platsen   (IN)
 *   - end    = sista ping på platsen   (UT)
 *   - en stabil platsidentitet         (siteId om känd, annars cluster-ankaret)
 *   - antal pings + representativ koordinat
 *
 * Designprinciper:
 *   1. Råpingen är sanningen.
 *   2. Plats avgörs FÖRE klustring — inte i efterhand via reverse geocode.
 *   3. Samma fysiska plats ska aldrig kunna splittras p.g.a. att två pings
 *      råkar hamna i olika koordinatceller. Vi använder en växande cluster-
 *      ankarlogik (samma plats = inom radie från nuvarande ankare).
 *   4. Mapbox-text används aldrig som identitet — bara som label.
 */
import { haversineMeters, type Ping } from './movementDetection';

export interface KnownSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface PlaceVisit {
  /** Stabil identitet. `site:<id>` för känd plats, annars `unknown:<index>`. */
  placeKey: string;
  /** Den matchade kända platsen, om någon. */
  knownSite: { id: string; name: string } | null;
  /** Representativ koordinat för rendering / reverse-geocode. */
  centre: { lat: number; lng: number };
  /** ISO för första pingen på platsen — IN. */
  start: string;
  /** ISO för sista pingen på platsen — UT. */
  end: string;
  durationMin: number;
  pingCount: number;
}

export interface BuildOptions {
  /** Radie för att räknas som "samma okänd plats" (m). Default 150. */
  unknownRadiusMeters?: number;
  /** Min varaktighet för en vistelse (min). Default 5. */
  minDurationMin?: number;
  /** Hur många "borta-pings" i rad som krävs för att godta en flytt. Default 2. */
  confirmAwayPings?: number;
}

const minutesBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

const centreOf = (pings: Ping[]) => ({
  lat: median(pings.map(p => p.lat)),
  lng: median(pings.map(p => p.lng)),
});

/** Närmaste kända plats inom dess egen radie. */
function matchKnownSite(ping: Ping, sites: KnownSite[]): KnownSite | null {
  let best: { site: KnownSite; dist: number } | null = null;
  for (const s of sites) {
    const d = haversineMeters(
      { lat: s.lat, lng: s.lng },
      { lat: ping.lat, lng: ping.lng },
    );
    if (d <= s.radiusMeters && (!best || d < best.dist)) {
      best = { site: s, dist: d };
    }
  }
  return best?.site ?? null;
}

interface OpenSegment {
  knownSite: KnownSite | null;
  pings: Ping[];
  anchor: { lat: number; lng: number };
  /** Radie för "är vi kvar här?". Site-radius för känd, annars unknownRadius. */
  radius: number;
}

export function buildPlaceVisits(
  rawPings: Ping[],
  knownSites: KnownSite[],
  opts: BuildOptions = {},
): PlaceVisit[] {
  const unknownRadius = Math.max(40, opts.unknownRadiusMeters ?? 150);
  const minDuration = Math.max(0, opts.minDurationMin ?? 5);
  const confirmAway = Math.max(1, opts.confirmAwayPings ?? 2);

  if (rawPings.length === 0) return [];

  const sorted = [...rawPings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const closed: OpenSegment[] = [];
  let current: OpenSegment | null = null;
  let pendingAway: Ping[] = [];
  let unknownCounter = 0;

  const startSegment = (seedPings: Ping[], site: KnownSite | null) => {
    const anchor = site
      ? { lat: site.lat, lng: site.lng }
      : centreOf(seedPings);
    current = {
      knownSite: site,
      pings: [...seedPings],
      anchor,
      radius: site ? site.radiusMeters : unknownRadius,
    };
  };

  const closeCurrent = () => {
    if (current) closed.push(current);
    current = null;
    pendingAway = [];
  };

  const refreshUnknownAnchor = () => {
    if (!current || current.knownSite) return;
    const tail = current.pings.slice(-10);
    current.anchor = centreOf(tail);
  };

  for (const p of sorted) {
    const matchedSite = matchKnownSite(p, knownSites);

    if (!current) {
      startSegment([p], matchedSite);
      continue;
    }

    // Snabbväg 1: vi är på en känd plats och pingen matchar samma plats.
    if (current.knownSite && matchedSite && matchedSite.id === current.knownSite.id) {
      if (pendingAway.length) {
        current.pings.push(...pendingAway);
        pendingAway = [];
      }
      current.pings.push(p);
      continue;
    }

    // Snabbväg 2: vi var på okänd plats och pingen är inom anchor-radien.
    const distFromAnchor = haversineMeters(current.anchor, { lat: p.lat, lng: p.lng });
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

    // Avvikelse — kandidat för platsbyte.
    pendingAway.push(p);

    // Bekräftelse 1: pingen matchar en KÄND plats som inte är vår nuvarande.
    if (matchedSite && (!current.knownSite || matchedSite.id !== current.knownSite.id)) {
      // Känd plats är alltid stark sanning. Kräv bara confirmAway om vi just
      // hoppade ut — men en känd plats räcker att se en gång.
      closeCurrent();
      startSegment([p], matchedSite);
      continue;
    }

    // Bekräftelse 2: senaste confirmAway pings är samlade kring en NY plats.
    const tail = pendingAway.slice(-confirmAway);
    if (tail.length >= confirmAway) {
      const tailCentre = centreOf(tail);
      const tailSpread = Math.max(
        ...tail.map(t => haversineMeters(tailCentre, { lat: t.lat, lng: t.lng })),
      );
      // Tail ska vara samlad och faktiskt långt från nuvarande ankare.
      const distTailToAnchor = haversineMeters(current.anchor, tailCentre);
      if (tailSpread <= unknownRadius && distTailToAnchor > current.radius) {
        closeCurrent();
        startSegment(tail, null);
      }
    }
  }

  // Hängande pendingAway i slutet hör logiskt till sista vistelsen om de inte
  // hann bekräftas på ny plats — annars hade vi redan stängt och öppnat ny.
  if (current) {
    if (pendingAway.length) current.pings.push(...pendingAway);
    closed.push(current);
    current = null;
  }

  // Bygg PlaceVisit av varje stängt segment.
  const visits: PlaceVisit[] = closed
    .map((seg): PlaceVisit => {
      const start = seg.pings[0].recorded_at;
      const end = seg.pings[seg.pings.length - 1].recorded_at;
      const durationMin = minutesBetween(start, end);
      const knownSite = seg.knownSite
        ? { id: seg.knownSite.id, name: seg.knownSite.name }
        : null;
      const placeKey = knownSite
        ? `site:${knownSite.id}`
        : `unknown:${unknownCounter++}`;
      const centre = seg.knownSite
        ? { lat: seg.knownSite.lat, lng: seg.knownSite.lng }
        : centreOf(seg.pings);
      return {
        placeKey,
        knownSite,
        centre,
        start,
        end,
        durationMin,
        pingCount: seg.pings.length,
      };
    })
    .filter(v => v.durationMin >= minDuration);

  // Slå ihop direkt angränsande vistelser med SAMMA stabila identitet.
  // Kända platser: samma siteId. Okända: centre inom 2× unknownRadius.
  const merged: PlaceVisit[] = [];
  for (const v of visits) {
    const last = merged[merged.length - 1];
    if (!last) { merged.push(v); continue; }

    const sameKnown = last.knownSite && v.knownSite && last.knownSite.id === v.knownSite.id;
    const sameUnknown = !last.knownSite && !v.knownSite &&
      haversineMeters(last.centre, v.centre) <= unknownRadius * 2;

    if (sameKnown || sameUnknown) {
      const totalPings = last.pingCount + v.pingCount;
      const blended = sameKnown
        ? last.centre
        : {
            lat: (last.centre.lat * last.pingCount + v.centre.lat * v.pingCount) / totalPings,
            lng: (last.centre.lng * last.pingCount + v.centre.lng * v.pingCount) / totalPings,
          };
      merged[merged.length - 1] = {
        placeKey: last.placeKey,
        knownSite: last.knownSite,
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
