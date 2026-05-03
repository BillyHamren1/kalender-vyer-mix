/**
 * pingPlaceSegments — ren motor för "var har personen faktiskt varit idag?".
 *
 * MIRROR — supabase/functions/_shared/timeline/pingSegments.ts måste hållas
 * i synk med denna fil. Ändra alltid båda i samma commit.
 * Se mem://constraints/gps-visit-exact-ping-membership-v1.
 *
 * UI får ALDRIG återskapa ping-medlemskap via tidsfilter — använd `visit.pings`.
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
  /**
   * Exakta pings som hör till denna vistelse. UI MÅSTE använda denna lista
   * — aldrig återskapa via tidsfilter. Se
   * mem://constraints/gps-visit-exact-ping-membership-v1.
   */
  pings: Ping[];
}

export interface BuildOptions {
  /** Radie för att räknas som "samma okänd plats" (m). Default 150. */
  unknownRadiusMeters?: number;
  /** Min varaktighet för en vistelse (min). Default 10. */
  minDurationMin?: number;
  /** Hur många "borta-pings" i rad som krävs för att godta en flytt. Default 4. */
  confirmAwayPings?: number;
  /** Max tillåtet glapp mellan två råpings i samma vistelse. Default 20 min. */
  maxPingGapMin?: number;
  /** Max tidsglapp för att slå ihop två vistelser med samma identitet. Default 15 min. */
  mergeGapMaxMin?: number;
}

/** Hård regel: vistelser kortare än så collapsas alltid. Steg 1 + 5. */
export const MIN_VISIT_DURATION_MIN = 10;
/** Travel-segment kortare än så ska aldrig surface:as. Steg 6. */
export const MIN_TRAVEL_DURATION_MIN = 5;

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
  // Steg 1: höj default-tröskeln till MIN_VISIT_DURATION_MIN (10) och clamp:a
  // alltid minst 1 min så ekosystemet inte kan smyga in mikro-vistelser.
  const minDuration = Math.max(1, opts.minDurationMin ?? MIN_VISIT_DURATION_MIN);
  // Steg 3: travel-hysteresis. Höj default till 4 så små GPS-hopp inte räcker.
  const confirmAway = Math.max(2, opts.confirmAwayPings ?? 4);
  const maxPingGapMs = Math.max(1, opts.maxPingGapMin ?? 20) * 60_000;
  // Steg 2: hur långt glapp mellan två stängda visits får överbryggas vid merge.
  const mergeGapMaxMs = Math.max(1, opts.mergeGapMaxMin ?? 15) * 60_000;

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

  const closeCurrent = (absorbPendingAway = false) => {
    if (absorbPendingAway && current && pendingAway.length) {
      current.pings.push(...pendingAway);
    }
    if (current) closed.push(current);
    current = null;
    pendingAway = [];
  };

  // refreshUnknownAnchor borttagen — ankaret får inte drifta. Två fysiskt
  // olika platser kunde annars glida ihop till ett segment.
  // Se mem://constraints/gps-visit-exact-ping-membership-v1.

  for (const p of sorted) {
    const matchedSite = matchKnownSite(p, knownSites);

    if (!current) {
      startSegment([p], matchedSite);
      continue;
    }

    const previousPing = pendingAway[pendingAway.length - 1] ?? current.pings[current.pings.length - 1];
    const gapMs = new Date(p.recorded_at).getTime() - new Date(previousPing.recorded_at).getTime();
    if (gapMs > maxPingGapMs) {
      closeCurrent(true);
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
      // ankaret uppdateras inte — håll segmentet stabilt vid initial centre.
      continue;
    }

    // Avvikelse — kandidat för platsbyte.
    pendingAway.push(p);

    // Steg 4: stabilisera känd-plats-matchning. En enstaka ping på en annan
    // känd plats räcker INTE för att kasta ett pågående segment. Kräv att
    // confirmAway pings i rad pekar på samma nya plats — annars är det troligt
    // GPS-brus / momentan radie-överlapp.
    if (matchedSite && (!current.knownSite || matchedSite.id !== current.knownSite.id)) {
      const tail = pendingAway.slice(-confirmAway);
      const allSameSite =
        tail.length >= confirmAway &&
        tail.every(t => {
          const m = matchKnownSite(t, knownSites);
          return m && m.id === matchedSite.id;
        });
      if (allSameSite) {
        closeCurrent();
        startSegment(tail, matchedSite);
      }
      continue;
    }

    // Bekräftelse 2: senaste confirmAway pings är samlade kring en NY okänd plats.
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
        pings: [...seg.pings],
      };
    })
    .filter(v => v.durationMin >= minDuration);

  // Slå ihop direkt angränsande vistelser med SAMMA stabila identitet.
  // Kända platser: samma siteId. Okända: centre inom 2× unknownRadius.
  // Men: slå aldrig ihop över ett långt pingglapp — då vet vi inte att
  // personen faktiskt stannade kvar hela tiden.
  const merged: PlaceVisit[] = [];
  for (const v of visits) {
    const last = merged[merged.length - 1];
    if (!last) { merged.push(v); continue; }

    const sameKnown = last.knownSite && v.knownSite && last.knownSite.id === v.knownSite.id;
    const sameUnknown = !last.knownSite && !v.knownSite &&
      haversineMeters(last.centre, v.centre) <= unknownRadius * 2;
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
        knownSite: last.knownSite,
        centre: blended,
        start: last.start,
        end: v.end,
        durationMin: minutesBetween(last.start, v.end),
        pingCount: totalPings,
        pings: [...last.pings, ...v.pings],
      };
    } else {
      merged.push(v);
    }
  }

  return merged;
}

/**
 * Slå upp vilken vistelse som omfattar `iso`.
 *   1. Om `iso` ligger mellan en vistelses start och end → returnera den.
 *   2. Annars: närmsta vistelse vars start/end är inom `toleranceMin` minuter
 *      från `iso` (för att täcka det lilla glappet mellan stop och faktisk
 *      lämnings-ping). Default 15 min för att matcha gamla GeoAtTime-fönstret.
 *   3. Annars null.
 */
export function resolvePlaceAt(
  visits: PlaceVisit[],
  iso: string | null,
  toleranceMin = 15,
): PlaceVisit | null {
  if (!iso || visits.length === 0) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;

  // 1. Inuti en vistelse
  for (const v of visits) {
    const s = new Date(v.start).getTime();
    const e = new Date(v.end).getTime();
    if (t >= s && t <= e) return v;
  }

  // 2. Närmsta inom toleransen
  const tolMs = toleranceMin * 60_000;
  let best: { v: PlaceVisit; dist: number } | null = null;
  for (const v of visits) {
    const s = new Date(v.start).getTime();
    const e = new Date(v.end).getTime();
    const dist = t < s ? s - t : t - e;
    if (dist <= tolMs && (!best || dist < best.dist)) {
      best = { v, dist };
    }
  }
  return best?.v ?? null;
}

// ─── Förflyttningar (travel gaps) ─────────────────────────────────────────

/**
 * En förflyttning mellan två vistelser. Bygger på faktiska råpings i gapet,
 * inte på `travel_time_logs.from_address` (som ofta visar startaddress för
 * en gammal restimer i stället för var personen faktiskt var).
 */
export interface TravelGap {
  /** Stabil identitet `travel:<index>` */
  key: string;
  /** Starttid = end på föregående vistelse */
  start: string;
  /** Sluttid = start på nästa vistelse */
  end: string;
  durationMin: number;
  /** Föregående vistelse (varifrån). */
  from: PlaceVisit;
  /** Nästa vistelse (vart). */
  to: PlaceVisit;
  /** Råpings inom förflyttningens fönster (kan vara tom om GPS tystnade). */
  pings: Ping[];
}

/** Vad var personen vid en given tidpunkt — vistelse, resa eller okänt? */
export type DayTimelineHit =
  | { kind: 'visit'; visit: PlaceVisit }
  | { kind: 'travel'; travel: TravelGap }
  | { kind: 'unknown' };

export interface DayTimeline {
  visits: PlaceVisit[];
  travels: TravelGap[];
  /** Strikt resolver: returnerar 'visit' / 'travel' / 'unknown'. */
  resolveAt: (iso: string | null) => DayTimelineHit;
}

/**
 * Bygger en strikt dagstidlinje av vistelser + förflyttningar.
 *
 * Skillnad mot `resolvePlaceAt`:
 *   - INGEN tolerans-fallback. En tidpunkt mellan två vistelser anses vara
 *     en förflyttning, inte "närmaste vistelse".
 *   - En tidpunkt utanför ping-fönstret är `unknown`, inte en gissning.
 *
 * Detta är vad UI:t ska använda för att aldrig påstå att personen var på
 * Westers innan första riktiga ping inom Westers radie.
 */
export function buildDayTimeline(
  rawPings: Ping[],
  visits: PlaceVisit[],
): DayTimeline {
  const travels: TravelGap[] = [];
  const sortedVisits = [...visits].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const sortedPings = [...rawPings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  for (let i = 0; i < sortedVisits.length - 1; i++) {
    const from = sortedVisits[i];
    const to = sortedVisits[i + 1];
    const startMs = new Date(from.end).getTime();
    const endMs = new Date(to.start).getTime();
    if (endMs <= startMs) continue;
    const pings = sortedPings.filter(p => {
      const t = new Date(p.recorded_at).getTime();
      return t > startMs && t < endMs;
    });
    travels.push({
      key: `travel:${i}`,
      start: from.end,
      end: to.start,
      durationMin: Math.max(0, Math.round((endMs - startMs) / 60_000)),
      from,
      to,
      pings,
    });
  }

  // Liten tolerans åt båda håll. Bakgrund:
  //  - `time_reports.start_time` rundas till hela sekunder vid backfill.
  //  - En timer som startas "just innan" personen passerade geofence-radien
  //    på t.ex. Westers låg historiskt strax före första in-radius-pingen.
  //  - Vi vill INTE snappa över hela resor — därför är toleransen 90s, inte 15 min.
  const TOL_MS = 90_000;

  const resolveAt = (iso: string | null): DayTimelineHit => {
    if (!iso) return { kind: 'unknown' };
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return { kind: 'unknown' };

    for (const v of sortedVisits) {
      const s = new Date(v.start).getTime();
      const e = new Date(v.end).getTime();
      if (t >= s - TOL_MS && t <= e + TOL_MS) return { kind: 'visit', visit: v };
    }
    for (const tr of travels) {
      const s = new Date(tr.start).getTime();
      const e = new Date(tr.end).getTime();
      if (t > s && t < e) return { kind: 'travel', travel: tr };
    }
    return { kind: 'unknown' };
  };

  return { visits: sortedVisits, travels, resolveAt };
}
