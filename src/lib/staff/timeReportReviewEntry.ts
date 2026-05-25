/**
 * TimeReportReviewEntry
 *
 * Payroll-style model that turns the raw lists of work entries, travel logs
 * and the workday window (start → end) into a clean, ordered list of
 * "review entries" that an admin can approve, edit or annotate.
 *
 * The intent is that the UI never renders raw GPS rows directly — it renders
 * this model. GPS / pings stay in a debug drawer behind a toggle.
 *
 * Inputs come from `DailyOverviewDialog` (already aggregated client side).
 *
 * Three entry kinds:
 *   - work     → time_reports row (project / location)
 *   - travel   → travel_time_logs row ("Resa: A → B")
 *   - gap      → unregistered time between adjacent entries (only when
 *                significant — see GAP_MIN_MINUTES). Synthetic, not stored.
 *
 * Status:
 *   - approved      → row.approved === true
 *   - ongoing       → no end_time
 *   - needs_review  → suspiciously short, missing destination, or gap
 *   - ok            → everything looks good
 *
 * Strict rule: this module never invents work time. Gaps are reported as
 * "Oregistrerad tid" — they do NOT add to paid hours.
 */

import { classifyReviewRow, type ReviewRowKind } from './reviewRowKind';

export type ReviewEntryKind = 'work' | 'travel' | 'gap';
export type ReviewEntryStatus = 'ok' | 'needs_review' | 'ongoing' | 'approved';

export interface ReviewWorkInput {
  id: string;
  start_time: string | null;   // ISO or 'HH:mm[:ss]'
  end_time: string | null;
  hours_worked: number;
  booking_client: string;
  booking_number: string | null;
  description: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  ongoing?: boolean;
  approved?: boolean;
  /** Source row key, used for "Justera" deep-link. */
  source: 'time_report' | 'location_entry';
}

export interface ReviewTravelInput {
  id: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  from_address: string | null;
  to_address: string | null;
  from_latitude: number | null;
  from_longitude: number | null;
  to_latitude: number | null;
  to_longitude: number | null;
  destination_booking_id: string | null;
  /** Beskrivning från travel_time_logs (används för "Gap: X → Y"-fallback). */
  description?: string | null;
}

export interface TimeReportReviewEntry {
  /** Stable key for React lists. */
  key: string;
  kind: ReviewEntryKind;
  /** Explicit row taxonomy used to decide which UI section the row belongs in. */
  rowKind: ReviewRowKind;
  /** Primary label (project, location, or "Resa: A → B"). */
  label: string;
  /** Optional secondary line (booking number, address, hint). */
  sublabel?: string;
  startIso: string | null;
  endIso: string | null;
  /** Hours that this entry contributes to paid time. Always 0 for `gap`. */
  paidHours: number;
  durationMinutes: number;
  status: ReviewEntryStatus;
  /** Human-readable warnings shown inline on the row. */
  warnings: string[];
  /** Original ids so action handlers can edit/approve the underlying record. */
  refs: {
    timeReportId?: string;
    travelLogId?: string;
    locationEntryId?: string;
  };
  /** GPS underlay for the expanded drawer ("Visa GPS-underlag"). */
  gps?: {
    fromLat: number | null;
    fromLng: number | null;
    toLat: number | null;
    toLng: number | null;
  };
}

export interface BuildReviewEntriesInput {
  work: ReviewWorkInput[];
  travel: ReviewTravelInput[];
  /** Optional workday window (used to compute totals + leading/trailing gaps). */
  workday?: { start: string | null; end: string | null } | null;
}

export interface ReviewEntriesSummary {
  workdayStart: string | null;
  workdayEnd: string | null;
  paidHours: number;
  workHours: number;
  travelHours: number;
  gapMinutes: number;
  needsReviewCount: number;
  ongoingCount: number;
  /** Coarse status for the day badge in the header. */
  dayStatus: 'ok' | 'needs_review' | 'ongoing';
}

const GAP_MIN_MINUTES = 20;          // gap threshold — under is folded into adjacent rows
const SHORT_WORK_MIN_MINUTES = 10;   // work entries shorter than this trigger review

const toMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  if (value.includes('T')) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  // Treat HH:mm[:ss] as relative — caller will use it for ordering only.
  const parts = value.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 * 60_000 + m * 60_000;
};

const orderKey = (value: string | null | undefined): number =>
  toMs(value) ?? Number.POSITIVE_INFINITY;

const minutesBetween = (start: string | null, end: string | null): number => {
  const a = toMs(start);
  const b = toMs(end);
  if (a == null || b == null) return 0;
  return Math.max(0, Math.round((b - a) / 60_000));
};

export function buildReviewEntries(input: BuildReviewEntriesInput): {
  entries: TimeReportReviewEntry[];
  summary: ReviewEntriesSummary;
} {
  const entries: TimeReportReviewEntry[] = [];

  for (const w of input.work) {
    const warnings: string[] = [];
    const dur = minutesBetween(w.start_time, w.end_time);
    if (!w.ongoing && dur > 0 && dur < SHORT_WORK_MIN_MINUTES) {
      warnings.push(`Mycket kort pass (${dur} min)`);
    }
    if (!w.start_time) warnings.push('Saknar starttid');
    if (!w.ongoing && !w.end_time) warnings.push('Saknar sluttid');

    const status: ReviewEntryStatus = w.ongoing
      ? 'ongoing'
      : w.approved
        ? 'approved'
        : warnings.length > 0
          ? 'needs_review'
          : 'ok';

    const rowKind = classifyReviewRow({
      sourceTable: w.source === 'time_report' ? 'time_report' : 'location_entry',
      closed: !w.ongoing,
      approved: !!w.approved,
      // Work entries that come in via this builder are already work-timer
      // intent (the caller has filtered presence-only LTEs out). Mark
      // explicitly so location entries land as active/confirmed, not
      // presence_evidence.
      isLocationWorkTimer: true,
    });

    entries.push({
      key: `work:${w.id}`,
      kind: 'work',
      rowKind,
      label: w.booking_client || '—',
      sublabel: w.booking_number ? `#${w.booking_number}` : (w.description || undefined),
      startIso: w.start_time,
      endIso: w.end_time,
      paidHours: w.hours_worked,
      durationMinutes: dur,
      status,
      warnings,
      refs: w.source === 'time_report'
        ? { timeReportId: w.id }
        : { locationEntryId: w.id.replace(/^lte-/, '') },
      gps: w.delivery_lat != null && w.delivery_lng != null
        ? { fromLat: w.delivery_lat, fromLng: w.delivery_lng, toLat: w.delivery_lat, toLng: w.delivery_lng }
        : undefined,
    });
  }

  for (const t of input.travel) {
    const labels = resolveTravelLabels({
      from_address: t.from_address,
      to_address: t.to_address,
      description: t.description ?? null,
    });
    const warnings: string[] = [];
    if (!labels.fromLabel && !labels.toLabel) warnings.push('Ingen adress på resan');
    if (!t.destination_booking_id) warnings.push('Saknar destination');
    const dur = minutesBetween(t.start_time, t.end_time);

    const status: ReviewEntryStatus = !t.end_time
      ? 'ongoing'
      : warnings.length > 0
        ? 'needs_review'
        : 'ok';

    entries.push({
      key: `travel:${t.id}`,
      kind: 'travel',
      // travel_log som passerar genom buildReviewEntries antas vara
      // icke-auto (manuell) tills vi får annan signal — godkänd → confirmed,
      // ej godkänd → suggested. gap_derived/auto-detected travel renderas
      // separat via canonicalDayModel.travelSuggestions.
      rowKind: classifyReviewRow({
        sourceTable: 'travel_log',
        closed: !!t.end_time,
        approved: false,
        travelAutoDetected: false,
      }),
      label: `Resa: ${labels.fromLabel ?? '?'} → ${labels.toLabel ?? '?'}`,
      sublabel: undefined,
      startIso: t.start_time,
      endIso: t.end_time,
      paidHours: t.hours_worked,
      durationMinutes: dur,
      status,
      warnings,
      refs: { travelLogId: t.id },
      gps: {
        fromLat: t.from_latitude,
        fromLng: t.from_longitude,
        toLat: t.to_latitude,
        toLng: t.to_longitude,
      },
    });
  }

  entries.sort((a, b) => orderKey(a.startIso) - orderKey(b.startIso));

  // Insert gap entries between adjacent rows when both have real timestamps
  // and the gap is significant (>= GAP_MIN_MINUTES).
  const withGaps: TimeReportReviewEntry[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const cur = entries[i];
    withGaps.push(cur);
    const next = entries[i + 1];
    if (!next || !cur.endIso || !next.startIso) continue;
    const gap = minutesBetween(cur.endIso, next.startIso);
    if (gap < GAP_MIN_MINUTES) continue;
    withGaps.push({
      key: `gap:${cur.key}->${next.key}`,
      kind: 'gap',
      // Luckor är bevis på frånvaro/förflyttning — visas som anomaly
      // (händelsejournalen), aldrig som fördelning.
      rowKind: 'anomaly',
      label: 'Oregistrerad tid',
      sublabel: 'Lucka mellan två poster',
      startIso: cur.endIso,
      endIso: next.startIso,
      paidHours: 0,
      durationMinutes: gap,
      status: 'needs_review',
      warnings: [`${gap} min utan registrering`],
      refs: {},
    });
  }

  // Workday boundaries
  const firstStart = withGaps.find(e => e.startIso)?.startIso ?? input.workday?.start ?? null;
  const lastEnd = [...withGaps].reverse().find(e => e.endIso)?.endIso ?? input.workday?.end ?? null;

  const workHours = input.work.reduce((s, w) => s + (w.hours_worked || 0), 0);
  const travelHours = input.travel.reduce((s, t) => s + (t.hours_worked || 0), 0);
  const gapMinutes = withGaps
    .filter(e => e.kind === 'gap')
    .reduce((s, e) => s + e.durationMinutes, 0);
  const needsReviewCount = withGaps.filter(e => e.status === 'needs_review').length;
  const ongoingCount = withGaps.filter(e => e.status === 'ongoing').length;

  const dayStatus: ReviewEntriesSummary['dayStatus'] = ongoingCount > 0
    ? 'ongoing'
    : needsReviewCount > 0
      ? 'needs_review'
      : 'ok';

  return {
    entries: withGaps,
    summary: {
      workdayStart: firstStart,
      workdayEnd: lastEnd,
      paidHours: workHours + travelHours,
      workHours,
      travelHours,
      gapMinutes,
      needsReviewCount,
      ongoingCount,
      dayStatus,
    },
  };
}
