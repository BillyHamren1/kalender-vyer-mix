/**
 * buildReportDisplayBlocks
 * ─────────────────────────
 * Pure, deterministisk display-överlagring för Tidrapporter-sidan
 * (/staff-management/time-reports).
 *
 * Tar:
 *   - reportCandidateBlocks (motorns klassificering — sanning för tid/kind)
 *   - presenceDayBlocks (för centerLat/centerLng/maxDistanceMeters per källblock)
 *   - targets (resolveWorkTargets-resultat med lat/lng + flagga om planerat)
 *
 * Producerar per block:
 *   - locationEvidence  (lat/lng/accuracy + närmaste primary/secondary)
 *   - displayTitle / displaySubtitle  (mänsklig text när motorn bara har "Okänd plats")
 *
 * Regler (deterministiska, INGEN AI):
 *   1. Okänd plats:
 *        - reverseGeocodedAddress (om tillgänglig — för stunden alltid null)
 *        - annars "Nära <secondary>" om secondary < 500 m
 *        - annars "Koordinat: lat, lng"
 *        - annars "Osäker platsperiod"
 *   2. Secondary candidate nära  →  visas som "Nära … · ej kopplad till planerat jobb"
 *      Blocket flyttas ALDRIG till säker work — kind/reviewState rörs ej.
 *   3. Transport till/från signal_gap visas inte som "Signal saknas":
 *        - "Resa efter <senaste kända plats>"
 *        - "Resa mot okänd plats"
 *        - "Mål saknas · signal saknades"
 *   4. unknown följt av signal_gap-block grupperas visuellt till "Osäker platsperiod".
 *
 * Garanti:
 *   - Inga writes.
 *   - Påverkar inte mobilen.
 *   - Påverkar inte motorns klassificering — endast displayTitle/displaySubtitle/locationEvidence.
 *   - Skapar ingen automatisk koppling till oassignad bokning.
 */

import type { ReportCandidateBlockUI } from '@/components/staff/ReportCandidateTimeline';

export interface PresenceBlockLite {
  id: string;
  evidence?: {
    centerLat?: number | null;
    centerLng?: number | null;
    maxDistanceMeters?: number | null;
    pingCount?: number | null;
  } | null;
}

export interface TargetLite {
  id: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters?: number | null;
  timeTrackingAllowed?: boolean | null;
  dateRelevance?: { relevant?: boolean | null } | null;
  targetSource?: string | null;
}

export type AddressConfidence =
  | 'reverse_geocoded'
  | 'nearest_candidate'
  | 'coordinate'
  | 'none';

export interface LocationEvidence {
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
  reverseGeocodedAddress: string | null;
  nearestPrimaryTargetLabel: string | null;
  nearestPrimaryTargetDistanceMeters: number | null;
  nearestSecondaryCandidateLabel: string | null;
  nearestSecondaryCandidateAddress: string | null;
  nearestSecondaryCandidateDistanceMeters: number | null;
  addressConfidence: AddressConfidence;
}

export interface DisplayBlock extends ReportCandidateBlockUI {
  locationEvidence: LocationEvidence | null;
  displayTitle: string;
  displaySubtitle: string | null;
}

const SECONDARY_PROXIMITY_M = 500;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const fmtCoord = (v: number) => v.toFixed(5);

const looksLikeMissingSignal = (s: string | null | undefined): boolean => {
  if (!s) return true;
  return /signal saknas|signal_gap|okänd|signal lost|unknown/i.test(s);
};

export interface BuildReportDisplayBlocksInput {
  blocks: ReportCandidateBlockUI[];
  presenceBlocks?: PresenceBlockLite[];
  targets?: TargetLite[];
}

export function buildReportDisplayBlocks(
  input: BuildReportDisplayBlocksInput,
): DisplayBlock[] {
  const presenceById = new Map<string, PresenceBlockLite>(
    (input.presenceBlocks ?? []).map((p) => [p.id, p]),
  );

  // primary  = motorn anser måltavlan giltig OCH datumrelevant (planerat jobb)
  // secondary = övriga targets med koordinater (kandidater för läsbarhet)
  const allTargets = (input.targets ?? []).filter(
    (t) => t.latitude != null && t.longitude != null,
  );
  const primarySet = new Set(
    allTargets
      .filter((t) => !!t.timeTrackingAllowed && !!t.dateRelevance?.relevant)
      .map((t) => t.id),
  );
  const primaryTargets = allTargets.filter((t) => primarySet.has(t.id));
  const secondaryTargets = allTargets.filter((t) => !primarySet.has(t.id));

  const enriched: DisplayBlock[] = input.blocks.map((block) => {
    // 1) Hitta koordinat-center från första källblocket som har lat/lng.
    let lat: number | null = null;
    let lng: number | null = null;
    let accuracyMeters: number | null = null;
    for (const sid of block.sourcePresenceBlockIds ?? []) {
      const pb = presenceById.get(sid);
      const cLat = pb?.evidence?.centerLat ?? null;
      const cLng = pb?.evidence?.centerLng ?? null;
      if (cLat != null && cLng != null) {
        lat = cLat;
        lng = cLng;
        accuracyMeters = pb?.evidence?.maxDistanceMeters ?? null;
        break;
      }
    }

    let nearestPrimaryTargetLabel: string | null = null;
    let nearestPrimaryTargetDistanceMeters: number | null = null;
    let nearestSecondaryCandidateLabel: string | null = null;
    const nearestSecondaryCandidateAddress: string | null = null;
    let nearestSecondaryCandidateDistanceMeters: number | null = null;

    if (lat != null && lng != null) {
      let bestP: { t: TargetLite; d: number } | null = null;
      for (const t of primaryTargets) {
        const d = haversineMeters(lat, lng, t.latitude!, t.longitude!);
        if (!bestP || d < bestP.d) bestP = { t, d };
      }
      if (bestP) {
        nearestPrimaryTargetLabel = bestP.t.name;
        nearestPrimaryTargetDistanceMeters = Math.round(bestP.d);
      }
      let bestS: { t: TargetLite; d: number } | null = null;
      for (const t of secondaryTargets) {
        const d = haversineMeters(lat, lng, t.latitude!, t.longitude!);
        if (!bestS || d < bestS.d) bestS = { t, d };
      }
      if (bestS) {
        nearestSecondaryCandidateLabel = bestS.t.name;
        nearestSecondaryCandidateDistanceMeters = Math.round(bestS.d);
      }
    }

    let locationEvidence: LocationEvidence | null = null;
    if (lat != null && lng != null) {
      locationEvidence = {
        lat,
        lng,
        accuracyMeters,
        reverseGeocodedAddress: null, // reserverat för framtida geokodning
        nearestPrimaryTargetLabel,
        nearestPrimaryTargetDistanceMeters,
        nearestSecondaryCandidateLabel,
        nearestSecondaryCandidateAddress,
        nearestSecondaryCandidateDistanceMeters,
        addressConfidence: nearestSecondaryCandidateLabel
          ? 'nearest_candidate'
          : 'coordinate',
      };
    } else if (nearestPrimaryTargetLabel || nearestSecondaryCandidateLabel) {
      locationEvidence = {
        lat: null,
        lng: null,
        accuracyMeters: null,
        reverseGeocodedAddress: null,
        nearestPrimaryTargetLabel,
        nearestPrimaryTargetDistanceMeters,
        nearestSecondaryCandidateLabel,
        nearestSecondaryCandidateAddress,
        nearestSecondaryCandidateDistanceMeters,
        addressConfidence: 'nearest_candidate',
      };
    } else {
      locationEvidence = null;
    }

    // ── Display-överlagring (rör inte block.kind / reviewState) ──
    let displayTitle = block.title;
    let displaySubtitle = block.subtitle ?? null;

    const isUnknown =
      block.kind === 'unknown' || /okänd plats/i.test(block.title);
    const isReview = block.kind === 'needs_review';
    const isTransport = block.kind === 'transport';

    const secondaryClose =
      nearestSecondaryCandidateLabel &&
      (nearestSecondaryCandidateDistanceMeters ?? Infinity) <
        SECONDARY_PROXIMITY_M;

    if (isUnknown) {
      // Regel 1
      if (locationEvidence?.reverseGeocodedAddress) {
        displayTitle = locationEvidence.reverseGeocodedAddress;
        displaySubtitle = secondaryClose
          ? `Nära ${nearestSecondaryCandidateLabel} · ej kopplad till planerat jobb`
          : displaySubtitle;
      } else if (secondaryClose) {
        // Regel 2 — visas som närliggande kandidat, men förblir unknown
        displayTitle = `Nära ${nearestSecondaryCandidateLabel}`;
        displaySubtitle = 'Ej kopplad till planerat jobb';
      } else if (lat != null && lng != null) {
        displayTitle = `Koordinat: ${fmtCoord(lat)}, ${fmtCoord(lng)}`;
        displaySubtitle = 'Ingen planerad arbetsplats matchar GPS-positionen';
      } else {
        displayTitle = 'Osäker platsperiod';
        displaySubtitle =
          'GPS-position fanns delvis, därefter saknades signal';
      }
    } else if (isReview && secondaryClose && !displaySubtitle) {
      // Regel 2 (även för needs_review)
      displaySubtitle = `Nära ${nearestSecondaryCandidateLabel} · ej kopplad till planerat jobb`;
    }

    if (isTransport) {
      // Regel 3
      const fromMissing = looksLikeMissingSignal(block.fromLabel);
      const toMissing = looksLikeMissingSignal(block.toLabel);
      if (fromMissing && toMissing) {
        displayTitle = 'Resa mellan okända platser';
        displaySubtitle = 'Mål saknas · signal saknades';
      } else if (toMissing && !fromMissing) {
        displayTitle = 'Resa mot okänd plats';
        displaySubtitle = `Resa efter ${block.fromLabel} · mål saknas (signal saknades)`;
      } else if (fromMissing && !toMissing) {
        displayTitle = `Resa mot ${block.toLabel}`;
        displaySubtitle = 'Ursprung okänt (signal saknades)';
      }
    }

    return {
      ...block,
      locationEvidence,
      displayTitle,
      displaySubtitle,
    };
  });

  // Regel 4 — gruppera unknown→signal_gap-par till "Osäker platsperiod".
  for (let i = 0; i < enriched.length - 1; i++) {
    const cur = enriched[i];
    const next = enriched[i + 1];
    const curIsUnknown = cur.kind === 'unknown';
    const nextSignalGap =
      (next.kind === 'unknown' || next.kind === 'needs_review') &&
      /signal/i.test(`${next.title} ${next.subtitle ?? ''}`);
    if (curIsUnknown && nextSignalGap) {
      cur.displayTitle = 'Osäker platsperiod';
      cur.displaySubtitle =
        'GPS-position fanns delvis, därefter saknades signal';
      next.displayTitle = 'Osäker platsperiod (forts.)';
      next.displaySubtitle = 'Signal saknades';
    }
  }

  return enriched;
}
