/**
 * Stable Location Clusters (Time Engine — Lager 2.2)
 *
 * Pure helper. Bygger stabila platskluster från
 * DayEvidence.internal.locationLogicPings.
 *
 * Regler:
 *  - Konsumerar ENDAST locationLogicPings (Lager 1).
 *  - Ignorerar pings där ignoredForLocationLogic=true eller hardRejected=true
 *    (defensivt — Lager 1 ska redan ha filtrerat dem).
 *  - Använder INTE rå staff_location_history.
 *  - Använder INTE gamla buildGpsDayTimeline accuracy-filter.
 *  - Låg accuracy kastas inte; den ger lägre confidenceWeight.
 *  - Centroid är robust (median/trimmed) — outliers drar inte centroid hårt.
 *  - Skapar ingen report/time/display-data.
 */

import type { NormalizedGpsPing } from './normalizeGpsEvidence.ts';

// ── Output ────────────────────────────────────────────────────────────────

export type StableClusterConfidence = 'high' | 'medium' | 'low';

export interface StableLocationCluster {
  id: string;
  startAt: string;
  endAt: string;
  pingCount: number;
  centroidLat: number;
  centroidLng: number;
  medianAccuracyMeters: number | null;
  p90AccuracyMeters: number | null;
  /** P90 av avstånd från centroid till medlemmar (meter). */
  radiusMeters: number;
  sourcePingIds: string[];
  confidence: StableClusterConfidence;
  maxInternalGapMinutes: number;
  isStable: boolean;
  /** Vid behov: 'sparse_signal' när få pings men sammanhängande. */
  reasons: string[];
}

export interface StableClusterDiagnostics {
  inputPingCount: number;
  consideredPingCount: number;
  ignoredOutlierPingCount: number;
  clusterCount: number;
  stableClusterCount: number;
  sparseClusterCount: number;
  options: Required<BuildClustersOptions>;
  examples: Array<{
    id: string;
    startAt: string;
    endAt: string;
    pingCount: number;
    confidence: StableClusterConfidence;
    isStable: boolean;
    reasons: string[];
  }>;
}

export interface BuildClustersResult {
  clusters: StableLocationCluster[];
  diagnostics: StableClusterDiagnostics;
}

export interface BuildClustersOptions {
  /** Pings inom denna radie räknas som "samma område" vid expansion. */
  sameAreaRadiusMeters?: number;
  /** Min antal pings för att kalla ett kluster "stabilt". */
  minStablePings?: number;
  /** Maxgap mellan två konsekutiva pings inom samma kluster (min). */
  maxClusterGapMinutes?: number;
}

const DEFAULT_OPTIONS: Required<BuildClustersOptions> = {
  sameAreaRadiusMeters: 200,
  minStablePings: 3,
  maxClusterGapMinutes: 45,
};

// ── Geo helpers ───────────────────────────────────────────────────────────

function toRad(x: number): number {
  return (x * Math.PI) / 180;
}

/** Haversine distance in meters. */
function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

/** Robust centroid via trimmed mean på lat/lng med vikt = confidenceWeight. */
function robustCentroid(
  pings: NormalizedGpsPing[],
): { lat: number; lng: number } {
  if (pings.length === 1) return { lat: pings[0].lat, lng: pings[0].lng };
  const lats = pings.map((p) => p.lat).sort((a, b) => a - b);
  const lngs = pings.map((p) => p.lng).sort((a, b) => a - b);
  // Trimma 10% från varje ände när vi har ≥5 punkter, annars använd allt.
  const trim = pings.length >= 5 ? Math.floor(pings.length * 0.1) : 0;
  const trimmedLats = lats.slice(trim, lats.length - trim);
  const trimmedLngs = lngs.slice(trim, lngs.length - trim);
  // Vikta resterande (utan att veta vilken ping som blev trimmad — vi tar
  // medelvärdet av trimmade arrays vilket är robust mot outliers nära
  // ändarna). Detta är medvetet enkelt och deterministiskt.
  const meanLat = trimmedLats.reduce((s, v) => s + v, 0) / trimmedLats.length;
  const meanLng = trimmedLngs.reduce((s, v) => s + v, 0) / trimmedLngs.length;
  return { lat: meanLat, lng: meanLng };
}

// ── Builder ───────────────────────────────────────────────────────────────

interface PreCluster {
  pings: NormalizedGpsPing[];
  centroidLat: number;
  centroidLng: number;
}

function tsMs(ping: NormalizedGpsPing): number {
  return Date.parse(ping.ts);
}

function pickConfidence(
  cluster: PreCluster,
  opts: Required<BuildClustersOptions>,
): { confidence: StableClusterConfidence; reasons: string[] } {
  const reasons: string[] = [];
  const accs = cluster.pings
    .map((p) => p.accuracyM)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const medAcc = median(accs);
  const meanWeight =
    cluster.pings.reduce((s, p) => s + (p.confidenceWeight ?? 0), 0) /
    cluster.pings.length;

  let confidence: StableClusterConfidence = 'medium';
  if (cluster.pings.length >= opts.minStablePings && meanWeight >= 0.7) {
    confidence = 'high';
  } else if (cluster.pings.length < opts.minStablePings) {
    confidence = 'low';
    reasons.push('sparse_signal');
  } else if (meanWeight < 0.4 || (medAcc !== null && medAcc > 200)) {
    confidence = 'low';
    reasons.push('low_accuracy_signal');
  }
  return { confidence, reasons };
}

export function buildStableLocationClusters(
  locationLogicPings: NormalizedGpsPing[],
  options: BuildClustersOptions = {},
): BuildClustersResult {
  const opts: Required<BuildClustersOptions> = { ...DEFAULT_OPTIONS, ...options };
  const inputPingCount = locationLogicPings.length;

  // Defensiv filtrering: respektera Lager 1-flaggor.
  const considered = locationLogicPings
    .filter((p) => !p.hardRejected && !p.ignoredForLocationLogic)
    .filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        typeof p.ts === 'string' &&
        !Number.isNaN(Date.parse(p.ts)),
    )
    .sort((a, b) => tsMs(a) - tsMs(b));

  const ignoredOutlierPingCount = inputPingCount - considered.length;

  // Greedy temporal sweep: starta nytt kluster när tidsgap > max eller när
  // ny ping ligger > sameAreaRadius från kluster-centroid.
  const preClusters: PreCluster[] = [];
  for (const ping of considered) {
    const last = preClusters[preClusters.length - 1];
    if (!last) {
      preClusters.push({
        pings: [ping],
        centroidLat: ping.lat,
        centroidLng: ping.lng,
      });
      continue;
    }
    const lastPing = last.pings[last.pings.length - 1];
    const gapMin = (tsMs(ping) - tsMs(lastPing)) / 60000;
    const dist = distanceMeters(
      last.centroidLat,
      last.centroidLng,
      ping.lat,
      ping.lng,
    );
    if (gapMin > opts.maxClusterGapMinutes || dist > opts.sameAreaRadiusMeters) {
      preClusters.push({
        pings: [ping],
        centroidLat: ping.lat,
        centroidLng: ping.lng,
      });
    } else {
      last.pings.push(ping);
      const c = robustCentroid(last.pings);
      last.centroidLat = c.lat;
      last.centroidLng = c.lng;
    }
  }

  // Materialisera kluster.
  const clusters: StableLocationCluster[] = preClusters.map((pc, idx) => {
    const accs = pc.pings
      .map((p) => p.accuracyM)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const medAcc = median(accs);
    const p90Acc = percentile(accs, 90);
    const distances = pc.pings.map((p) =>
      distanceMeters(pc.centroidLat, pc.centroidLng, p.lat, p.lng),
    );
    const radiusMeters = percentile(distances, 90) ?? 0;
    let maxInternalGapMinutes = 0;
    for (let i = 1; i < pc.pings.length; i++) {
      const gap = (tsMs(pc.pings[i]) - tsMs(pc.pings[i - 1])) / 60000;
      if (gap > maxInternalGapMinutes) maxInternalGapMinutes = gap;
    }
    const { confidence, reasons } = pickConfidence(pc, opts);
    const isStable = pc.pings.length >= opts.minStablePings;
    if (!isStable && !reasons.includes('sparse_signal')) {
      reasons.push('sparse_signal');
    }
    const sourcePingIds = pc.pings
      .map((p) => p.id)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);

    return {
      id: `cluster_${idx + 1}`,
      startAt: pc.pings[0].ts,
      endAt: pc.pings[pc.pings.length - 1].ts,
      pingCount: pc.pings.length,
      centroidLat: pc.centroidLat,
      centroidLng: pc.centroidLng,
      medianAccuracyMeters: medAcc,
      p90AccuracyMeters: p90Acc,
      radiusMeters,
      sourcePingIds,
      confidence,
      maxInternalGapMinutes,
      isStable,
      reasons,
    };
  });

  const stableClusterCount = clusters.filter((c) => c.isStable).length;
  const sparseClusterCount = clusters.filter((c) => !c.isStable).length;

  const diagnostics: StableClusterDiagnostics = {
    inputPingCount,
    consideredPingCount: considered.length,
    ignoredOutlierPingCount,
    clusterCount: clusters.length,
    stableClusterCount,
    sparseClusterCount,
    options: opts,
    examples: clusters.slice(0, 5).map((c) => ({
      id: c.id,
      startAt: c.startAt,
      endAt: c.endAt,
      pingCount: c.pingCount,
      confidence: c.confidence,
      isStable: c.isStable,
      reasons: c.reasons,
    })),
  };

  return { clusters, diagnostics };
}
