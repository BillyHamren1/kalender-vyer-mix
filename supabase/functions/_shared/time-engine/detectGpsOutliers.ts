// @ts-nocheck
/**
 * detectGpsOutliers (Time Engine — Lager 1.4)
 * ───────────────────────────────────────────
 * Outlier-detektering för normaliserade GPS-pings.
 *
 * PRODUKTREGEL:
 *   En ensam ping långt bort, omgiven av pings i samma stabila område
 *   (kort tidsfönster, omöjlig hastighet), ska INTE driva location logic.
 *   Vi flaggar ignoredForLocationLogic=true men raderar ALDRIG raden från
 *   raw evidence — den finns kvar i diagnostik.
 *
 * Den här helpern:
 *   - läser inget från DB
 *   - skriver inget
 *   - bygger inga timeline-block
 *   - är ren, deterministisk och idempotent
 *   - skapar varken transport, okänd plats eller granska-block
 */
import { distanceMeters } from '../timeline/geo.ts';
import type { NormalizedGpsPing } from './normalizeGpsEvidence.ts';

// ── Tunables ───────────────────────────────────────────────────────────────
const SPIKE_FAR_MIN_M = 1500;            // distans till previous OCH next
const STABLE_NEIGHBOR_MAX_M = 300;       // previous↔next måste vara nära
const SPIKE_TIME_WINDOW_S = 5 * 60;      // prev→curr→next inom 5 min
const IMPOSSIBLE_SPEED_MPS = 55;         // ~200 km/h => omöjligt för fält
const FAR_CLUSTER_MIN_DURATION_S = 20 * 60; // ≥20 min långt bort = behåll

export type GpsOutlierReason =
  | 'returned_to_same_stable_area_after_impossible_jump'
  | 'isolated_far_ping_no_next_evidence';

export interface GpsOutlierExample {
  pingId: string | null;
  ts: string;
  distanceFromPreviousMeters: number | null;
  distanceToNextMeters: number | null;
  previousNextDistanceMeters: number | null;
  timeWindowSeconds: number | null;
  reason: GpsOutlierReason;
}

export interface GpsOutlierDiagnostics {
  evaluatedPingCount: number;
  outlierCandidateCount: number;
  outlierIgnoredCount: number;
  returnedToSameStableAreaCount: number;
  impossibleJumpCount: number;
  retainedFarClusterCount: number;
  examples: GpsOutlierExample[];
}

export interface DetectGpsOutliersResult {
  /** Same array length as input. ignoredForLocationLogic may be flipped. */
  pings: NormalizedGpsPing[];
  diagnostics: GpsOutlierDiagnostics;
}

interface FarCluster {
  startIdx: number;
  endIdx: number;
  durationS: number;
}

function timeS(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 1000;
}

export function detectGpsOutliers(
  input: NormalizedGpsPing[],
): DetectGpsOutliersResult {
  // Sortera defensivt på ts (utan att mutera caller).
  const pings = [...(input ?? [])].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );

  const diagnostics: GpsOutlierDiagnostics = {
    evaluatedPingCount: pings.length,
    outlierCandidateCount: 0,
    outlierIgnoredCount: 0,
    returnedToSameStableAreaCount: 0,
    impossibleJumpCount: 0,
    retainedFarClusterCount: 0,
    examples: [],
  };

  if (pings.length < 2) {
    return { pings, diagnostics };
  }

  // ── Steg 1: identifiera "far"-segment relativt sin föregående granne ─────
  // En ping markeras isFar om dist(prev, curr) > SPIKE_FAR_MIN_M.
  const isFar: boolean[] = new Array(pings.length).fill(false);
  for (let i = 1; i < pings.length; i++) {
    const d = distanceMeters(
      pings[i - 1].lat, pings[i - 1].lng,
      pings[i].lat, pings[i].lng,
    );
    if (d > SPIKE_FAR_MIN_M) isFar[i] = true;
  }

  // ── Steg 2: gruppera kontigua far-pings till "far-kluster" ──────────────
  const farClusters: FarCluster[] = [];
  let i = 0;
  while (i < pings.length) {
    if (!isFar[i]) { i++; continue; }
    const start = i;
    let end = i;
    while (end + 1 < pings.length && isFar[end + 1]) end++;
    const durationS = timeS(pings[start].ts, pings[end].ts);
    farClusters.push({ startIdx: start, endIdx: end, durationS });
    i = end + 1;
  }

  for (const cluster of farClusters) {
    const { startIdx, endIdx, durationS } = cluster;
    const prevIdx = startIdx - 1;            // alltid >= 0 (isFar[0]=false)
    const nextIdx = endIdx + 1;              // kan saknas
    const curr = pings[startIdx];
    const prev = pings[prevIdx];
    const next = nextIdx < pings.length ? pings[nextIdx] : null;

    const distPrev = distanceMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    const distNext = next
      ? distanceMeters(pings[endIdx].lat, pings[endIdx].lng, next.lat, next.lng)
      : null;
    const prevNext = next
      ? distanceMeters(prev.lat, prev.lng, next.lat, next.lng)
      : null;
    const windowS = next ? timeS(prev.ts, next.ts) : null;
    const dtPrevS = timeS(prev.ts, curr.ts);
    const speedPrevMps = dtPrevS > 0 ? distPrev / dtPrevS : Infinity;

    diagnostics.outlierCandidateCount++;
    if (speedPrevMps > IMPOSSIBLE_SPEED_MPS) diagnostics.impossibleJumpCount++;

    // Långt-bort-kluster av betydande längd → BEHÅLL för senare lager.
    if (durationS >= FAR_CLUSTER_MIN_DURATION_S) {
      diagnostics.retainedFarClusterCount++;
      continue;
    }

    // Ingen "next" → ensam far-ping i slutet av dagen. Inte ignore, bara
    // diagnostik. Senare lager får avgöra.
    if (!next || distNext == null || prevNext == null || windowS == null) {
      if (diagnostics.examples.length < 20) {
        diagnostics.examples.push({
          pingId: curr.id,
          ts: curr.ts,
          distanceFromPreviousMeters: Math.round(distPrev),
          distanceToNextMeters: distNext != null ? Math.round(distNext) : null,
          previousNextDistanceMeters: prevNext != null ? Math.round(prevNext) : null,
          timeWindowSeconds: windowS != null ? Math.round(windowS) : null,
          reason: 'isolated_far_ping_no_next_evidence',
        });
      }
      continue;
    }

    // Returned-to-same-stable-area-regeln:
    //  - distNext stort
    //  - prev↔next nära (samma stabila område)
    //  - kort tidsfönster ELLER orimlig hastighet krävs
    const farFromNext = distNext > SPIKE_FAR_MIN_M;
    const stableNeighbors = prevNext <= STABLE_NEIGHBOR_MAX_M;
    const tightWindow = windowS <= SPIKE_TIME_WINDOW_S;
    const impossible = speedPrevMps > IMPOSSIBLE_SPEED_MPS;

    if (farFromNext && stableNeighbors && (tightWindow || impossible)) {
      // Markera HELA klustret som ignored — de är alla del av samma spike.
      for (let k = startIdx; k <= endIdx; k++) {
        if (!pings[k].ignoredForLocationLogic) {
          pings[k].ignoredForLocationLogic = true;
          diagnostics.outlierIgnoredCount++;
        }
      }
      diagnostics.returnedToSameStableAreaCount++;
      if (diagnostics.examples.length < 20) {
        diagnostics.examples.push({
          pingId: curr.id,
          ts: curr.ts,
          distanceFromPreviousMeters: Math.round(distPrev),
          distanceToNextMeters: Math.round(distNext),
          previousNextDistanceMeters: Math.round(prevNext),
          timeWindowSeconds: Math.round(windowS),
          reason: 'returned_to_same_stable_area_after_impossible_jump',
        });
      }
    }
  }

  return { pings, diagnostics };
}
