/**
 * buildProjectTimeSummary
 *
 * Gemensam projekt-tidsmodell. Tar råa rader från:
 *   - time_reports          (bekräftad projektfördelning)
 *   - location_time_entries (aktiv/stoppad aktivitet)
 *   - travel_time_logs      (föreslagen/godkänd restid)
 *
 * Och producerar en kanonisk sammanställning per projekt:
 *
 *   confirmedMinutes        — godkända time_reports + stängda LTE som ej dubblas
 *   activeMinutes           — pågående LTE (exited_at = null)
 *   suggestedMinutes        — stängda LTE utan motsvarande time_report
 *   travelMinutesApproved   — godkänd travel_time_log mot detta projekt
 *   travelMinutesSuggested  — föreslagen/auto-detected travel mot detta projekt
 *   staffBreakdown[]        — per staff_id med minuter per kategori
 *   sourceRows[]            — beslutslogg: vilka rader bidrog och varför
 *   anomalies[]             — t.ex. dubblettmisstanke, LTE utan time_report > N min
 *
 * Source of truth-regler:
 *   - workday räknas ALDRIG som projekttid (kräver fördelning)
 *   - time_reports är auktoritativt vid fördelning av timmar
 *   - LTE deduplikeras mot time_reports via:
 *       1) time_reports.source_entry_id === lte.id   (hård match)
 *       2) annars overlap(start,end) + samma staff + samma target (mjuk match)
 *   - travel räknas separat och blandas inte in i confirmed/active/suggested
 *   - is_subdivision time_reports filtreras bort (är geofence-metadata)
 */

// ── Inputs ───────────────────────────────────────────────────────────────

export type ProjectTarget =
  | { kind: 'booking'; bookingId: string }
  | { kind: 'large_project'; largeProjectId: string };

export interface PtmTimeReport {
  id: string;
  staff_id: string;
  booking_id: string | null;
  large_project_id: string | null;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  break_time: number | null;
  approved: boolean | null;
  is_subdivision: boolean;
  source: string;
  source_entry_id: string | null;
}

export interface PtmLocationTimeEntry {
  id: string;
  staff_id: string;
  booking_id: string | null;
  large_project_id: string | null;
  location_id: string | null;
  entered_at: string;
  exited_at: string | null;
  total_minutes: number | null;
  source: string;
  /** För att förstå om entry redan är "presence-only" och inte ska föreslå projekttid. */
  metadata?: Record<string, unknown> | null;
}

export interface PtmTravelLog {
  id: string;
  staff_id: string;
  destination_booking_id: string | null;
  start_time: string;
  end_time: string | null;
  hours_worked: number;
  approved: boolean;
  auto_detected: boolean;
  source: string;
  classification: string;
}

export interface BuildProjectTimeSummaryInput {
  target: ProjectTarget;
  /**
   * Inkluderar även underbookningar för stora projekt — caller skickar in
   * alla bookings.id som hör till samma large_project_id.
   */
  includeBookingIds?: string[];
  /** Datumfönster (inclusive) i 'YYYY-MM-DD'. Används för informativ filtrering. */
  dateRange?: { start: string; end: string };
  timeReports: PtmTimeReport[];
  locationTimeEntries: PtmLocationTimeEntry[];
  travelLogs: PtmTravelLog[];
  /** Sätts av caller — Date.now() i prod, fast värde i test. */
  nowMs?: number;
}

// ── Outputs ──────────────────────────────────────────────────────────────

export type PtmSourceKind =
  | 'time_report'
  | 'lte_closed'
  | 'lte_active'
  | 'travel_approved'
  | 'travel_suggested';

export type PtmDecision =
  | 'counted_confirmed'
  | 'counted_active'
  | 'counted_suggested'
  | 'counted_travel_approved'
  | 'counted_travel_suggested'
  | 'skipped_subdivision'
  | 'skipped_not_target'
  | 'skipped_dedup_hard'
  | 'skipped_dedup_overlap'
  | 'skipped_zero_minutes';

export interface PtmSourceRow {
  rowId: string;
  staffId: string;
  kind: PtmSourceKind;
  minutes: number;
  decision: PtmDecision;
  reason?: string;
  /** ISO strings — kan saknas på time_reports utan start/end. */
  startIso: string | null;
  endIso: string | null;
}

export type PtmAnomalyKind =
  | 'lte_no_time_report'         // stängd LTE >threshold utan motsvarande TR
  | 'overlap_dedup_applied'      // mjuk dedup gjordes — admin bör verifiera
  | 'time_report_without_window' // TR saknar start/end → använder hours_worked
  | 'orphan_active_lte'          // aktiv LTE >12h
  | 'travel_unmapped';           // travel utan tydlig destination men matchar via heuristik

export interface PtmAnomaly {
  kind: PtmAnomalyKind;
  staffId: string;
  rowId: string;
  message: string;
}

export interface PtmStaffBreakdown {
  staffId: string;
  confirmedMinutes: number;
  activeMinutes: number;
  suggestedMinutes: number;
  travelMinutesApproved: number;
  travelMinutesSuggested: number;
}

export interface ProjectTimeSummary {
  target: ProjectTarget;
  confirmedMinutes: number;
  activeMinutes: number;
  suggestedMinutes: number;
  travelMinutesApproved: number;
  travelMinutesSuggested: number;
  staffBreakdown: PtmStaffBreakdown[];
  sourceRows: PtmSourceRow[];
  anomalies: PtmAnomaly[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
const minutesBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
const round = (n: number) => Math.round(n);

/** Targetar raden detta projekt? */
const matchesTarget = (
  row: { booking_id?: string | null; large_project_id?: string | null; destination_booking_id?: string | null },
  target: ProjectTarget,
  includeBookingIds: Set<string>,
): boolean => {
  const bookingRef = row.booking_id ?? row.destination_booking_id ?? null;
  if (target.kind === 'large_project') {
    if (row.large_project_id === target.largeProjectId) return true;
    if (bookingRef && includeBookingIds.has(bookingRef)) return true;
    return false;
  }
  // booking-target
  if (bookingRef === target.bookingId) return true;
  return false;
};

const overlaps = (
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): boolean => {
  if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return false;
  const aE = Number.isFinite(aEnd) ? aEnd : aStart;
  const bE = Number.isFinite(bEnd) ? bEnd : bStart;
  return aStart < bE && bStart < aE;
};

const trMinutes = (tr: PtmTimeReport): number => {
  if (tr.start_time && tr.end_time) {
    const m = minutesBetween(tr.start_time, tr.end_time) - Math.max(0, tr.break_time ?? 0);
    return Math.max(0, m);
  }
  return Math.max(0, Math.round((tr.hours_worked || 0) * 60) - Math.max(0, tr.break_time ?? 0));
};

const lteMinutes = (lte: PtmLocationTimeEntry, nowMs: number): number => {
  if (lte.total_minutes != null && lte.exited_at) return Math.max(0, lte.total_minutes);
  const start = ms(lte.entered_at);
  const end = lte.exited_at ? ms(lte.exited_at) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
};

const travelMinutes = (t: PtmTravelLog): number => {
  if (t.start_time && t.end_time) return minutesBetween(t.start_time, t.end_time);
  return Math.max(0, Math.round((t.hours_worked || 0) * 60));
};

// ── Main ─────────────────────────────────────────────────────────────────

const ORPHAN_LTE_MIN = 30;     // stängd LTE > 30 min utan TR → flagga
const ACTIVE_LTE_FLAG_MIN = 12 * 60;

export function buildProjectTimeSummary(
  input: BuildProjectTimeSummaryInput,
): ProjectTimeSummary {
  const nowMs = input.nowMs ?? Date.now();
  const includeBookingIds = new Set(input.includeBookingIds ?? []);
  if (input.target.kind === 'booking') includeBookingIds.add(input.target.bookingId);

  const sourceRows: PtmSourceRow[] = [];
  const anomalies: PtmAnomaly[] = [];

  // 1) time_reports — alltid auktoritativa när de matchar target.
  const matchedTRs: PtmTimeReport[] = [];
  for (const tr of input.timeReports) {
    if (tr.is_subdivision) {
      sourceRows.push({
        rowId: tr.id, staffId: tr.staff_id, kind: 'time_report',
        minutes: 0, decision: 'skipped_subdivision',
        startIso: tr.start_time, endIso: tr.end_time,
        reason: 'is_subdivision=true (geofence-metadata, ej lönegrundande)',
      });
      continue;
    }
    if (!matchesTarget(tr, input.target, includeBookingIds)) {
      sourceRows.push({
        rowId: tr.id, staffId: tr.staff_id, kind: 'time_report',
        minutes: 0, decision: 'skipped_not_target',
        startIso: tr.start_time, endIso: tr.end_time,
      });
      continue;
    }
    const m = trMinutes(tr);
    if (m === 0) {
      sourceRows.push({
        rowId: tr.id, staffId: tr.staff_id, kind: 'time_report',
        minutes: 0, decision: 'skipped_zero_minutes',
        startIso: tr.start_time, endIso: tr.end_time,
      });
      continue;
    }
    matchedTRs.push(tr);
    if (!tr.start_time || !tr.end_time) {
      anomalies.push({
        kind: 'time_report_without_window', staffId: tr.staff_id, rowId: tr.id,
        message: `Time report saknar start/end — använder hours_worked (${tr.hours_worked} h)`,
      });
    }
    sourceRows.push({
      rowId: tr.id, staffId: tr.staff_id, kind: 'time_report',
      minutes: m, decision: 'counted_confirmed',
      startIso: tr.start_time, endIso: tr.end_time,
      reason: tr.approved ? 'approved' : 'submitted',
    });
  }

  // Index för dedup-lookup.
  const trBySourceEntry = new Map<string, PtmTimeReport>();
  for (const tr of matchedTRs) {
    if (tr.source_entry_id) trBySourceEntry.set(tr.source_entry_id, tr);
  }

  // 2) location_time_entries — dedup mot time_reports.
  for (const lte of input.locationTimeEntries) {
    if (!matchesTarget(lte, input.target, includeBookingIds)) {
      sourceRows.push({
        rowId: lte.id, staffId: lte.staff_id,
        kind: lte.exited_at ? 'lte_closed' : 'lte_active',
        minutes: 0, decision: 'skipped_not_target',
        startIso: lte.entered_at, endIso: lte.exited_at,
      });
      continue;
    }

    // Hård dedup: TR pekar via source_entry_id på just denna LTE.
    const hardMatch = trBySourceEntry.get(lte.id);
    if (hardMatch) {
      sourceRows.push({
        rowId: lte.id, staffId: lte.staff_id,
        kind: lte.exited_at ? 'lte_closed' : 'lte_active',
        minutes: 0, decision: 'skipped_dedup_hard',
        startIso: lte.entered_at, endIso: lte.exited_at,
        reason: `time_report ${hardMatch.id} källrefererar denna LTE`,
      });
      continue;
    }

    // Mjuk dedup: overlap + samma staff + samma target.
    const lteStart = ms(lte.entered_at);
    const lteEnd = lte.exited_at ? ms(lte.exited_at) : nowMs;
    const softMatch = matchedTRs.find(tr =>
      tr.staff_id === lte.staff_id
      && tr.start_time && tr.end_time
      && overlaps(lteStart, lteEnd, ms(tr.start_time), ms(tr.end_time)),
    );
    if (softMatch) {
      anomalies.push({
        kind: 'overlap_dedup_applied', staffId: lte.staff_id, rowId: lte.id,
        message: `LTE ${lte.id} överlappar time_report ${softMatch.id} — räknas inte (mjuk dedup)`,
      });
      sourceRows.push({
        rowId: lte.id, staffId: lte.staff_id,
        kind: lte.exited_at ? 'lte_closed' : 'lte_active',
        minutes: 0, decision: 'skipped_dedup_overlap',
        startIso: lte.entered_at, endIso: lte.exited_at,
        reason: `overlap med time_report ${softMatch.id}`,
      });
      continue;
    }

    const m = lteMinutes(lte, nowMs);
    if (m === 0) {
      sourceRows.push({
        rowId: lte.id, staffId: lte.staff_id,
        kind: lte.exited_at ? 'lte_closed' : 'lte_active',
        minutes: 0, decision: 'skipped_zero_minutes',
        startIso: lte.entered_at, endIso: lte.exited_at,
      });
      continue;
    }

    if (!lte.exited_at) {
      // Aktiv LTE = preliminär pågående projekttid.
      if (m >= ACTIVE_LTE_FLAG_MIN) {
        anomalies.push({
          kind: 'orphan_active_lte', staffId: lte.staff_id, rowId: lte.id,
          message: `Aktiv LTE har pågått ${Math.round(m / 60)} h utan stopp`,
        });
      }
      sourceRows.push({
        rowId: lte.id, staffId: lte.staff_id, kind: 'lte_active',
        minutes: m, decision: 'counted_active',
        startIso: lte.entered_at, endIso: null,
        reason: 'pågående timer mot projektet',
      });
    } else {
      // Stängd LTE utan TR = förslag.
      if (m >= ORPHAN_LTE_MIN) {
        anomalies.push({
          kind: 'lte_no_time_report', staffId: lte.staff_id, rowId: lte.id,
          message: `Stängd LTE ${m} min utan motsvarande time_report`,
        });
      }
      sourceRows.push({
        rowId: lte.id, staffId: lte.staff_id, kind: 'lte_closed',
        minutes: m, decision: 'counted_suggested',
        startIso: lte.entered_at, endIso: lte.exited_at,
        reason: 'stängd timer utan time_report',
      });
    }
  }

  // 3) travel_time_logs — räknas separat (ej confirmed/active/suggested).
  for (const t of input.travelLogs) {
    if (!matchesTarget(t, input.target, includeBookingIds)) {
      sourceRows.push({
        rowId: t.id, staffId: t.staff_id,
        kind: t.approved ? 'travel_approved' : 'travel_suggested',
        minutes: 0, decision: 'skipped_not_target',
        startIso: t.start_time, endIso: t.end_time,
      });
      continue;
    }
    const m = travelMinutes(t);
    if (m === 0) {
      sourceRows.push({
        rowId: t.id, staffId: t.staff_id,
        kind: t.approved ? 'travel_approved' : 'travel_suggested',
        minutes: 0, decision: 'skipped_zero_minutes',
        startIso: t.start_time, endIso: t.end_time,
      });
      continue;
    }
    sourceRows.push({
      rowId: t.id, staffId: t.staff_id,
      kind: t.approved ? 'travel_approved' : 'travel_suggested',
      minutes: m,
      decision: t.approved ? 'counted_travel_approved' : 'counted_travel_suggested',
      startIso: t.start_time, endIso: t.end_time,
      reason: t.classification + (t.auto_detected ? ' · auto-detekterad' : ''),
    });
  }

  // ── Aggregering ────────────────────────────────────────────────────────
  let confirmedMinutes = 0;
  let activeMinutes = 0;
  let suggestedMinutes = 0;
  let travelMinutesApproved = 0;
  let travelMinutesSuggested = 0;
  const staffMap = new Map<string, PtmStaffBreakdown>();
  const ensureStaff = (id: string): PtmStaffBreakdown => {
    let s = staffMap.get(id);
    if (!s) {
      s = {
        staffId: id,
        confirmedMinutes: 0, activeMinutes: 0, suggestedMinutes: 0,
        travelMinutesApproved: 0, travelMinutesSuggested: 0,
      };
      staffMap.set(id, s);
    }
    return s;
  };

  for (const r of sourceRows) {
    if (r.minutes === 0) continue;
    const s = ensureStaff(r.staffId);
    switch (r.decision) {
      case 'counted_confirmed':
        confirmedMinutes += r.minutes; s.confirmedMinutes += r.minutes; break;
      case 'counted_active':
        activeMinutes += r.minutes; s.activeMinutes += r.minutes; break;
      case 'counted_suggested':
        suggestedMinutes += r.minutes; s.suggestedMinutes += r.minutes; break;
      case 'counted_travel_approved':
        travelMinutesApproved += r.minutes; s.travelMinutesApproved += r.minutes; break;
      case 'counted_travel_suggested':
        travelMinutesSuggested += r.minutes; s.travelMinutesSuggested += r.minutes; break;
    }
  }

  return {
    target: input.target,
    confirmedMinutes: round(confirmedMinutes),
    activeMinutes: round(activeMinutes),
    suggestedMinutes: round(suggestedMinutes),
    travelMinutesApproved: round(travelMinutesApproved),
    travelMinutesSuggested: round(travelMinutesSuggested),
    staffBreakdown: Array.from(staffMap.values()).sort((a, b) =>
      (b.confirmedMinutes + b.activeMinutes) - (a.confirmedMinutes + a.activeMinutes),
    ),
    sourceRows,
    anomalies,
  };
}
