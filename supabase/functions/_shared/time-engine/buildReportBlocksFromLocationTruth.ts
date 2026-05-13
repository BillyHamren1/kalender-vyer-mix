/**
 * Time Engine — buildReportBlocksFromLocationTruth (Location Truth 1.6)
 * =====================================================================
 *
 * Pure builder. Tar `LocationTruthSegment[]` (+ ev. transport-segment från
 * 1.5) och bygger report blocks med RÄTT mänskliga titlar.
 *
 * Regler (låsta):
 *   - private_residence → kind='private', countsAsWork=false. Får inte
 *     läggas in som arbete. Visas som privat (kan döljas av UI).
 *   - warehouse/project/booking/known_location → kind='work'.
 *   - transport → kind='transport' BARA om distance >= 500 m
 *     (kommer redan filtrerat från buildTransportFromLocationTruth).
 *   - movement < 500 → kind='internal_movement'.
 *   - unknown_place → kind='unknown', label='Okänd plats',
 *     reviewState='needs_review' om varaktigheten påverkar dagen.
 *   - signal_gap → emittas bara om motorn inte redan har bryggat.
 *
 * Titelprioritet (huvudtitel):
 *   1. projectName / largeProjectName
 *   2. bookingName / eventName
 *   3. locationName / warehouseName
 *   4. targetLabel om mänskligt namn
 *   5. planned assignment project/booking label
 *   6. dominant locationTruth label
 *   7. fallback: 'Arbete – okänd plats'
 *
 * Team-namn ('Team 1', 'Team transport', 'RIGG', 'LAGER') får ALDRIG vara
 * huvudtitel om en projekt/booking/location-titel finns. RIGG/LAGER får
 * bara vara `category` (fas).
 */

import type { ISODateTime, UUID } from './contracts.ts';
import type { LocationTruthSegment } from './buildLocationTruthTimeline.ts';
import type { TransportSegment } from './buildTransportFromLocationTruth.ts';

export type ReportBlockKind =
  | 'work'
  | 'transport'
  | 'private'
  | 'unknown'
  | 'internal_movement'
  | 'signal_gap';

export interface NameLookup {
  /** project_id → mänskligt projektnamn. */
  projectName?: Record<UUID, string>;
  /** large_project_id → mänskligt namn. */
  largeProjectName?: Record<UUID, string>;
  /** booking_id → mänskligt boknings/event-namn. */
  bookingName?: Record<UUID, string>;
  /** location_id (warehouse + organization_location) → mänskligt namn. */
  locationName?: Record<UUID, string>;
  /** target_key (`${type}:${id}`) → planned assignment label från bokad personal. */
  plannedAssignmentLabel?: Record<string, string>;
}

export interface ReportBlock {
  id: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
  kind: ReportBlockKind;
  /** Huvudtitel — alltid mänsklig om möjligt. */
  title: string;
  /** Fas / kategori (RIGG / LAGER / EVENT / DOWN / null). */
  category: string | null;
  countsAsWork: boolean;
  reviewState: 'ok' | 'needs_review';
  sourceLocationTruthSegmentIds: string[];
  sourceTransportSegmentIds: string[];
  locationTruthConfidence: number;
  locationTruthReasons: string[];
  resolvedFrom: 'project' | 'large_project' | 'booking' | 'location' | 'target_label'
    | 'planned_assignment' | 'location_truth_label' | 'fallback' | 'transport' | 'private' | 'unknown' | 'gap';
  centerLat: number | null;
  centerLng: number | null;
}

export interface BuildReportBlocksFromLocationTruthInput {
  locationTruthSegments: LocationTruthSegment[];
  transportSegments?: TransportSegment[];
  nameLookup?: NameLookup;
  /** Varaktigheter under detta i minuter ger inte needs_review för unknown. */
  unknownNeedsReviewMinMinutes?: number;
}

export interface LocationTruthLabelDiagnostics {
  teamTitlesPreventedCount: number;
  resolvedFromProjectCount: number;
  resolvedFromBookingCount: number;
  resolvedFromLocationCount: number;
  fallbackUnknownCount: number;
  examples: Array<{
    at: ISODateTime;
    rawLabel: string;
    resolvedTitle: string;
    resolvedFrom: ReportBlock['resolvedFrom'];
    category: string | null;
  }>;
}

export interface BuildReportBlocksFromLocationTruthResult {
  reportBlocks: ReportBlock[];
  diagnostics: LocationTruthLabelDiagnostics;
}

const TEAM_TITLE_RE = /^(team[\s_-]*\d+|team transport|rigg|lager|down|down\s*\d*|event\s*\d*|loadin|loadout)$/i;
const PHASE_HINTS: Array<{ re: RegExp; phase: string }> = [
  { re: /^rigg/i, phase: 'RIGG' },
  { re: /^lager/i, phase: 'LAGER' },
  { re: /^down/i, phase: 'DOWN' },
  { re: /^event/i, phase: 'EVENT' },
  { re: /^loadin/i, phase: 'LOADIN' },
  { re: /^loadout/i, phase: 'LOADOUT' },
];

function isTeamTitle(label: string | null | undefined): boolean {
  if (!label) return false;
  return TEAM_TITLE_RE.test(label.trim());
}

function detectPhase(label: string | null | undefined): string | null {
  if (!label) return null;
  for (const h of PHASE_HINTS) if (h.re.test(label.trim())) return h.phase;
  return null;
}

function pushExample(diag: LocationTruthLabelDiagnostics, ex: LocationTruthLabelDiagnostics['examples'][number]) {
  if (diag.examples.length < 20) diag.examples.push(ex);
}

interface ResolvedTitle {
  title: string;
  resolvedFrom: ReportBlock['resolvedFrom'];
  category: string | null;
  preventedTeamTitle: boolean;
}

function resolveTitle(s: LocationTruthSegment, lookup: NameLookup): ResolvedTitle {
  const phaseFromLabel = detectPhase(s.label);
  const teamPrevented = isTeamTitle(s.label);

  // 1. project / large_project
  if (s.kind === 'project' || s.targetType === 'project') {
    const id = s.projectId ?? s.targetId;
    const human = id ? lookup.projectName?.[id] : null;
    if (human) return { title: human, resolvedFrom: 'project', category: phaseFromLabel, preventedTeamTitle: teamPrevented };
  }
  if (s.targetType === 'large_project' || s.largeProjectId) {
    const id = s.largeProjectId ?? s.targetId;
    const human = id ? lookup.largeProjectName?.[id] : null;
    if (human) return { title: human, resolvedFrom: 'large_project', category: phaseFromLabel, preventedTeamTitle: teamPrevented };
  }

  // 2. booking
  if (s.kind === 'booking' || s.targetType === 'booking') {
    const id = s.bookingId ?? s.targetId;
    const human = id ? lookup.bookingName?.[id] : null;
    if (human) return { title: human, resolvedFrom: 'booking', category: phaseFromLabel, preventedTeamTitle: teamPrevented };
  }

  // 3. location / warehouse
  if (s.kind === 'warehouse' || s.kind === 'known_location'
      || s.targetType === 'warehouse' || s.targetType === 'organization_location' || s.targetType === 'location') {
    const id = s.locationId ?? s.targetId;
    const human = id ? lookup.locationName?.[id] : null;
    if (human) return { title: human, resolvedFrom: 'location', category: phaseFromLabel, preventedTeamTitle: teamPrevented };
  }

  // 4. targetLabel (om mänskligt – inte team)
  if (s.label && !isTeamTitle(s.label)) {
    return { title: s.label, resolvedFrom: 'target_label', category: phaseFromLabel, preventedTeamTitle: false };
  }

  // 5. planned assignment label
  if (s.targetType && s.targetId) {
    const planned = lookup.plannedAssignmentLabel?.[`${s.targetType}:${s.targetId}`];
    if (planned && !isTeamTitle(planned)) {
      return { title: planned, resolvedFrom: 'planned_assignment', category: phaseFromLabel, preventedTeamTitle: teamPrevented };
    }
  }

  // 6. dominant locationTruth label (även om team — bättre än fallback)
  if (s.label && isTeamTitle(s.label)) {
    return { title: s.label, resolvedFrom: 'location_truth_label', category: phaseFromLabel ?? s.label.trim().toUpperCase(), preventedTeamTitle: false };
  }

  // 7. fallback
  return { title: 'Arbete – okänd plats', resolvedFrom: 'fallback', category: phaseFromLabel, preventedTeamTitle: teamPrevented };
}

export function buildReportBlocksFromLocationTruth(
  input: BuildReportBlocksFromLocationTruthInput,
): BuildReportBlocksFromLocationTruthResult {
  const lookup = input.nameLookup ?? {};
  const unknownThresholdMin = input.unknownNeedsReviewMinMinutes ?? 10;

  const blocks: ReportBlock[] = [];
  const diag: LocationTruthLabelDiagnostics = {
    teamTitlesPreventedCount: 0,
    resolvedFromProjectCount: 0,
    resolvedFromBookingCount: 0,
    resolvedFromLocationCount: 0,
    fallbackUnknownCount: 0,
    examples: [],
  };

  let idx = 0;
  for (const s of (input.locationTruthSegments ?? [])) {
    const startAt = s.startAt;
    const endAt = s.endAt;
    const center = { lat: s.centerLat, lng: s.centerLng };
    const baseSourceIds = [s.id];

    if (s.kind === 'private_residence') {
      blocks.push({
        id: `rb_${idx++}`,
        startAt, endAt,
        kind: 'private',
        title: s.label || 'Boende',
        category: null,
        countsAsWork: false,
        reviewState: 'ok',
        sourceLocationTruthSegmentIds: baseSourceIds,
        sourceTransportSegmentIds: [],
        locationTruthConfidence: s.confidence,
        locationTruthReasons: s.confidenceReasons,
        resolvedFrom: 'private',
        centerLat: center.lat, centerLng: center.lng,
      });
      continue;
    }

    if (s.kind === 'movement') {
      blocks.push({
        id: `rb_${idx++}`,
        startAt, endAt,
        kind: 'internal_movement',
        title: 'Förflyttning',
        category: null,
        countsAsWork: false,
        reviewState: 'ok',
        sourceLocationTruthSegmentIds: baseSourceIds,
        sourceTransportSegmentIds: [],
        locationTruthConfidence: s.confidence,
        locationTruthReasons: s.confidenceReasons,
        resolvedFrom: 'transport',
        centerLat: center.lat, centerLng: center.lng,
      });
      continue;
    }

    if (s.kind === 'signal_gap') {
      const dur = Math.round((Date.parse(s.endAt) - Date.parse(s.startAt)) / 60000);
      blocks.push({
        id: `rb_${idx++}`,
        startAt, endAt,
        kind: 'signal_gap',
        title: 'GPS-signal saknas',
        category: null,
        countsAsWork: false,
        reviewState: dur >= unknownThresholdMin ? 'needs_review' : 'ok',
        sourceLocationTruthSegmentIds: baseSourceIds,
        sourceTransportSegmentIds: [],
        locationTruthConfidence: s.confidence,
        locationTruthReasons: s.confidenceReasons,
        resolvedFrom: 'gap',
        centerLat: center.lat, centerLng: center.lng,
      });
      continue;
    }

    if (s.kind === 'unknown_place') {
      const dur = Math.round((Date.parse(s.endAt) - Date.parse(s.startAt)) / 60000);
      diag.fallbackUnknownCount += 1;
      blocks.push({
        id: `rb_${idx++}`,
        startAt, endAt,
        kind: 'unknown',
        title: 'Okänd plats',
        category: null,
        countsAsWork: false,
        reviewState: dur >= unknownThresholdMin ? 'needs_review' : 'ok',
        sourceLocationTruthSegmentIds: baseSourceIds,
        sourceTransportSegmentIds: [],
        locationTruthConfidence: s.confidence,
        locationTruthReasons: s.confidenceReasons,
        resolvedFrom: 'unknown',
        centerLat: center.lat, centerLng: center.lng,
      });
      continue;
    }

    // work / known_site
    const resolved = resolveTitle(s, lookup);
    if (resolved.preventedTeamTitle) diag.teamTitlesPreventedCount += 1;
    if (resolved.resolvedFrom === 'project' || resolved.resolvedFrom === 'large_project') diag.resolvedFromProjectCount += 1;
    else if (resolved.resolvedFrom === 'booking') diag.resolvedFromBookingCount += 1;
    else if (resolved.resolvedFrom === 'location') diag.resolvedFromLocationCount += 1;
    else if (resolved.resolvedFrom === 'fallback') diag.fallbackUnknownCount += 1;

    blocks.push({
      id: `rb_${idx++}`,
      startAt, endAt,
      kind: 'work',
      title: resolved.title,
      category: resolved.category,
      countsAsWork: true,
      reviewState: 'ok',
      sourceLocationTruthSegmentIds: baseSourceIds,
      sourceTransportSegmentIds: [],
      locationTruthConfidence: s.confidence,
      locationTruthReasons: s.confidenceReasons,
      resolvedFrom: resolved.resolvedFrom,
      centerLat: center.lat, centerLng: center.lng,
    });

    pushExample(diag, {
      at: startAt,
      rawLabel: s.label,
      resolvedTitle: resolved.title,
      resolvedFrom: resolved.resolvedFrom,
      category: resolved.category,
    });
  }

  // Lägg in transport-segment som egna block (alltid >= 500 m enligt 1.5).
  for (const t of (input.transportSegments ?? [])) {
    blocks.push({
      id: `rb_${idx++}`,
      startAt: t.startAt,
      endAt: t.endAt,
      kind: 'transport',
      title: 'Resa',
      category: null,
      countsAsWork: false,
      reviewState: 'ok',
      sourceLocationTruthSegmentIds: [t.fromSegmentId, t.toSegmentId],
      sourceTransportSegmentIds: [t.id],
      locationTruthConfidence: 0.7,
      locationTruthReasons: ['transport_after_location_truth', `distance_${t.distanceMeters}m`],
      resolvedFrom: 'transport',
      centerLat: null, centerLng: null,
    });
  }

  blocks.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  return { reportBlocks: blocks, diagnostics: diag };
}
