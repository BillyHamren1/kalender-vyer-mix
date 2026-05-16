// Time Engine STOP 1 — resolveEffectiveWorkdayEndFromEvidence
// ────────────────────────────────────────────────────────────
// Ren helper. Skriver INGENTING. Avgör om en arbetsdag bör klippas
// bakåt i tiden för att användaren befunnit sig på icke-jobbplats
// i mer än `thresholdMinutes` efter sista riktiga arbetsplats.
//
// Drivs av LocationTruth V2-segment. Anropas EFTER att envelope är
// resolvad men FÖRE att WorkdayAllocation-loopen iterar segmenten,
// så att wdEnd kan klippas och både segment-clipping och uncovered
// gap-beräkning bygger på ny sluttid.
//
// Produktregeln: dagstimern startar dagen men håller den inte
// vid liv hur länge som helst. Privata/okända platser efter sista
// jobb-evidence i >90 min stoppar dagen.

import type {
  LocationTruthResult,
  LocationTruthTargetType,
} from './buildLocationTruthFromDayEvidence.ts';

export type DayEndStopReason =
  | 'home_after_last_work_over_90m'
  | 'private_after_last_work_over_90m'
  | 'non_work_location_after_last_work_over_90m'
  | 'no_work_evidence_after_last_work_over_90m'
  | 'open_timer_ignored_after_inferred_day_end';

export type DayEndStopConfidence = 'high' | 'medium' | 'low';

export interface ResolveEffectiveWorkdayEndInput {
  /** LocationTruth V2-segment för dagen (sorterade eller osorterade). */
  ltSegments: LocationTruthResult['segments'];
  /** Effektiv workday-start (ms). */
  workdayStartMs: number;
  /** Aktuell envelope-slut (ms) innan denna helper kör. */
  envelopeEndMs: number;
  /** True om dagtimern fortfarande är öppen. */
  envelopeIsOpen: boolean;
  /** Tröskel för icke-jobb-närvaro. Default 90 minuter. */
  thresholdMinutes?: number;
}

export interface ResolveEffectiveWorkdayEndResult {
  /** Föreslagen effektiv sluttidpunkt (ms). Null = ingen ändring. */
  effectiveWorkdayEndMs: number | null;
  /** True om wdEnd bör klippas. */
  shouldClamp: boolean;
  /** True om öppen timer ska markeras som "ignorerad efter inferred end". */
  shouldClampOpenTimer: boolean;
  endReason: DayEndStopReason | null;
  confidence: DayEndStopConfidence;
  /** ISO-strängar för diagnostik. */
  lastWorkEvidenceAt: string | null;
  firstNonWorkAfterWorkAt: string | null;
  /** Antal minuter icke-jobb-närvaro efter sista jobb. 0 om ingen non-work. */
  nonWorkDurationMinutes: number;
  evidence: string[];
}

// ─── Klassning av LT-segment ─────────────────────────────────────────────
type EvidenceKind = 'work' | 'non_work_private' | 'non_work_unknown' | 'movement' | 'ignore';

const WORK_TARGET_TYPES: ReadonlySet<LocationTruthTargetType> = new Set<LocationTruthTargetType>([
  'warehouse',
  'organization_location',
  'supplier',
  'large_project',
  'project',
  'booking',
]);

function classifySegment(seg: LocationTruthResult['segments'][number]): EvidenceKind {
  if (seg.finalType === 'movement') return 'movement';
  if (seg.finalType === 'private_residence') return 'non_work_private';

  const matched = seg.businessContext?.matchedTarget ?? seg.matchedTarget;
  if (matched && WORK_TARGET_TYPES.has(matched.targetType)) return 'work';

  // known_site/known_address utan target eller okänd → behandlas som
  // icke-jobb-okänt om vi befinner oss där efter sista jobb.
  if (
    seg.finalType === 'known_site' ||
    seg.finalType === 'known_address' ||
    seg.finalType === 'unresolved_location' ||
    seg.finalType === 'needs_location_review'
  ) {
    return 'non_work_unknown';
  }
  return 'ignore';
}

export function resolveEffectiveWorkdayEndFromEvidence(
  input: ResolveEffectiveWorkdayEndInput,
): ResolveEffectiveWorkdayEndResult {
  const threshold = (input.thresholdMinutes ?? 90) * 60_000;
  const wdStart = input.workdayStartMs;
  const wdEnd = input.envelopeEndMs;

  const sorted = [...input.ltSegments]
    .filter((s) => !!s.startAt && !!s.endAt)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  // Hitta sista work-evidence segment (slutar inom envelope).
  let lastWorkEndMs: number | null = null;
  let lastWorkEndIso: string | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i];
    if (classifySegment(s) !== 'work') continue;
    const startMs = Date.parse(s.startAt);
    if (startMs >= wdEnd) continue; // helt efter envelope
    const endMs = Math.min(Date.parse(s.endAt), wdEnd);
    if (endMs <= wdStart) continue; // helt före envelope
    lastWorkEndMs = endMs;
    lastWorkEndIso = new Date(endMs).toISOString();
    break;
  }

  // Beräkna sammanlagd non-work-närvaro efter lastWorkEndMs.
  // Om ingen work-evidence finns alls: räkna non-work-närvaro från wdStart.
  const startProbeMs = lastWorkEndMs ?? wdStart;
  let firstNonWorkAfterMs: number | null = null;
  let nonWorkMinutes = 0;
  let hasWorkAfterProbe = false;
  let nonWorkKind: 'private' | 'unknown' | 'mixed' | null = null;
  let lastNonWorkSampleEndMs: number | null = null;

  for (const s of sorted) {
    const segStart = Date.parse(s.startAt);
    const segEnd = Date.parse(s.endAt);
    if (segEnd <= startProbeMs) continue;
    if (segStart >= wdEnd) continue;
    const kind = classifySegment(s);
    if (kind === 'movement' || kind === 'ignore') continue;

    const clippedStart = Math.max(segStart, startProbeMs);
    const clippedEnd = Math.min(segEnd, wdEnd);
    if (clippedEnd <= clippedStart) continue;

    if (kind === 'work') {
      hasWorkAfterProbe = true;
      // Ny work-evidence — reset (vi söker stop EFTER sista jobb).
      nonWorkMinutes = 0;
      firstNonWorkAfterMs = null;
      nonWorkKind = null;
      lastNonWorkSampleEndMs = null;
      continue;
    }

    // non_work_private / non_work_unknown
    if (firstNonWorkAfterMs === null) firstNonWorkAfterMs = clippedStart;
    nonWorkMinutes += Math.round((clippedEnd - clippedStart) / 60_000);
    lastNonWorkSampleEndMs = clippedEnd;
    if (nonWorkKind === null) {
      nonWorkKind = kind === 'non_work_private' ? 'private' : 'unknown';
    } else if (
      (nonWorkKind === 'private' && kind === 'non_work_unknown') ||
      (nonWorkKind === 'unknown' && kind === 'non_work_private')
    ) {
      nonWorkKind = 'mixed';
    }
  }

  const evidence: string[] = [];
  evidence.push(`last_work_evidence_at=${lastWorkEndIso ?? '∅'}`);
  evidence.push(
    `first_non_work_after_work_at=${
      firstNonWorkAfterMs !== null ? new Date(firstNonWorkAfterMs).toISOString() : '∅'
    }`,
  );
  evidence.push(`non_work_duration_minutes=${nonWorkMinutes}`);

  // ── Inga icke-jobb-bevis eller fortsatt jobb efter probe → ingen clamp ──
  if (hasWorkAfterProbe || firstNonWorkAfterMs === null || nonWorkMinutes * 60_000 <= threshold) {
    return {
      effectiveWorkdayEndMs: null,
      shouldClamp: false,
      shouldClampOpenTimer: false,
      endReason: null,
      confidence: 'high',
      lastWorkEvidenceAt: lastWorkEndIso,
      firstNonWorkAfterWorkAt:
        firstNonWorkAfterMs !== null ? new Date(firstNonWorkAfterMs).toISOString() : null,
      nonWorkDurationMinutes: nonWorkMinutes,
      evidence,
    };
  }

  // ── Vi ska clampa ───────────────────────────────────────────────────────
  // Sluttidpunkt = sista work-evidence-end ELLER firstNonWorkAfter (om inget jobb).
  const effectiveEndMs = lastWorkEndMs ?? firstNonWorkAfterMs;
  if (effectiveEndMs === null) {
    // Defensivt: vi har non-work men kan inte avgöra start → ingen clamp.
    return {
      effectiveWorkdayEndMs: null,
      shouldClamp: false,
      shouldClampOpenTimer: false,
      endReason: null,
      confidence: 'low',
      lastWorkEvidenceAt: null,
      firstNonWorkAfterWorkAt:
        firstNonWorkAfterMs !== null ? new Date(firstNonWorkAfterMs).toISOString() : null,
      nonWorkDurationMinutes: nonWorkMinutes,
      evidence,
    };
  }

  // Endast clampa om den faktiskt minskar wdEnd.
  if (effectiveEndMs >= wdEnd) {
    return {
      effectiveWorkdayEndMs: null,
      shouldClamp: false,
      shouldClampOpenTimer: false,
      endReason: null,
      confidence: 'high',
      lastWorkEvidenceAt: lastWorkEndIso,
      firstNonWorkAfterWorkAt: new Date(firstNonWorkAfterMs).toISOString(),
      nonWorkDurationMinutes: nonWorkMinutes,
      evidence,
    };
  }

  let endReason: DayEndStopReason;
  let confidence: DayEndStopConfidence = 'high';
  if (lastWorkEndMs === null) {
    endReason = 'no_work_evidence_after_last_work_over_90m';
    confidence = 'medium';
  } else if (nonWorkKind === 'private') {
    endReason = 'home_after_last_work_over_90m';
  } else if (nonWorkKind === 'mixed') {
    endReason = 'private_after_last_work_over_90m';
  } else {
    endReason = 'non_work_location_after_last_work_over_90m';
    confidence = 'medium';
  }

  return {
    effectiveWorkdayEndMs: effectiveEndMs,
    shouldClamp: true,
    shouldClampOpenTimer: input.envelopeIsOpen,
    endReason,
    confidence,
    lastWorkEvidenceAt: lastWorkEndIso,
    firstNonWorkAfterWorkAt: new Date(firstNonWorkAfterMs).toISOString(),
    nonWorkDurationMinutes: nonWorkMinutes,
    evidence,
  };
}
