/**
 * UI-only segmentation av råa GPS-pings för satellitkartan.
 *
 * INGEN dedup. INGEN borttagning av rader. Alla pings skickas tillbaka
 * i exakt en segment-grupp (movement eller stay). Linjen ritas genom
 * ALLA pings — vi väljer bara vilka som FÅR EN LABEL.
 *
 * Regler:
 *  - Walk pings i tidsordning. Bygg ett pågående "stay-candidate" så länge
 *    nya pings ligger inom `stayRadiusMeters` från klustrets centroid.
 *  - När en ping bryter radien:
 *      • Om candidate-spannet >= `minStayMs` → emit STAY-segment.
 *      • Annars → emit MOVE-segment med dessa pings.
 *  - Sista gruppen flushas på samma sätt.
 *  - I MOVE-segment markeras "label-pings" var `labelEveryMs` (default 5 min)
 *    räknat från segmentets start. Första och sista pingen får alltid label.
 *
 * Pure. Ingen DB, ingen React.
 */
export interface SegInputPing {
  id: string;
  recorded_at: string;
  lat: number;
  lng: number;
}

export type PingSegment<T extends SegInputPing> =
  | {
      kind: 'move';
      index: number;
      colorIndex: number;
      startIso: string;
      endIso: string;
      durationMs: number;
      pings: T[];
      /** Subset av pings (samma referenser) som ska visa tidsetikett. */
      labelPings: T[];
    }
  | {
      kind: 'stay';
      index: number;
      colorIndex: number;
      startIso: string;
      endIso: string;
      durationMs: number;
      lat: number;
      lng: number;
      pings: T[];
    };

export interface SegmentOptions {
  /** Max avstånd från centroid för att räknas som "samma plats". Default 50 m. */
  stayRadiusMeters?: number;
  /** Minst hur länge i samma plats för att bli STAY. Default 5 min. */
  minStayMs?: number;
  /** Etikettintervall inom move-segment. Default 5 min. */
  labelEveryMs?: number;
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pickMoveLabels<T extends SegInputPing>(pings: T[], everyMs: number): T[] {
  if (!pings.length) return [];
  // En label per N-minuters-bucket (default 5 min) på vägg-klockan.
  // Inga "alltid första/sista" — annars klumpar labels ihop sig vid stays
  // och korta segment och vi får inflation av tidsstämplar.
  const seen = new Set<number>();
  const out: T[] = [];
  for (const p of pings) {
    const t = new Date(p.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    const bucket = Math.floor(t / everyMs);
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    out.push(p);
  }
  return out;
}

export function segmentPingsForDisplay<T extends SegInputPing>(
  pings: T[],
  opts: SegmentOptions = {},
): PingSegment<T>[] {
  const radius = opts.stayRadiusMeters ?? 50;
  const minStay = opts.minStayMs ?? 5 * 60 * 1000;
  const labelEvery = opts.labelEveryMs ?? 5 * 60 * 1000;
  if (!pings.length) return [];

  const sorted = [...pings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

  // Steg 1: dela in i geo-grupper (consecutive pings inom radie från centroid).
  const groups: T[][] = [];
  let current: T[] = [sorted[0]];
  let sumLat = sorted[0].lat;
  let sumLng = sorted[0].lng;
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const centroid = { lat: sumLat / current.length, lng: sumLng / current.length };
    if (haversineMeters(centroid, p) <= radius) {
      current.push(p);
      sumLat += p.lat;
      sumLng += p.lng;
    } else {
      groups.push(current);
      current = [p];
      sumLat = p.lat;
      sumLng = p.lng;
    }
  }
  groups.push(current);

  // Steg 2: klassa varje grupp som stay (span >= minStay & >=2 pings) eller move.
  // Konsekutiva move-grupper slås ihop till ett move-segment.
  type Raw = { kind: 'move' | 'stay'; pings: T[] };
  const raw: Raw[] = [];
  for (const g of groups) {
    const start = new Date(g[0].recorded_at).getTime();
    const end = new Date(g[g.length - 1].recorded_at).getTime();
    const span = end - start;
    const isStay = g.length >= 2 && span >= minStay;
    if (isStay) {
      raw.push({ kind: 'stay', pings: g });
    } else {
      const tail = raw[raw.length - 1];
      if (tail && tail.kind === 'move') {
        tail.pings.push(...g);
      } else {
        raw.push({ kind: 'move', pings: [...g] });
      }
    }
  }

  // Steg 3: bygg PingSegment med color index. moves får en EGEN räknare
  // (trip-ordinal) så "resa 1" alltid är grön, "resa 2" röd, osv — oberoende
  // av hur många stays som ligger emellan.
  const out: PingSegment<T>[] = [];
  let moveCounter = 0;
  raw.forEach((r, i) => {
    const startIso = r.pings[0].recorded_at;
    const endIso = r.pings[r.pings.length - 1].recorded_at;
    const durationMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (r.kind === 'stay') {
      const cLat = r.pings.reduce((s, p) => s + p.lat, 0) / r.pings.length;
      const cLng = r.pings.reduce((s, p) => s + p.lng, 0) / r.pings.length;
      out.push({
        kind: 'stay',
        index: i,
        colorIndex: i,
        startIso,
        endIso,
        durationMs,
        lat: cLat,
        lng: cLng,
        pings: r.pings,
      });
    } else {
      out.push({
        kind: 'move',
        index: i,
        colorIndex: moveCounter++,
        startIso,
        endIso,
        durationMs,
        pings: r.pings,
        labelPings: pickMoveLabels(r.pings, labelEvery),
      });
    }
  });
  return out;
}

/**
 * Färgpalett för segment. Cyklar om vid behov. Skild från staff-färger;
 * detta är per-segment per dag. Ordningen styr resa-färgerna:
 * resa 1 = grön, resa 2 = röd, resa 3 = lila, resa 4 = blå, osv.
 */
export const SEGMENT_PALETTE: ReadonlyArray<{ move: string; stay: string }> = [
  { move: '#22c55e', stay: '#16a34a' }, // grön — resa 1
  { move: '#ef4444', stay: '#dc2626' }, // röd — resa 2
  { move: '#a855f7', stay: '#7c3aed' }, // lila — resa 3
  { move: '#3b82f6', stay: '#2563eb' }, // blå — resa 4
  { move: '#f97316', stay: '#ea580c' }, // orange — resa 5
  { move: '#06b6d4', stay: '#0891b2' }, // cyan — resa 6
  { move: '#ec4899', stay: '#db2777' }, // rosa — resa 7
  { move: '#eab308', stay: '#ca8a04' }, // gul — resa 8
];

export function colorForSegment(colorIndex: number, kind: 'move' | 'stay'): string {
  const pair = SEGMENT_PALETTE[colorIndex % SEGMENT_PALETTE.length];
  return kind === 'move' ? pair.move : pair.stay;
}
