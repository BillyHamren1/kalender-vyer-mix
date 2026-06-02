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
import { formatStockholmHm, formatStockholmHms } from './formatStockholmTime';

// ── Output-typer ─────────────────────────────────────────────────────

export type StaffDaySegmentKind =
  | 'project'
  | 'travel'
  | 'warehouse'
  | 'break'
  | 'other'
  | 'unknown'
  /**
   * Teknisk signal-status — telefonen har varit tyst under arbetsdagen.
   * INTE ett tidsglapp. Räknas inte av, kräver inte review, fortsätter
   * visa att arbetsdagen pågår.
   */
  | 'signal_stale';

export type StaffDayStatus =
  | 'no_workday'        // ingen workday och inga segments alls
  | 'open'              // workday pågår eller sista segment ongoing
  | 'closed'            // workday avslutad och inga reviews
  | 'review_required';  // något kräver attention (unknown/anomaly/oresolved flag)

/**
 * Allokeringsorsak för restidsblock — vilket jobb resans kostnad ska bokas på.
 * Se src/lib/staff/allocateTravelToProjects.ts.
 */
export type TravelAllocationReason =
  | 'travel_to_first_job'
  | 'travel_between_jobs_allocated_to_destination'
  | 'travel_after_last_job_allocated_to_last_job'
  | 'travel_to_private_not_allocated'
  | 'unresolved_travel_allocation';

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
  // ── Travel allocation (endast meningsfullt när kind === 'travel') ──────
  /** Projektets/jobbets id som restiden ska registreras på (om allokerad). */
  travelBelongsToProjectId?: string | null;
  /** Mänsklig projekt-/jobbtitel. */
  travelBelongsToProjectName?: string | null;
  /** Underliggande target-id (sourceBlockId för relaterad presence-segment). */
  travelBelongsToTargetId?: string | null;
  /** Mänsklig target-label. */
  travelBelongsToTargetName?: string | null;
  /** Varför restiden allokerades hit (eller varför inte). */
  travelAllocationReason?: TravelAllocationReason | null;
}

export interface StaffDayEvidence {
  /** Råa kvitton — får INTE renderas som segments. Endast audit/bevisning. */
  workdayRowIds?: string[];
  timeReportIds?: string[];
  travelLogIds?: string[];
  locationEntryIds?: string[];
  assistantEventIds?: string[];
  /** Frikopplade noteringar (ex. "GPS visade ankomst 06:42 men ingen workday öppen"). */
  notes?: string[];
}

export interface StaffDayTimeline {
  staff_id: string;
  staff_name: string;
  /** YYYY-MM-DD lokalt. */
  date: string;
  workday_start: string | null;
  workday_end: string | null;
  /** True när workday saknas men start/slut härleddes ur evidence (GPS/timer). */
  workday_suggested: boolean;
  status: StaffDayStatus;
  /** Summan av payable segmenters minuter. */
  payable_minutes: number;
  segments: StaffDaySegment[];
  review_required: boolean;
  /** Antal saker som behöver granskas (okända block + oresolved flags + anomalies). */
  review_count: number;
  /** Råa källrader — för audit/bevisning. UI får ALDRIG bygga segments av detta. */
  evidence: StaffDayEvidence;
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
  // Unknown presence visas i huvudvyn som "Ej fördelat" — aldrig tekniska
  // labels eller råa platsnamn. Råetiketten finns kvar i evidence/drawer.
  const label =
    kind === 'unknown'
      ? 'Ej fördelat'
      : (b.resolvedPlace?.label ?? b.title);
  return {
    id: b.id,
    kind,
    startIso: b.startIso,
    endIso: b.endIso,
    durationMin: b.durationMin,
    label,
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
  // REGEL: ingen ping ≠ glapp. no_signal blir teknisk signal-status,
  // inte review-krävande "Ej fördelat".
  if (b.reason === 'no_signal') {
    const lastSignal = formatStockholmHm(b.startIso);
    return {
      id: b.id,
      kind: 'signal_stale',
      startIso: b.startIso,
      endIso: b.endIso,
      durationMin: b.durationMin,
      label: 'Signal saknas',
      subtitle: `Senaste signal ${lastSignal} · arbetsdag pågår`,
      ongoing: false,
      reviewRequired: false,
      sourceBlockId: b.id,
      payable: false,
    };
  }
  return {
    id: b.id,
    kind: 'unknown',
    startIso: b.startIso,
    endIso: b.endIso,
    durationMin: b.durationMin,
    // Glapp/oallokerad tid visas som "Ej fördelat" i huvudvyn.
    // Tekniska orsaker (gps_lost, server_background_gps_backfill etc.)
    // exponeras endast i RawEvidenceDrawer.
    label: 'Ej fördelat',
    subtitle: null,
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

  // Travel allocation — kompletterar varje travel-segment med projekt-/jobbtillhörighet.
  // Pure helper, ändrar inte kind/durations.
  const blocksById = new Map<string, typeof blocks[number]>();
  for (const b of blocks) blocksById.set(b.id, b);
  const allocated = allocateTravelToProjects(segments, blocksById);
  // Skriv om label/subtitle på travel-segmenten enligt allokering.
  const finalSegments = allocated.map((s) => (s.kind === 'travel' ? applyTravelAllocationToLabel(s) : s));

  const payable_minutes = finalSegments
    .filter((s) => s.payable)
    .reduce((sum, s) => sum + (s.durationMin || 0), 0);

  const wd = model.reportState.workday;
  const workday_start = wd?.started_at ?? model.proposedReport.proposedWorkdayStart ?? null;
  const workday_end = wd?.ended_at ?? null;

  const unresolvedFlagCount = flags.filter((f) => !f.resolved).length;
  const anomalyCount = model.proposedReport.anomalies.length;
  const segmentReviewCount = finalSegments.filter((s) => s.reviewRequired).length;
  const review_count = unresolvedFlagCount + anomalyCount + segmentReviewCount;
  const review_required = review_count > 0;

  let status: StaffDayStatus;
  if (!wd && finalSegments.length === 0) {
    status = 'no_workday';
  } else if (review_required) {
    status = 'review_required';
  } else if (workday_end && !finalSegments.some((s) => s.ongoing)) {
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
    workday_suggested: !wd && workday_start != null,
    status,
    payable_minutes,
    segments,
    review_required,
    review_count,
    evidence: {
      workdayRowIds: wd ? [wd.id] : [],
      timeReportIds: model.reportState.timeReports.map((r) => r.id),
      travelLogIds: model.reportState.travelLogs.map((t) => t.id),
      locationEntryIds: model.reportState.locationEntries.map((l) => l.id),
      assistantEventIds: [],
      notes: [],
    },
  };
}
