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
  // Optional rich fields (när get-staff-presence-day inkluderar dem) — används
  // av EvidencePanel för att rendera faktiska källblock istället för bara ID:n.
  // Aldrig krav, aldrig fallback i motorlogiken — endast UI-render.
  startAt?: string | null;
  endAt?: string | null;
  kind?: string | null;
  status?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  confidence?: string | null;
  signalGapMinutes?: number | null;
  confirmedMinutes?: number | null;
  durationMinutes?: number | null;
  reason?: string | null;
  source?: string | null;
}

export interface TargetLite {
  id: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters?: number | null;
  timeTrackingAllowed?: boolean | null;
  dateRelevance?: 'today' | 'recent' | 'permanent' | 'unknown' | null;
  matchRole?: 'primary' | 'secondary' | null;
  assignmentAnchor?: string | null;
  canAutoMatchAsWork?: boolean | null;
  addressAnchorKey?: string | null;
  rawAddress?: string | null;
  targetSource?: string | null;
}

export type AddressConfidence =
  | 'reverse_geocoded'
  | 'nearest_candidate'
  | 'coordinate'
  | 'none';

export interface ResolvedUnknownStopEvidence {
  reverseGeocoded: { label: string; source: 'mapbox' } | null;
  knownLocation: { id: string; name: string; address: string | null; distanceMeters: number } | null;
  privateZone: { kind: string; label: string; distanceMeters: number } | null;
  matchingBookings: Array<{
    bookingId: string;
    bookingNumber: string | null;
    label: string;
    address: string | null;
    eventDate: string;
    relativeDays: number;
    direction: 'today' | 'future' | 'past';
    distanceMeters: number;
  }>;
  priorVisits: {
    visitCount: number;
    pingCount: number;
    firstSeenIso: string | null;
    lastSeenIso: string | null;
    approxMinutes: number;
  } | null;
}

export interface LocationEvidence {
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
  reverseGeocodedAddress: string | null;
  nearestPrimaryTargetLabel: string | null;
  nearestPrimaryTargetDistanceMeters: number | null;
  nearestPrimaryTargetAddress: string | null;
  nearestSecondaryCandidateLabel: string | null;
  nearestSecondaryCandidateAddress: string | null;
  nearestSecondaryCandidateDistanceMeters: number | null;
  addressConfidence: AddressConfidence;
  /** Berikning från resolve-unknown-stop edge function (kopplas in i UI-lagret). */
  resolved?: ResolvedUnknownStopEvidence | null;
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
  /** Källblockens id:n (för bevisning + grupperade rader). */
  sourceBlockIds: string[];
  /** True om raden är en sammanslagen "Osäker period" av flera källblock. */
  isGrouped?: boolean;
}

export interface DisplayDebugSummary {
  rawReportCandidateBlocksCount: number;
  displayBlocksCount: number;
  groupedUncertainBlocksCount: number;
  signalAsPlaceLabelsRemovedCount: number;
  unknownBlocksWithAddressOrCoordinateCount: number;
  unknownBlocksWithoutEvidenceCount: number;
}

export interface BuildReportDisplayResult {
  blocks: DisplayBlock[];
  debug: DisplayDebugSummary;
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
  const primaryTargets = allTargets.filter(
    (t) => t.matchRole === 'primary' && t.canAutoMatchAsWork === true,
  );
  const secondaryTargets = allTargets.filter(
    (t) => !(t.matchRole === 'primary' && t.canAutoMatchAsWork === true),
  );

  // Time Engine 4.x — backend flaggar vissa block med hiddenReason
  // (open_day_signal_gap_without_presence, pre_first_gps_signal_gap,
  // short_onsite_anchor_noise). De får aldrig renderas som arbetstid/Gantt-block.
  // Filtrera bort dem innan vi bygger display-blocken. Diagnostik/debug kan
  // läsa input.blocks direkt om de vill visa suppressade poster.
  const visibleBlocks = input.blocks.filter((b) => !b.hiddenReason);

  const enriched: DisplayBlock[] = visibleBlocks.map((block) => {
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
    let nearestPrimaryTargetAddress: string | null = null;
    let nearestPrimaryTargetDistanceMeters: number | null = null;
    let nearestSecondaryCandidateLabel: string | null = null;
    let nearestSecondaryCandidateAddress: string | null = null;
    let nearestSecondaryCandidateDistanceMeters: number | null = null;

    if (lat != null && lng != null) {
      let bestP: { t: TargetLite; d: number } | null = null;
      for (const t of primaryTargets) {
        const d = haversineMeters(lat, lng, t.latitude!, t.longitude!);
        if (!bestP || d < bestP.d) bestP = { t, d };
      }
      if (bestP) {
        nearestPrimaryTargetLabel = bestP.t.name;
        nearestPrimaryTargetAddress = bestP.t.rawAddress ?? bestP.t.name ?? null;
        nearestPrimaryTargetDistanceMeters = Math.round(bestP.d);
      }
      let bestS: { t: TargetLite; d: number } | null = null;
      for (const t of secondaryTargets) {
        const d = haversineMeters(lat, lng, t.latitude!, t.longitude!);
        if (!bestS || d < bestS.d) bestS = { t, d };
      }
      if (bestS) {
        nearestSecondaryCandidateLabel = bestS.t.name;
        nearestSecondaryCandidateAddress = bestS.t.rawAddress ?? bestS.t.name ?? null;
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
        nearestPrimaryTargetAddress,
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
        nearestPrimaryTargetAddress,
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
        displayTitle = 'Period utan platsbevis';
        displaySubtitle = 'Ingen GPS-position eller närliggande adress · granska';
      }
    } else if (isReview) {
      // Regel needs_review (inkl. missing_transition_evidence)
      const haystack = `${block.title} ${block.subtitle ?? ''}`;
      const missingTransition = /missing_transition|transition_evidence|signal/i.test(haystack);
      const lastKnown = !looksLikeMissingSignal(block.fromLabel) ? block.fromLabel : null;
      const nextKnown = !looksLikeMissingSignal(block.toLabel) ? block.toLabel : null;
      const hasOwnStopCoord = lat != null && lng != null;
      const isBridgedTrip =
        !!lastKnown && !!nextKnown && lastKnown !== nextKnown && !hasOwnStopCoord;
      if (isBridgedTrip) {
        // ── Bridged-trip promotion (parity med servern) ────────────────
        // A→B mellan två distinkta kända arbetsplatser → klassa som
        // transport, inte needs_review. Detta läker även gamla cachade
        // staff_day_report_cache-rader utan att vänta på reprocess.
        const dur = block.durationMinutes ?? 0;
        displayTitle = 'Resa';
        displaySubtitle = `${lastKnown} → ${nextKnown}` +
          (dur ? ` · GPS saknades ~${Math.round(dur)} min under resan` : '');
        return {
          ...block,
          kind: 'transport',
          reviewState: 'ok',
          confidence: 'medium',
          fromLabel: lastKnown,
          toLabel: nextKnown,
          locationEvidence,
          displayTitle,
          displaySubtitle,
          aiReviewContext: null,
          aiHintLabel: null,
          sourceBlockIds: [block.id],
        };
      } else {
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
      sourceBlockIds: [block.id],
    };
  });

  // ──────────────────────────────────────────────────────────────────────
  // Regel 1 (på riktigt) — gruppera kedjor av osäkra block till "Osäker period".
  // En kedja är 2+ uncertain-block i rad med kort mellanrum (≤ 5 min).
  // Originalblockens id:n bevaras i sourceBlockIds (för bevisning).
  // ──────────────────────────────────────────────────────────────────────
  const GROUP_GAP_MS = 5 * 60 * 1000;

  const isUncertain = (b: DisplayBlock): boolean => {
    const haystack = `${b.title} ${b.subtitle ?? ''} ${(b.reviewReasons ?? []).join(' ')} ${b.displayTitle} ${b.displaySubtitle ?? ''}`;
    const flavor =
      /missing_transition|transition_evidence|signal saknas|signal_gap|signal lost|okänd|start saknas|mål saknas|osäker/i.test(
        haystack,
      );
    if (!flavor) return false;
    if (b.kind === 'unknown' || b.kind === 'needs_review') return true;
    if (b.kind === 'transport') {
      return looksLikeMissingSignal(b.fromLabel) || looksLikeMissingSignal(b.toLabel);
    }
    return false;
  };

  const findKnownPlaceLocal = (
    src: DisplayBlock[],
    start: number,
    dir: 1 | -1,
  ): string | null => {
    for (let i = start; i >= 0 && i < src.length; i += dir) {
      const b = src[i];
      if (b.kind === 'work' && b.targetLabel) return b.targetLabel;
      if (b.kind === 'transport' && dir === -1 && b.fromLabel && !looksLikeMissingSignal(b.fromLabel)) return b.fromLabel;
      if (b.kind === 'transport' && dir === 1 && b.toLabel && !looksLikeMissingSignal(b.toLabel)) return b.toLabel;
    }
    return null;
  };

  let groupedUncertainBlocksCount = 0;
  const grouped: DisplayBlock[] = [];
  let i = 0;
  while (i < enriched.length) {
    const cur = enriched[i];
    if (!isUncertain(cur)) {
      grouped.push(cur);
      i++;
      continue;
    }
    // Samla en sammanhängande kedja
    let j = i;
    while (
      j + 1 < enriched.length &&
      isUncertain(enriched[j + 1]) &&
      new Date(enriched[j + 1].startAt).getTime() -
        new Date(enriched[j].endAt).getTime() <=
        GROUP_GAP_MS
    ) {
      j++;
    }
    if (j === i) {
      // Ensam — låt bli att gruppera, behåll som-är
      grouped.push(cur);
      i++;
      continue;
    }
    // Slå ihop enriched[i..j]
    const run = enriched.slice(i, j + 1);
    const startAt = run[0].startAt;
    const endAt = run[run.length - 1].endAt;
    const durationMinutes = run.reduce((s, b) => s + (b.durationMinutes ?? 0), 0);
    const sourceBlockIds = run.flatMap((b) => b.sourceBlockIds);
    const sourcePresenceBlockIds = Array.from(
      new Set(run.flatMap((b) => b.sourcePresenceBlockIds ?? [])),
    );
    const hiddenPresenceBlockIds = Array.from(
      new Set(run.flatMap((b) => b.hiddenPresenceBlockIds ?? [])),
    );
    const hiddenSignalGapIds = Array.from(
      new Set(run.flatMap((b) => b.hiddenSignalGapIds ?? [])),
    );
    const reviewReasons = Array.from(
      new Set(run.flatMap((b) => b.reviewReasons ?? [])),
    );

    const prevKnown = findKnownPlaceLocal(enriched, i - 1, -1);
    const nextKnown = findKnownPlaceLocal(enriched, j + 1, 1);
    const evidenceWithAddress = run.find(
      (b) => b.locationEvidence?.reverseGeocodedAddress,
    );
    const evidenceWithSecondary = run.find(
      (b) =>
        b.locationEvidence?.nearestSecondaryCandidateLabel &&
        (b.locationEvidence.nearestSecondaryCandidateDistanceMeters ?? Infinity) <
          SECONDARY_PROXIMITY_M,
    );
    const evidenceWithCoord = run.find(
      (b) => b.locationEvidence?.lat != null && b.locationEvidence?.lng != null,
    );
    const subParts: string[] = ['Signal saknades / övergång saknas'];
    if (prevKnown) subParts.push(`Senaste kända plats: ${prevKnown}`);
    if (nextKnown) subParts.push(`Nästa kända plats: ${nextKnown}`);
    if (evidenceWithAddress?.locationEvidence?.reverseGeocodedAddress) {
      subParts.push(
        `Närmaste adress: ${evidenceWithAddress.locationEvidence.reverseGeocodedAddress}`,
      );
    } else if (evidenceWithSecondary?.locationEvidence?.nearestSecondaryCandidateLabel) {
      const ev = evidenceWithSecondary.locationEvidence;
      const distTxt =
        ev.nearestSecondaryCandidateDistanceMeters != null
          ? ` (${ev.nearestSecondaryCandidateDistanceMeters} m)`
          : '';
      const labelTxt =
        ev.nearestSecondaryCandidateAddress ?? ev.nearestSecondaryCandidateLabel;
      subParts.push(`Närmaste kandidat: ${labelTxt}${distTxt}`);
    } else if (
      evidenceWithCoord?.locationEvidence?.lat != null &&
      evidenceWithCoord?.locationEvidence?.lng != null
    ) {
      subParts.push(
        `Koordinat: ${fmtCoord(evidenceWithCoord.locationEvidence.lat)}, ${fmtCoord(
          evidenceWithCoord.locationEvidence.lng,
        )}`,
      );
    }

    // ── Transport-promotion (KONSERVATIV) ─────────────────────────────
    // Promote endast om kedjan är i princip en sammanhängande resa med
    // ENBART korta äkta signalglapp (inga riktiga stopp). Krav:
    //   - vi har en känd nästa plats (nextKnown)
    //   - 0 work-block i kedjan
    //   - INGET unknown_place-block har egna GPS-koordinater
    //     (= det är inte ett riktigt stopp utan ett GPS-glapp)
    //   - sammanlagd icke-transport-tid ≤ 20 min
    //   - varje enskilt non-transport-block ≤ 15 min
    // Annars: behåll som "Osäker period" så att riktiga stopp inte
    // göms bakom fel destination (FA Warehouse är bara dagens slut,
    // inte nästa stopp).
    const transportMinInRun = run.reduce(
      (s, b) => s + (b.kind === 'transport' ? b.durationMinutes ?? 0 : 0),
      0,
    );
    const workMinInRun = run.reduce(
      (s, b) => s + (b.kind === 'work' ? b.durationMinutes ?? 0 : 0),
      0,
    );
    const nonTransportBlocks = run.filter((b) => b.kind !== 'transport');
    const gapMinInRun = nonTransportBlocks.reduce(
      (s, b) => s + (b.durationMinutes ?? 0),
      0,
    );
    const longestNonTransportMin = nonTransportBlocks.reduce(
      (m, b) => Math.max(m, b.durationMinutes ?? 0),
      0,
    );
    const anyNonTransportHasOwnCoord = nonTransportBlocks.some(
      (b) => b.locationEvidence?.lat != null && b.locationEvidence?.lng != null,
    );
    const promoteToTransport =
      !!nextKnown &&
      workMinInRun === 0 &&
      !anyNonTransportHasOwnCoord &&
      gapMinInRun <= 20 &&
      longestNonTransportMin <= 15 &&
      transportMinInRun > 0;

    // ── Bridge-promotion (DISPLAY ONLY) ───────────────────────────────
    // När gapet sitter mellan TVÅ DISTINKTA kända arbetsplatser och
    // ingen del av kedjan har eget stopp-bevis (egna GPS-koords) →
    // det är uppenbart en resa, även om vi saknar GPS-pings under
    // färden. Vi ändrar BARA titel/subtitle (kind är fortfarande
    // needs_review så lön/ekonomi påverkas inte) — admin kan
    // bekräfta/avslå senare.
    const promoteAsBridgedTrip =
      !promoteToTransport &&
      !!prevKnown &&
      !!nextKnown &&
      prevKnown !== nextKnown &&
      workMinInRun === 0 &&
      !anyNonTransportHasOwnCoord;

    const promotedConfidence: 'high' | 'medium' | 'low' =
      gapMinInRun <= 10 ? 'high' : 'medium';
    let promotedTitle: string;
    if (promoteToTransport) {
      promotedTitle = `Resa mot ${nextKnown}`;
    } else if (promoteAsBridgedTrip) {
      promotedTitle = `Trolig resa · ${prevKnown} → ${nextKnown}`;
    } else {
      promotedTitle = 'Osäker period';
    }
    const promotedSubtitleParts: string[] = [];
    if (promoteToTransport) {
      if (prevKnown) promotedSubtitleParts.push(`från ${prevKnown}`);
      promotedSubtitleParts.push(`till ${nextKnown}`);
      if (gapMinInRun >= 1) {
        promotedSubtitleParts.push(`GPS saknades ~${Math.round(gapMinInRun)} min under resan`);
      }
    } else if (promoteAsBridgedTrip) {
      promotedSubtitleParts.push(`från ${prevKnown}`);
      promotedSubtitleParts.push(`till ${nextKnown}`);
      promotedSubtitleParts.push(`GPS saknades ${Math.round(gapMinInRun)} min – ingen stopp-evidens`);
      promotedSubtitleParts.push('granska');
    }
    const promotedSubtitle = (promoteToTransport || promoteAsBridgedTrip)
      ? promotedSubtitleParts.join(' · ')
      : subParts.join(' · ');
    const promotedWarning = promoteToTransport && gapMinInRun >= 1
      ? `GPS saknades ${Math.round(gapMinInRun)} min under resan`
      : null;

    // Bridged-trip → behandla som transport (parity med servern + isReview-grenen)
    const treatAsTransport = promoteToTransport || promoteAsBridgedTrip;
    const bridgedTitle = promoteAsBridgedTrip ? 'Resa' : promotedTitle;
    const bridgedSubtitle = promoteAsBridgedTrip
      ? `${prevKnown} → ${nextKnown}` +
        (gapMinInRun >= 1 ? ` · GPS saknades ~${Math.round(gapMinInRun)} min` : '')
      : promotedSubtitle;
    const bridgedWarning = promoteAsBridgedTrip && gapMinInRun >= 1
      ? `GPS saknades ${Math.round(gapMinInRun)} min under resan`
      : promotedWarning;

    const merged: DisplayBlock = {
      // Bas: ärv från första blocket men override
      ...run[0],
      id: `grp:${run[0].id}:${run.length}`,
      kind: treatAsTransport ? 'transport' : 'needs_review',
      startAt,
      endAt,
      durationMinutes,
      durationLabel: undefined,
      title: treatAsTransport ? bridgedTitle : promotedTitle,
      subtitle: treatAsTransport ? bridgedSubtitle : promotedSubtitle,
      targetType: null,
      targetId: null,
      targetLabel: null,
      fromLabel: prevKnown ?? null,
      toLabel: nextKnown ?? null,
      confidence: treatAsTransport ? promotedConfidence : 'low',
      reviewState: treatAsTransport ? 'ok' : 'needs_review',
      reviewReasons,
      warningLabel: bridgedWarning,
      sourcePresenceBlockIds,
      hiddenPresenceBlockIds,
      hiddenSignalGapIds,
      firstConfirmedAt: null,
      lastConfirmedAt: null,
      evidenceSummary: null,
      // Display-fält
      locationEvidence:
        evidenceWithAddress?.locationEvidence ??
        evidenceWithSecondary?.locationEvidence ??
        evidenceWithCoord?.locationEvidence ??
        null,
      displayTitle: treatAsTransport ? bridgedTitle : promotedTitle,
      displaySubtitle: treatAsTransport
        ? bridgedSubtitle
        : subParts.join(' · '),
      aiReviewContext: null,
      aiHintLabel: null,
      sourceBlockIds,
      isGrouped: true,
    };
    grouped.push(merged);
    groupedUncertainBlocksCount++;
    i = j + 1;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Regel 2 — "Signal saknas" får aldrig vara platsnamn i huvudvyn.
  // Exakt token "Signal saknas" → "signal saknades"; "→ Signal saknas" → "→ mål saknas".
  // ──────────────────────────────────────────────────────────────────────
  let signalAsPlaceLabelsRemovedCount = 0;
  const cleanSignalAsPlace = (s: string | null): string | null => {
    if (s == null) return s;
    let out = s;
    // "X → Signal saknas" → "X · mål saknas"
    out = out.replace(/(\s)(?:→|->)\s*Signal saknas/g, (_m, ws) => {
      signalAsPlaceLabelsRemovedCount++;
      return `${ws}· mål saknas`;
    });
    // "Signal saknas → X" → "start saknas · X"
    out = out.replace(/^Signal saknas\s*(?:→|->)\s*/g, () => {
      signalAsPlaceLabelsRemovedCount++;
      return 'start saknas · ';
    });
    // Fristående "Signal saknas" → "signal saknades"
    out = out.replace(/\bSignal saknas\b/g, () => {
      signalAsPlaceLabelsRemovedCount++;
      return 'signal saknades';
    });
    return out;
  };
  for (const b of grouped) {
    b.displayTitle = cleanSignalAsPlace(b.displayTitle) ?? b.displayTitle;
    b.displaySubtitle = cleanSignalAsPlace(b.displaySubtitle);
  }

  // ──────────────────────────────────────────────────────────────────────
  // AI-prep (ingen AI körs här) — körs på den slutliga (eventuellt grupperade) listan
  // ──────────────────────────────────────────────────────────────────────
  const currentPlannedAssignments = primaryTargets.map((t) => t.name);

  const findKnownPlace = (start: number, dir: 1 | -1): string | null =>
    findKnownPlaceLocal(grouped, start, dir);

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

  let unknownBlocksWithAddressOrCoordinateCount = 0;
  let unknownBlocksWithoutEvidenceCount = 0;

  for (let k = 0; k < grouped.length; k++) {
    const blk = grouped[k];
    if (blk.kind !== 'unknown' && blk.kind !== 'needs_review') continue;

    const haystack = `${blk.title} ${blk.subtitle ?? ''}`;
    const missingTransition = /missing_transition|transition_evidence|signal/i.test(haystack);
    const hasAddress = !!blk.locationEvidence?.reverseGeocodedAddress;
    const hasCoord =
      blk.locationEvidence?.lat != null && blk.locationEvidence?.lng != null;
    const hasNearbyUnassigned =
      !!blk.locationEvidence?.nearestSecondaryCandidateLabel &&
      (blk.locationEvidence?.nearestSecondaryCandidateDistanceMeters ?? Infinity) <
        SECONDARY_PROXIMITY_M;

    if (blk.kind === 'unknown') {
      if (hasAddress || hasCoord || hasNearbyUnassigned) {
        unknownBlocksWithAddressOrCoordinateCount++;
      } else {
        unknownBlocksWithoutEvidenceCount++;
      }
    }

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
      previousKnownPlace: findKnownPlace(k - 1, -1),
      nextKnownPlace: findKnownPlace(k + 1, 1),
      timeWindow: { startAt: blk.startAt, endAt: blk.endAt },
      staffName: input.staffName ?? null,
      date: input.date ?? null,
      currentPlannedAssignments,
    };
    blk.aiHintLabel = 'Kan granskas med AI senare';
  }

  const debug: DisplayDebugSummary = {
    rawReportCandidateBlocksCount: input.blocks.length,
    displayBlocksCount: grouped.length,
    groupedUncertainBlocksCount,
    signalAsPlaceLabelsRemovedCount,
    unknownBlocksWithAddressOrCoordinateCount,
    unknownBlocksWithoutEvidenceCount,
  };

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[buildReportDisplayBlocks] debug summary', debug);
  }

  // Stash debug på array (för callers som vill läsa utan att byta API).
  (grouped as DisplayBlock[] & { debug?: DisplayDebugSummary }).debug = debug;
  return grouped;
}

/**
 * Tunn wrapper som returnerar både blocks och debug-summering.
 * Används av evidence-/raw-vyer som vill visa siffrorna explicit.
 */
export function buildReportDisplay(
  input: BuildReportDisplayBlocksInput,
): BuildReportDisplayResult {
  const blocks = buildReportDisplayBlocks(input);
  const debug =
    (blocks as DisplayBlock[] & { debug?: DisplayDebugSummary }).debug ?? {
      rawReportCandidateBlocksCount: input.blocks.length,
      displayBlocksCount: blocks.length,
      groupedUncertainBlocksCount: 0,
      signalAsPlaceLabelsRemovedCount: 0,
      unknownBlocksWithAddressOrCoordinateCount: 0,
      unknownBlocksWithoutEvidenceCount: 0,
    };
  return { blocks, debug };
}
