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

  // ── Single-pass spike-detektering med löpande "stable anchor" ──────────
  // För varje ping jämförs avståndet mot senast kända stabila ping. Om vi
  // hittar en sekvens som är far och sedan återvänder nära ankaret klassas
  // sekvensen som spike. Annars expanderas anchor.
  let anchor = 0; // index till senaste stabila ping
  let i = 1;
  while (i < pings.length) {
    const distFromAnchor = distanceMeters(
      pings[anchor].lat, pings[anchor].lng,
      pings[i].lat, pings[i].lng,
    );
    if (distFromAnchor <= SPIKE_FAR_MIN_M) {
      anchor = i;
      i++;
      continue;
    }

    // Ping i ligger långt från senaste stabila. Samla kontigua spike-pings
    // som ligger NÄRA varandra (samma far-område).
    const spikeStart = i;
    let spikeEnd = i;
    while (
      spikeEnd + 1 < pings.length &&
      distanceMeters(
        pings[spikeStart].lat, pings[spikeStart].lng,
        pings[spikeEnd + 1].lat, pings[spikeEnd + 1].lng,
      ) <= STABLE_NEIGHBOR_MAX_M
    ) {
      spikeEnd++;
    }

    const prev = pings[anchor];
    const curr = pings[spikeStart];
    const last = pings[spikeEnd];
    const nextIdx = spikeEnd + 1;
    const next = nextIdx < pings.length ? pings[nextIdx] : null;
    const durationS = timeS(curr.ts, last.ts);

    const distPrev = distanceMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    const distNext = next
      ? distanceMeters(last.lat, last.lng, next.lat, next.lng)
      : null;
    const prevNext = next
      ? distanceMeters(prev.lat, prev.lng, next.lat, next.lng)
      : null;
    const windowS = next ? timeS(prev.ts, next.ts) : null;
    const dtPrevS = timeS(prev.ts, curr.ts);
    const dtNextS = next ? timeS(last.ts, next.ts) : null;
    const speedPrevMps = dtPrevS > 0 ? distPrev / dtPrevS : Infinity;
    const speedNextMps = next && dtNextS && dtNextS > 0 && distNext != null
      ? distNext / dtNextS
      : 0;
    const peakSpeedMps = Math.max(speedPrevMps, speedNextMps);

    diagnostics.outlierCandidateCount++;
    if (peakSpeedMps > IMPOSSIBLE_SPEED_MPS) diagnostics.impossibleJumpCount++;

    // Långt-bort-kluster av betydande längd → BEHÅLL för senare lager.
    if (durationS >= FAR_CLUSTER_MIN_DURATION_S) {
      diagnostics.retainedFarClusterCount++;
      // Anchor flyttar till sista pingen i klustret (verklig position).
      anchor = spikeEnd;
      i = spikeEnd + 1;
      continue;
    }

    // Ingen "next" → ensam far-ping i slutet av dagen. Diagnostik bara.
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
      // Behåll anchor — hoppa förbi spike utan att flytta anchor.
      i = spikeEnd + 1;
      continue;
    }

    // Returned-to-same-stable-area-regeln.
    const farFromNext = distNext > SPIKE_FAR_MIN_M;
    const stableNeighbors = prevNext <= STABLE_NEIGHBOR_MAX_M;
    const tightWindow = windowS <= SPIKE_TIME_WINDOW_S;
    const impossible = peakSpeedMps > IMPOSSIBLE_SPEED_MPS;

    if (farFromNext && stableNeighbors && (tightWindow || impossible)) {
      for (let k = spikeStart; k <= spikeEnd; k++) {
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
      // Anchor stannar (next är return till samma område). Hoppa till next.
      i = nextIdx;
      continue;
    }

    // Inte spike enligt regler — flytta anchor till spikeEnd.
    anchor = spikeEnd;
    i = spikeEnd + 1;
  }

  return { pings, diagnostics };
}
