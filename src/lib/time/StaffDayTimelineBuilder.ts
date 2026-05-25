/**
 * StaffDayTimelineBuilder — CENTRAL builder för StaffDayTimeline.
 * ──────────────────────────────────────────────────────────────────
 * BESLUT (2026-05-06):
 *   "Ingen UI-komponent får själv tolka raw data längre."
 *
 *   ALLA admin-vyer för tidrapportering ska gå via denna builder och
 *   få ut en kanonisk `StaffDayTimeline`. Råa tabeller
 *   (workday/time_reports/travel/lte/assistant) skickas in som input
 *   och sparas i `evidence[]` för audit — men renderas aldrig som
 *   segment direkt.
 *
 * INPUT (allt valfritt utom date+staff):
 *   - workday              (workdays-rad för dagen)
 *   - timeReports          (time_reports)
 *   - travelLogs           (travel_time_logs)
 *   - locationEntries      (location_time_entries — timer/presence)
 *   - assistantEvents      (workday-assistant signals)
 *   - plannedAssignments   (planning/BSA)
 *
 * OUTPUT: ÉN `StaffDayTimeline` — exakt samma typ för alla personer.
 *
 * REGLER:
 *  1. workday.start/end är HUVUDRAM för dagen.
 *  2. Saknas workday MEN det finns starka signaler (timer eller TR) ⇒
 *     föreslå start/slut från första/sista signal, sätt
 *     `workday_suggested=true` och `review_required=true`.
 *  3. Segments ska täcka dagen så gott det går — gap mellan presence
 *     blir `unknown`-segment, INTE fel.
 *  4. Råa rader sparas i `evidence`. UI får aldrig bygga segments av dem.
 *  5. Pure / UI-agnostic. Ingen DB. Ingen React.
 *
 * Se mem://constraints/staff-day-timeline-canonical-v1.
 */

import type {
  StaffDayTimeline,
  StaffDaySegment,
  StaffDaySegmentKind,
  StaffDayStatus,
  StaffDayEvidence,
} from '@/lib/staff/staffDayTimeline';
import { formatStockholmHm, formatStockholmHms } from '../staff/formatStockholmTime';
import { resolveTravelLabels } from '../staff/travelLabel';

// ── Råa input-typer ──────────────────────────────────────────────────

/**
 * Markörer för "syntetiska" / system-genererade rader. När `synthetic=true`
 * får raden ALDRIG bli ett huvudsegment. Den ligger kvar i `evidence`,
 * påverkar `review_required`, och kan föreslå start/slut via workday-envelope —
 * men visas inte som arbetspass i huvudvyn.
 *
 * `autoOrigin` används för att flagga vad systemet gjorde (auto_repair,
 * server_background_gps_backfill, watchdog, ...). Texten visas bara i
 * RawEvidenceDrawer, aldrig i huvudvyn.
 */
export type AutoOriginCode =
  | 'auto_repair'
  | 'server_background_gps_backfill'
  | 'server_background_gps'
  | 'watchdog'
  | 'cron'
  | 'ai_reconciled'
  | 'gap_derived'
  | string;

export interface BuilderWorkdayInput {
  id: string;
  started_at: string;
  ended_at: string | null;
  /** True om workdayen skapats av auto-repair / cron / watchdog. Påverkar inte
   *  envelope-rendering (workday är fortfarande ram), men `autoOrigin` lyfts
   *  till evidence/notes så admin ser hur den uppstod. */
  autoOrigin?: AutoOriginCode | null;
}

export interface BuilderTimeReportInput {
  id: string;
  start_iso: string | null;
  end_iso: string | null;
  hours: number;
  label: string;
  /** Källkategori för segment-mappning. */
  category?: 'project' | 'location' | 'lager' | 'travel' | 'other';
  approved?: boolean;
  is_subdivision?: boolean;
  /** True ⇒ raden visas inte som segment, går bara till evidence + review. */
  synthetic?: boolean;
  autoOrigin?: AutoOriginCode | null;
}

export interface BuilderTravelLogInput {
  id: string;
  start_iso: string | null;
  end_iso: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  fromLatitude?: number | null;
  fromLongitude?: number | null;
  toLatitude?: number | null;
  toLongitude?: number | null;
  description?: string | null;
  approved?: boolean;
  destinationBookingId?: string | null;
  synthetic?: boolean;
  autoOrigin?: AutoOriginCode | null;
}

export interface BuilderLocationEntryInput {
  id: string;
  entered_at: string;
  exited_at: string | null;
  label: string;
  /** Promotade location-timers skapar TR ⇒ markera så vi inte dubbelräknar. */
  reportedAsDistribution?: boolean;
  /** True för rena presence-stämplingar (ej lönegrundande). */
  presenceOnly?: boolean;
  /** True ⇒ raden visas inte som segment, går bara till evidence + review. */
  synthetic?: boolean;
  autoOrigin?: AutoOriginCode | null;
}

export interface BuilderAssistantEventInput {
  id: string;
  at: string;
  kind: string;
  acknowledged?: boolean;
}

export interface BuilderPlannedAssignmentInput {
  id: string;
  plannedStart: string;
  plannedEnd?: string | null;
  label: string;
}

export interface BuildStaffDayTimelineInput {
  staff_id: string;
  staff_name: string;
  /** Lokalt datum (YYYY-MM-DD) som dagen avser. */
  date: string;
  workday?: BuilderWorkdayInput | null;
  timeReports?: BuilderTimeReportInput[];
  travelLogs?: BuilderTravelLogInput[];
  locationEntries?: BuilderLocationEntryInput[];
  assistantEvents?: BuilderAssistantEventInput[];
  plannedAssignments?: BuilderPlannedAssignmentInput[];
  /** Test-injectable clock. */
  now?: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────

const MS_MIN = 60_000;
const STRONG_GPS_TIMER_MIN = 10; // ≥10 min timer/TR räknas som "stark signal"

const safeMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

const minutesBetween = (aIso: string, bIso: string | null, fallbackNow: number): number => {
  const a = safeMs(aIso);
  const b = bIso ? safeMs(bIso) : fallbackNow;
  if (a == null || b == null || b <= a) return 0;
  return Math.round((b - a) / MS_MIN);
};

const categoryToKind = (cat: BuilderTimeReportInput['category']): StaffDaySegmentKind => {
  switch (cat) {
    case 'project': return 'project';
    case 'location':
    case 'lager': return 'warehouse';
    case 'travel': return 'travel';
    case 'other': return 'other';
    default: return 'project';
  }
};

interface RawSegment extends StaffDaySegment {
  /** Intern: vilken källrad byggde detta? — endast för dedup/filter. */
  _sourceTable: 'time_report' | 'travel_log' | 'location_entry';
  _sourceRowId: string;
}

// ── Segment-byggare per källa ────────────────────────────────────────

function timeReportToSegment(
  tr: BuilderTimeReportInput,
  now: number,
): RawSegment | null {
  if (tr.is_subdivision) return null;
  if (tr.synthetic) return null; // syntetisk: går till evidence, inte segment
  if (!tr.start_iso) return null;
  const endIso = tr.end_iso;
  const ongoing = !endIso;
  const durationMin = minutesBetween(tr.start_iso, endIso, now);
  if (durationMin <= 0 && !ongoing) return null;
  const kind = categoryToKind(tr.category);
  return {
    id: `tr:${tr.id}`,
    kind,
    startIso: tr.start_iso,
    endIso,
    durationMin,
    label: tr.label || (kind === 'travel' ? 'Resa' : kind === 'warehouse' ? 'Lager' : 'Aktivitet'),
    subtitle: null,
    ongoing,
    reviewRequired: false,
    sourceBlockId: `tr:${tr.id}`,
    payable: kind === 'project' || kind === 'warehouse' || kind === 'travel',
    _sourceTable: 'time_report',
    _sourceRowId: tr.id,
  };
}

function travelLogToSegment(
  tl: BuilderTravelLogInput,
  now: number,
): RawSegment | null {
  if (tl.synthetic) return null;
  if (!tl.start_iso) return null;
  const ongoing = !tl.end_iso;
  const durationMin = minutesBetween(tl.start_iso, tl.end_iso, now);
  if (durationMin <= 0 && !ongoing) return null;
  const missingDestination = !tl.destinationBookingId && !tl.toAddress;
  const reviewRequired = missingDestination || !tl.approved;
  // Fyll i saknad from/to genom att parsa "Gap: X → Y (N min)" ur description.
  const labels = resolveTravelLabels({
    from_address: tl.fromAddress ?? null,
    to_address: tl.toAddress ?? null,
    description: (tl as any).description ?? null,
  });
  const subtitle = labels.fromLabel || labels.toLabel
    ? `${labels.fromLabel ?? '—'} → ${labels.toLabel ?? '—'}`
    : null;
  return {
    id: `travel:${tl.id}`,
    kind: 'travel',
    startIso: tl.start_iso,
    endIso: tl.end_iso,
    durationMin,
    label: 'Resa',
    subtitle,
    ongoing,
    reviewRequired,
    sourceBlockId: `travel:${tl.id}`,
    payable: !!tl.approved,
    _sourceTable: 'travel_log',
    _sourceRowId: tl.id,
  };
}

function locationEntryToSegment(
  lte: BuilderLocationEntryInput,
  now: number,
): RawSegment | null {
  // Promotade location-timers blir TR ⇒ skippa här för att undvika dubbel.
  if (lte.reportedAsDistribution) return null;
  if (lte.synthetic) return null; // watchdog/auto_assigned/clamped → bara evidence
  const ongoing = !lte.exited_at;
  const durationMin = minutesBetween(lte.entered_at, lte.exited_at, now);
  if (durationMin <= 0 && !ongoing) return null;
  const presence = lte.presenceOnly !== false;
  return {
    id: `lte:${lte.id}`,
    kind: presence ? 'warehouse' : 'project',
    startIso: lte.entered_at,
    endIso: lte.exited_at,
    durationMin,
    label: lte.label || 'Plats',
    subtitle: presence ? 'Närvaro (ej lönegrundande)' : null,
    ongoing,
    reviewRequired: false,
    sourceBlockId: `lte:${lte.id}`,
    payable: !presence,
    _sourceTable: 'location_entry',
    _sourceRowId: lte.id,
  };
}

// ── Dedup: TR vinner över LTE som överlappar samma fönster ──────────

function dedupSegments(segments: RawSegment[]): RawSegment[] {
  const trs = segments.filter((s) => s._sourceTable === 'time_report');
  const others = segments.filter((s) => s._sourceTable !== 'time_report');
  const overlaps = (a: RawSegment, b: RawSegment): boolean => {
    const aStart = safeMs(a.startIso) ?? 0;
    const aEnd = safeMs(a.endIso) ?? Number.POSITIVE_INFINITY;
    const bStart = safeMs(b.startIso) ?? 0;
    const bEnd = safeMs(b.endIso) ?? Number.POSITIVE_INFINITY;
    return aStart < bEnd && bStart < aEnd;
  };
  const filteredOthers = others.filter((o) => !trs.some((tr) => overlaps(tr, o)));
  return [...trs, ...filteredOthers];
}

// ── Gap-fyllning: täck workday med 'unknown'-segment där inget annat finns ─
//
// REGEL (2026-05-07): Saknad ping är INTE ett tidsglapp.
// När arbetsdagen är öppen och telefonen är tyst skapar vi inte längre
// trailing "Glapp / Ingen registrerad aktivitet". Inre tysta perioder
// blir `signal_stale` (passiv signal-status, ingen review, ingen avdrag).

function fillGapsAsUnknown(
  segments: RawSegment[],
  envelopeStart: string | null,
  envelopeEnd: string | null,
  now: number,
): StaffDaySegment[] {
  const sorted = [...segments].sort((a, b) =>
    a.startIso.localeCompare(b.startIso),
  );
  if (!envelopeStart) return sorted;
  const envStartMs = safeMs(envelopeStart)!;
  const envEndMs = envelopeEnd ? safeMs(envelopeEnd)! : now;
  if (envEndMs <= envStartMs) return sorted;
  const workdayOpen = !envelopeEnd;

  const result: StaffDaySegment[] = [];
  let cursor = envStartMs;
  for (const seg of sorted) {
    const segStart = safeMs(seg.startIso) ?? cursor;
    if (segStart > cursor + MS_MIN) {
      const startIso = new Date(cursor).toISOString();
      const endIso = new Date(segStart).toISOString();
      result.push({
        id: `signal:${cursor}-${segStart}`,
        kind: 'signal_stale',
        startIso,
        endIso,
        durationMin: Math.round((segStart - cursor) / MS_MIN),
        label: 'Signal saknas',
        subtitle: `Senaste signal ${formatStockholmHm(cursor)}`,
        ongoing: false,
        reviewRequired: false,
        sourceBlockId: `signal:${cursor}`,
        payable: false,
      });
    }
    result.push(seg);
    const segEnd = safeMs(seg.endIso) ?? envEndMs;
    if (segEnd > cursor) cursor = segEnd;
  }
  // Trailing tyst period: bara visa signal-status om workday är ÖPPEN —
  // aldrig som "Glapp". Stängd workday: ingen trailing alls (tiden ligger
  // i workday-summan, ingen behöver granska).
  if (workdayOpen && envEndMs > cursor + MS_MIN) {
    const startIso = new Date(cursor).toISOString();
    const endIso = new Date(envEndMs).toISOString();
    result.push({
      id: `signal:${cursor}-${envEndMs}`,
      kind: 'signal_stale',
      startIso,
      endIso,
      durationMin: Math.round((envEndMs - cursor) / MS_MIN),
      label: 'Signal saknas',
      subtitle: `Senaste signal ${formatStockholmHm(cursor)} · arbetsdag pågår`,
      ongoing: true,
      reviewRequired: false,
      sourceBlockId: `signal:${cursor}-end`,
      payable: false,
    });
  }
  // Strippa interna fält
  return result.map((s) => {
    const { _sourceTable, _sourceRowId, ...clean } = s as RawSegment & StaffDaySegment;
    void _sourceTable;
    void _sourceRowId;
    return clean as StaffDaySegment;
  });
}

// ── Workday-envelope: ram + ev. förslag ───────────────────────────────

interface WorkdayEnvelope {
  start: string | null;
  end: string | null;
  suggested: boolean;
  notes: string[];
}

function deriveWorkdayEnvelope(
  workday: BuilderWorkdayInput | null | undefined,
  segments: RawSegment[],
): WorkdayEnvelope {
  if (workday) {
    return {
      start: workday.started_at,
      end: workday.ended_at,
      suggested: false,
      notes: [],
    };
  }
  const strong = segments.filter(
    (s) => (s._sourceTable === 'time_report' || s._sourceTable === 'location_entry')
      && s.durationMin >= STRONG_GPS_TIMER_MIN,
  );
  if (strong.length === 0) {
    return { start: null, end: null, suggested: false, notes: [] };
  }
  const sorted = [...strong].sort((a, b) => a.startIso.localeCompare(b.startIso));
  const start = sorted[0].startIso;
  const lastEnd = sorted
    .map((s) => s.endIso)
    .filter((e): e is string => !!e)
    .sort()
    .pop() ?? null;
  return {
    start,
    end: lastEnd,
    suggested: true,
    notes: ['Workday saknas — start/slut härlett från timer/tidrapport.'],
  };
}

// ── Main ─────────────────────────────────────────────────────────────

export function buildStaffDayTimelineFromRaw(
  input: BuildStaffDayTimelineInput,
): StaffDayTimeline {
  const now = (input.now ?? new Date()).getTime();

  const trSegments = (input.timeReports ?? [])
    .map((tr) => timeReportToSegment(tr, now))
    .filter((s): s is RawSegment => s !== null);

  const travelSegments = (input.travelLogs ?? [])
    .map((tl) => travelLogToSegment(tl, now))
    .filter((s): s is RawSegment => s !== null);

  const lteSegments = (input.locationEntries ?? [])
    .map((lte) => locationEntryToSegment(lte, now))
    .filter((s): s is RawSegment => s !== null);

  const merged = dedupSegments([...trSegments, ...travelSegments, ...lteSegments]);

  const envelope = deriveWorkdayEnvelope(input.workday, merged);

  const segments = fillGapsAsUnknown(merged, envelope.start, envelope.end, now);

  const payable_minutes = segments
    .filter((s) => s.payable)
    .reduce((sum, s) => sum + (s.durationMin || 0), 0);

  // Samla auto-origin / synthetic-noter — visas i drawer/evidence,
  // ALDRIG i huvudvyn. Räknas mot review_count.
  const autoOriginNotes: string[] = [];
  if (input.workday?.autoOrigin) {
    autoOriginNotes.push(`Arbetsdag skapad automatiskt (${input.workday.autoOrigin}).`);
  }
  const syntheticTr = (input.timeReports ?? []).filter((t) => t.synthetic);
  const syntheticLte = (input.locationEntries ?? []).filter((l) => l.synthetic);
  const syntheticTravel = (input.travelLogs ?? []).filter((t) => t.synthetic);
  if (syntheticTr.length) autoOriginNotes.push(`${syntheticTr.length} tidrapport(er) härledd från system (auto-repair/backfill) — visas inte som segment.`);
  if (syntheticLte.length) autoOriginNotes.push(`${syntheticLte.length} timer/närvaro stoppad av watchdog/clamp — visas inte som segment.`);
  if (syntheticTravel.length) autoOriginNotes.push(`${syntheticTravel.length} resa härledd från servermotor — visas inte som segment.`);

  const segmentReviewCount = segments.filter((s) => s.reviewRequired).length;
  const review_count =
    segmentReviewCount + (envelope.suggested ? 1 : 0) + autoOriginNotes.length;
  const review_required = review_count > 0;

  let status: StaffDayStatus;
  if (!input.workday && segments.length === 0) {
    status = 'no_workday';
  } else if (review_required) {
    status = 'review_required';
  } else if (envelope.end && !segments.some((s) => s.ongoing)) {
    status = 'closed';
  } else {
    status = 'open';
  }

  const evidence: StaffDayEvidence = {
    workdayRowIds: input.workday ? [input.workday.id] : [],
    timeReportIds: (input.timeReports ?? []).map((t) => t.id),
    travelLogIds: (input.travelLogs ?? []).map((t) => t.id),
    locationEntryIds: (input.locationEntries ?? []).map((l) => l.id),
    assistantEventIds: (input.assistantEvents ?? []).map((a) => a.id),
    notes: [...envelope.notes, ...autoOriginNotes],
  };

  return {
    staff_id: input.staff_id,
    staff_name: input.staff_name,
    date: input.date,
    workday_start: envelope.start,
    workday_end: envelope.end,
    workday_suggested: envelope.suggested,
    status,
    payable_minutes,
    segments,
    review_required,
    review_count,
    evidence,
  };
}
