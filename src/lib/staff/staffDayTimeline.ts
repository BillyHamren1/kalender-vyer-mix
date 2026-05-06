/**
 * StaffDayTimeline — KANONISK UI-MODELL för admin-tidrapportering.
 * ────────────────────────────────────────────────────────────────
 * BESLUT (2026-05-06): Huvudvyn för tidrapportering ska INTE längre visa
 * råa tabellrader (location_time_entries, time_reports, travel_time_logs,
 * assistant_events). De lever kvar som input/bevisning men är inte längre
 * huvudobjekt i UI.
 *
 * Den här filen är en TUNN FASAD ovanpå:
 *   - buildActualStaffDayModel  → all evidens samlad
 *   - buildDayBlockTimeline     → presence/journey/gap-block (huvudjournal)
 *
 * Den projicerar ner till exakt det fältset som ny UI ska konsumera:
 *
 *   StaffDayTimeline {
 *     staff_id, staff_name, date,
 *     workday_start, workday_end, status,
 *     payable_minutes,
 *     segments: StaffDaySegment[],
 *     review_required, review_count,
 *   }
 *
 *   StaffDaySegment.kind ∈ project | travel | warehouse | break | other | unknown
 *
 * INVARIANTER:
 *   - Pure / UI-agnostic. Ingen DB, ingen React, ingen Date.now().
 *   - Bygger ALDRIG nya fakta — bara projicerar befintlig modell.
 *   - Får aldrig blandas med rå-data: vyer som vill ha bevisning öppnar
 *     en separat audit-flik som läser ActualStaffDayModel direkt.
 *
 * Se mem://constraints/staff-day-timeline-canonical-v1.
 */

import type {
  ActualStaffDayModel,
  ActualWorkdayFlagInput,
} from './actualStaffDayModel';
import type {
  DayBlock,
  PresenceBlock,
  JourneyBlock,
  GapBlock,
} from './dayBlockTimeline';

// ── Output-typer ─────────────────────────────────────────────────────

export type StaffDaySegmentKind =
  | 'project'
  | 'travel'
  | 'warehouse'
  | 'break'
  | 'other'
  | 'unknown';

export type StaffDayStatus =
  | 'no_workday'        // ingen workday och inga segments alls
  | 'open'              // workday pågår eller sista segment ongoing
  | 'closed'            // workday avslutad och inga reviews
  | 'review_required';  // något kräver attention (unknown/anomaly/oresolved flag)

export interface StaffDaySegment {
  id: string;
  kind: StaffDaySegmentKind;
  /** ISO. */
  startIso: string;
  /** ISO eller null om pågående. */
  endIso: string | null;
  durationMin: number;
  /** Mänsklig label, t.ex. projektnamn / "Resa" / "Lager". */
  label: string;
  /** Sekundär rad — adress, från→till, etc. */
  subtitle: string | null;
  /** Pågår fortfarande? */
  ongoing: boolean;
  /** True om segmentet kräver granskning (okänd plats, låg confidence, anomaly). */
  reviewRequired: boolean;
  /**
   * Pekare tillbaka till källblocket — vyer som vill öppna detaljrutan
   * (audit/bevisning) får sourceBlockId och kan slå upp i DayBlock[].
   */
  sourceBlockId: string;
  /**
   * Räknas tiden som lönegrundande / fakturerbar?
   * Beslut: project + warehouse + travel = ja. break/other/unknown = nej.
   * (Lön exakt = workday-summan, men payable_minutes används som
   * översiktsmått i listor.)
   */
  payable: boolean;
}

export interface StaffDayTimeline {
  staff_id: string;
  staff_name: string;
  /** YYYY-MM-DD lokalt. */
  date: string;
  workday_start: string | null;
  workday_end: string | null;
  status: StaffDayStatus;
  /** Summan av payable segmenters minuter. */
  payable_minutes: number;
  segments: StaffDaySegment[];
  review_required: boolean;
  /** Antal saker som behöver granskas (okända block + oresolved flags + anomalies). */
  review_count: number;
}

export interface BuildStaffDayTimelineInput {
  staff_id: string;
  staff_name: string;
  /** Hela evidens-modellen för dagen. */
  model: ActualStaffDayModel;
  /** Färdigberäknade block (huvudjournal). */
  blocks: DayBlock[];
  /** workday_flags för dagen — drivs review_count. */
  flags?: ActualWorkdayFlagInput[];
}

// ── Mapping ──────────────────────────────────────────────────────────

const isPresence = (b: DayBlock): b is PresenceBlock => b.kind === 'presence';
const isJourney = (b: DayBlock): b is JourneyBlock => b.kind === 'journey';
const isGap = (b: DayBlock): b is GapBlock => b.kind === 'gap';

/**
 * Mappar en PresenceBlock till segmentKind.
 *  - project        → 'project'
 *  - location       → 'warehouse' (lager/fixed location). Mobile/admin tolkar
 *                     alla "location"-presence som warehouse-tid; specifika
 *                     organisationer kan ha andra fixed locations men de
 *                     räknas operativt som warehouse-tid i denna projektion.
 *  - unknown        → 'unknown' (kräver review)
 */
function presenceToKind(b: PresenceBlock): StaffDaySegmentKind {
  if (b.presenceKind === 'project') return 'project';
  if (b.presenceKind === 'location') return 'warehouse';
  return 'unknown';
}

function presenceToSegment(b: PresenceBlock): StaffDaySegment {
  const kind = presenceToKind(b);
  return {
    id: b.id,
    kind,
    startIso: b.startIso,
    endIso: b.endIso,
    durationMin: b.durationMin,
    label: b.resolvedPlace?.label ?? b.title,
    subtitle: b.subtitle,
    ongoing: b.ongoing,
    reviewRequired: b.requiresReview || kind === 'unknown',
    sourceBlockId: b.id,
    payable: kind === 'project' || kind === 'warehouse',
  };
}

function journeyToSegment(b: JourneyBlock): StaffDaySegment {
  const from = b.fromPlace?.label ?? b.fromLabel ?? '';
  const to = b.toPlace?.label ?? b.toLabel ?? '';
  const subtitle = from || to ? `${from} → ${to}` : null;
  return {
    id: b.id,
    kind: 'travel',
    startIso: b.startIso,
    endIso: b.endIso,
    durationMin: b.durationMin,
    label: 'Resa',
    subtitle,
    ongoing: false,
    reviewRequired: b.uncertain,
    sourceBlockId: b.id,
    payable: true,
  };
}

function gapToSegment(b: GapBlock): StaffDaySegment {
  return {
    id: b.id,
    kind: 'unknown',
    startIso: b.startIso,
    endIso: b.endIso,
    durationMin: b.durationMin,
    label: b.expectedLabel ?? 'Glapp',
    subtitle: b.explanation,
    ongoing: false,
    reviewRequired: true,
    sourceBlockId: b.id,
    payable: false,
  };
}

// ── Motor ────────────────────────────────────────────────────────────

export function buildStaffDayTimeline(
  input: BuildStaffDayTimelineInput,
): StaffDayTimeline {
  const { staff_id, staff_name, model, blocks, flags = [] } = input;

  const segments: StaffDaySegment[] = blocks.map((b) => {
    if (isPresence(b)) return presenceToSegment(b);
    if (isJourney(b)) return journeyToSegment(b);
    if (isGap(b)) return gapToSegment(b);
    // exhaustive fallback
    const any = b as { id: string; startIso: string; endIso: string };
    return {
      id: any.id,
      kind: 'other',
      startIso: any.startIso,
      endIso: any.endIso ?? null,
      durationMin: 0,
      label: 'Okänt',
      subtitle: null,
      ongoing: false,
      reviewRequired: true,
      sourceBlockId: any.id,
      payable: false,
    };
  });

  segments.sort((a, b) => a.startIso.localeCompare(b.startIso));

  const payable_minutes = segments
    .filter((s) => s.payable)
    .reduce((sum, s) => sum + (s.durationMin || 0), 0);

  const wd = model.reportState.workday;
  const workday_start = wd?.started_at ?? model.proposedReport.proposedWorkdayStart ?? null;
  const workday_end = wd?.ended_at ?? null;

  const unresolvedFlagCount = flags.filter((f) => !f.resolved).length;
  const anomalyCount = model.proposedReport.anomalies.length;
  const segmentReviewCount = segments.filter((s) => s.reviewRequired).length;
  const review_count = unresolvedFlagCount + anomalyCount + segmentReviewCount;
  const review_required = review_count > 0;

  let status: StaffDayStatus;
  if (!wd && segments.length === 0) {
    status = 'no_workday';
  } else if (review_required) {
    status = 'review_required';
  } else if (workday_end && !segments.some((s) => s.ongoing)) {
    status = 'closed';
  } else {
    status = 'open';
  }

  return {
    staff_id,
    staff_name,
    date: model.date,
    workday_start,
    workday_end,
    status,
    payable_minutes,
    segments,
    review_required,
    review_count,
  };
}
