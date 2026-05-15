// @ts-nocheck
/**
 * normalizeGpsEvidence (Time Engine — Lager 1.3)
 * ──────────────────────────────────────────────
 * Normaliserar råa staff_location_history-rader till evidence-pings för
 * Day Evidence Layer.
 *
 * PRODUKTREGEL:
 *   En person kan vara 50–150 m fel och ändå vara på samma arbetsområde.
 *   Vi får INTE kasta pings bara för att accuracy är hög. Endast tekniskt
 *   ogiltiga pings hard-rejectas. Resterande behålls med kvalitetsklass och
 *   confidenceWeight så nästa lager kan välja hur de viktas.
 *
 * Den här helpern:
 *   - läser inget från DB
 *   - skriver inget
 *   - bygger inga timeline-block
 *   - är ren och deterministisk
 */

export type AccuracyQuality =
  | 'excellent'
  | 'good'
  | 'usable'
  | 'weak'
  | 'very_weak'
  | 'outlier_candidate'
  | 'unknown';

export interface NormalizedGpsPing {
  /** Optional row id from staff_location_history. */
  id: string | null;
  /** ISO timestamp. */
  ts: string;
  lat: number;
  lng: number;
  /** Accuracy in meters, or null if missing. */
  accuracyM: number | null;
  /** Speed in m/s, or null if missing. */
  speedMps: number | null;
  accuracyQuality: AccuracyQuality;
  /** 0..1 weight for downstream confidence calculations. */
  confidenceWeight: number;
  hardRejected: false;
  /** Initially false; later layers may flip this for known noise. */
  ignoredForLocationLogic: boolean;
}

export type HardRejectReason =
  | 'missing_lat_or_lng'
  | 'lat_or_lng_nan'
  | 'lat_or_lng_out_of_range'
  | 'missing_timestamp'
  | 'unparsable_timestamp';

export interface HardRejectedGpsPing {
  id: string | null;
  rawRecordedAt: string | null;
  rawLat: unknown;
  rawLng: unknown;
  reason: HardRejectReason;
}

export interface GpsQualityCounts {
  excellent: number;
  good: number;
  usable: number;
  weak: number;
  veryWeak: number;
  outlierCandidate: number;
  unknown: number;
}

export interface GpsNormalizationDiagnostics {
  rawPingCount: number;
  normalizedPingCount: number;
  hardRejectedPingCount: number;
  excellentCount: number;
  goodCount: number;
  usableCount: number;
  weakCount: number;
  veryWeakCount: number;
  outlierCandidateCount: number;
  /** Pings retained with accuracy > 200m (weak + very_weak + outlier_candidate). */
  retainedLowAccuracyCount: number;
  medianAccuracyMeters: number | null;
  p90AccuracyMeters: number | null;
}

export interface NormalizeGpsEvidenceResult {
  normalizedPings: NormalizedGpsPing[];
  hardRejectedPings: HardRejectedGpsPing[];
  qualityCounts: GpsQualityCounts;
  diagnostics: GpsNormalizationDiagnostics;
}

export interface RawGpsRow {
  id?: string | number | null;
  recorded_at?: string | null;
  ts?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  accuracy?: number | string | null;
  accuracyM?: number | string | null;
  speed?: number | string | null;
  speedMps?: number | string | null;
  [key: string]: unknown;
}

const VALID_LAT = (v: number) => v >= -90 && v <= 90;
const VALID_LNG = (v: number) => v >= -180 && v <= 180;

function classifyAccuracy(accuracyM: number | null): AccuracyQuality {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return 'unknown';
  if (accuracyM <= 50) return 'excellent';
  if (accuracyM <= 150) return 'good';
  if (accuracyM <= 300) return 'usable';
  if (accuracyM <= 800) return 'weak';
  if (accuracyM <= 2000) return 'very_weak';
  return 'outlier_candidate';
}

function weightFor(quality: AccuracyQuality): number {
  switch (quality) {
    case 'excellent': return 1.0;
    case 'good': return 0.85;
    case 'usable': return 0.65;
    case 'weak': return 0.4;
    case 'very_weak': return 0.2;
    case 'outlier_candidate': return 0.05;
    case 'unknown': return 0.5;
  }
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const w = rank - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function normalizeGpsEvidence(
  rawRows: RawGpsRow[],
): NormalizeGpsEvidenceResult {
  const normalized: NormalizedGpsPing[] = [];
  const rejected: HardRejectedGpsPing[] = [];
  const counts: GpsQualityCounts = {
    excellent: 0, good: 0, usable: 0, weak: 0, veryWeak: 0,
    outlierCandidate: 0, unknown: 0,
  };

  for (const r of rawRows ?? []) {
    const id = r?.id != null ? String(r.id) : null;
    const tsRaw = (r?.recorded_at ?? r?.ts ?? null) as string | null;
    const latRaw = r?.lat;
    const lngRaw = r?.lng;

    if (latRaw == null || lngRaw == null) {
      rejected.push({ id, rawRecordedAt: tsRaw, rawLat: latRaw, rawLng: lngRaw, reason: 'missing_lat_or_lng' });
      continue;
    }
    const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
    const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      rejected.push({ id, rawRecordedAt: tsRaw, rawLat: latRaw, rawLng: lngRaw, reason: 'lat_or_lng_nan' });
      continue;
    }
    if (!VALID_LAT(lat) || !VALID_LNG(lng)) {
      rejected.push({ id, rawRecordedAt: tsRaw, rawLat: latRaw, rawLng: lngRaw, reason: 'lat_or_lng_out_of_range' });
      continue;
    }
    if (!tsRaw) {
      rejected.push({ id, rawRecordedAt: tsRaw, rawLat: latRaw, rawLng: lngRaw, reason: 'missing_timestamp' });
      continue;
    }
    const tsMs = Date.parse(tsRaw);
    if (!Number.isFinite(tsMs)) {
      rejected.push({ id, rawRecordedAt: tsRaw, rawLat: latRaw, rawLng: lngRaw, reason: 'unparsable_timestamp' });
      continue;
    }

    const accuracyM = toNum(r?.accuracy ?? r?.accuracyM);
    const speedMps = toNum(r?.speed ?? r?.speedMps);
    const quality = classifyAccuracy(accuracyM);
    const confidenceWeight = weightFor(quality);

    switch (quality) {
      case 'excellent': counts.excellent++; break;
      case 'good': counts.good++; break;
      case 'usable': counts.usable++; break;
      case 'weak': counts.weak++; break;
      case 'very_weak': counts.veryWeak++; break;
      case 'outlier_candidate': counts.outlierCandidate++; break;
      case 'unknown': counts.unknown++; break;
    }

    normalized.push({
      id,
      ts: new Date(tsMs).toISOString(),
      lat,
      lng,
      accuracyM,
      speedMps,
      accuracyQuality: quality,
      confidenceWeight,
      hardRejected: false,
      ignoredForLocationLogic: false,
    });
  }

  const accSorted = normalized
    .map((p) => p.accuracyM)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);

  const retainedLowAccuracyCount =
    counts.weak + counts.veryWeak + counts.outlierCandidate;

  const diagnostics: GpsNormalizationDiagnostics = {
    rawPingCount: rawRows?.length ?? 0,
    normalizedPingCount: normalized.length,
    hardRejectedPingCount: rejected.length,
    excellentCount: counts.excellent,
    goodCount: counts.good,
    usableCount: counts.usable,
    weakCount: counts.weak,
    veryWeakCount: counts.veryWeak,
    outlierCandidateCount: counts.outlierCandidate,
    retainedLowAccuracyCount,
    medianAccuracyMeters: percentile(accSorted, 50),
    p90AccuracyMeters: percentile(accSorted, 90),
  };

  return { normalizedPings: normalized, hardRejectedPings: rejected, qualityCounts: counts, diagnostics };
}
