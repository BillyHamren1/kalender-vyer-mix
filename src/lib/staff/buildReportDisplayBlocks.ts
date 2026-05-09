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

export type AiReviewQuestionType =
  | 'match_unknown_address_to_booking'
  | 'classify_unknown_stop'
  | 'explain_missing_transition'
  | 'suggest_assignment_link';

export interface AiReviewNearestTarget {
  id: string | null;
  label: string;
  type: string | null;
  distanceMeters: number | null;
  isAssigned: boolean;
}

export interface AiReviewContext {
  questionType: AiReviewQuestionType;
  knownAddress: string | null;
  coordinate: { lat: number; lng: number } | null;
  nearestAssignedTargets: AiReviewNearestTarget[];
  nearestUnassignedCandidates: AiReviewNearestTarget[];
  previousKnownPlace: string | null;
  nextKnownPlace: string | null;
  timeWindow: { startAt: string; endAt: string };
  staffName: string | null;
  date: string | null;
  currentPlannedAssignments: string[];
}

export interface DisplayBlock extends ReportCandidateBlockUI {
  locationEvidence: LocationEvidence | null;
  displayTitle: string;
  displaySubtitle: string | null;
  /**
   * Förberedd kontext för framtida AI-granskning.
   * INGEN AI körs här. INGA writes. Endast deterministiska fält.
   * Sätts bara på unknown / needs_review.
   */
  aiReviewContext: AiReviewContext | null;
  /** Liten hint i UI; ingen knapp. */
  aiHintLabel: string | null;
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
  /** Valfri kontext för AI-prep. Ingen AI körs. */
  staffName?: string | null;
  date?: string | null;
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

    const coordText =
      lat != null && lng != null ? `Koordinat: ${fmtCoord(lat)}, ${fmtCoord(lng)}` : null;
    const addressText = locationEvidence?.reverseGeocodedAddress ?? null;
    const placeText = addressText ?? coordText;

    if (isUnknown) {
      // Regel 1 — visa alltid något mänskligt
      if (addressText) {
        displayTitle = 'Okänd plats';
        displaySubtitle = `${addressText} · granska`;
      } else if (secondaryClose) {
        const distTxt =
          nearestSecondaryCandidateDistanceMeters != null
            ? ` (${nearestSecondaryCandidateDistanceMeters} m)`
            : '';
        displayTitle = 'Ej kopplad plats';
        displaySubtitle = `Nära ${nearestSecondaryCandidateLabel}${distTxt} · ej assignad · granska`;
      } else if (coordText) {
        displayTitle = 'Okänd plats';
        displaySubtitle = `${coordText} · granska`;
      } else {
        displayTitle = 'Okänd plats';
        displaySubtitle = 'GPS-signal saknas · granska';
      }
    } else if (isReview) {
      // Regel needs_review (inkl. missing_transition_evidence)
      const haystack = `${block.title} ${block.subtitle ?? ''}`;
      const missingTransition = /missing_transition|transition_evidence|signal/i.test(haystack);
      const lastKnown = !looksLikeMissingSignal(block.fromLabel) ? block.fromLabel : null;
      const nextKnown = !looksLikeMissingSignal(block.toLabel) ? block.toLabel : null;
      const parts: string[] = [];
      if (lastKnown) parts.push(`från ${lastKnown}`);
      if (nextKnown) parts.push(`till ${nextKnown}`);
      if (missingTransition) parts.push('signal saknades');
      if (placeText) parts.push(placeText);
      if (secondaryClose && nearestSecondaryCandidateLabel) {
        parts.push(`nära ${nearestSecondaryCandidateLabel}`);
      }
      displayTitle = 'Osäker period';
      displaySubtitle = parts.length ? `${parts.join(' · ')} · granska` : 'Granska';
    }

    if (isTransport) {
      // Regel 3 — ersätt "Signal saknas"-labels med mänsklig text
      const fromMissing = looksLikeMissingSignal(block.fromLabel);
      const toMissing = looksLikeMissingSignal(block.toLabel);
      const fromUnknown = !block.fromLabel || /okänd/i.test(block.fromLabel);
      const toUnknown = !block.toLabel || /okänd/i.test(block.toLabel);
      const subParts: string[] = [];

      if (fromMissing && toMissing) {
        displayTitle = 'Resa · start och mål saknas';
      } else if (toMissing && !fromMissing) {
        const fromTxt = fromUnknown ? 'okänd plats' : block.fromLabel;
        displayTitle = `Resa efter ${fromTxt} · mål saknas`;
      } else if (fromMissing && !toMissing) {
        const toTxt = toUnknown ? 'okänd plats' : block.toLabel;
        displayTitle = `Resa mot ${toTxt} · start saknas`;
      }

      if (fromMissing || toMissing) {
        subParts.push('signal saknades');
        if (placeText) subParts.push(placeText);
        if (secondaryClose && nearestSecondaryCandidateLabel) {
          subParts.push(`nära ${nearestSecondaryCandidateLabel}`);
        }
        displaySubtitle = subParts.join(' · ');
      }
    }

    return {
      ...block,
      locationEvidence,
      displayTitle,
      displaySubtitle,
      aiReviewContext: null,
      aiHintLabel: null,
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

  // ── AI-prep (ingen AI körs här) ──
  const currentPlannedAssignments = primaryTargets.map((t) => t.name);

  const findKnownPlace = (start: number, dir: 1 | -1): string | null => {
    for (let i = start; i >= 0 && i < enriched.length; i += dir) {
      const b = enriched[i];
      if (b.kind === 'work' && b.targetLabel) return b.targetLabel;
      if (b.kind === 'transport' && dir === -1 && b.fromLabel && !looksLikeMissingSignal(b.fromLabel)) return b.fromLabel;
      if (b.kind === 'transport' && dir === 1 && b.toLabel && !looksLikeMissingSignal(b.toLabel)) return b.toLabel;
    }
    return null;
  };

  const toNearest = (
    list: TargetLite[],
    blk: DisplayBlock,
    isAssigned: boolean,
  ): AiReviewNearestTarget[] => {
    const lat = blk.locationEvidence?.lat ?? null;
    const lng = blk.locationEvidence?.lng ?? null;
    if (lat == null || lng == null) {
      return list.slice(0, 3).map((t) => ({
        id: t.id,
        label: t.name,
        type: t.type,
        distanceMeters: null,
        isAssigned,
      }));
    }
    return list
      .map((t) => ({ t, d: haversineMeters(lat, lng, t.latitude!, t.longitude!) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(({ t, d }) => ({
        id: t.id,
        label: t.name,
        type: t.type,
        distanceMeters: Math.round(d),
        isAssigned,
      }));
  };

  for (let i = 0; i < enriched.length; i++) {
    const blk = enriched[i];
    if (blk.kind !== 'unknown' && blk.kind !== 'needs_review') continue;

    const haystack = `${blk.title} ${blk.subtitle ?? ''}`;
    const missingTransition = /missing_transition|transition_evidence|signal/i.test(haystack);
    const hasAddress = !!blk.locationEvidence?.reverseGeocodedAddress;
    const hasNearbyUnassigned =
      !!blk.locationEvidence?.nearestSecondaryCandidateLabel &&
      (blk.locationEvidence?.nearestSecondaryCandidateDistanceMeters ?? Infinity) <
        SECONDARY_PROXIMITY_M;

    let questionType: AiReviewQuestionType;
    if (blk.kind === 'needs_review' && missingTransition) {
      questionType = 'explain_missing_transition';
    } else if (hasAddress) {
      questionType = 'match_unknown_address_to_booking';
    } else if (hasNearbyUnassigned) {
      questionType = 'suggest_assignment_link';
    } else {
      questionType = 'classify_unknown_stop';
    }

    blk.aiReviewContext = {
      questionType,
      knownAddress: blk.locationEvidence?.reverseGeocodedAddress ?? null,
      coordinate:
        blk.locationEvidence?.lat != null && blk.locationEvidence?.lng != null
          ? { lat: blk.locationEvidence.lat, lng: blk.locationEvidence.lng }
          : null,
      nearestAssignedTargets: toNearest(primaryTargets, blk, true),
      nearestUnassignedCandidates: toNearest(secondaryTargets, blk, false),
      previousKnownPlace: findKnownPlace(i - 1, -1),
      nextKnownPlace: findKnownPlace(i + 1, 1),
      timeWindow: { startAt: blk.startAt, endAt: blk.endAt },
      staffName: input.staffName ?? null,
      date: input.date ?? null,
      currentPlannedAssignments,
    };
    blk.aiHintLabel = 'Kan granskas med AI senare';
  }

  return enriched;
}
