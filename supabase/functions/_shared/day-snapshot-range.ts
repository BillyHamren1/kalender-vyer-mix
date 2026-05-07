// Build a list of canonical day snapshots for a date range using the SAME
// engine as get-staff-day-status. Month / period / report MUST summarize
// these snapshots — never re-aggregate raw tables.

import {
  buildStaffDaySnapshot,
  type SnapshotInput,
  type StaffDaySnapshot,
  type WorkdayRow,
  type TimeReportRow,
  type TravelLogRow,
  type LocationEntryRow,
  type WorkdayFlagRow,
  type AssistantEventRow,
  type DayAttestationRow,
} from "./staff-day-status.ts";

export interface RangeRows {
  workdays: WorkdayRow[];
  timeReports: TimeReportRow[];
  travelLogs: TravelLogRow[];
  locationEntries: LocationEntryRow[];
  flags: WorkdayFlagRow[];
  assistantEvents: AssistantEventRow[];
  attestations: DayAttestationRow[];
  nameMaps?: SnapshotInput["nameMaps"];
}

export function partitionByDate<T>(rows: T[], pickDate: (r: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const d = pickDate(r);
    if (!d) continue;
    const arr = m.get(d) ?? [];
    arr.push(r);
    m.set(d, arr);
  }
  return m;
}

export function buildDayRangeSnapshots(
  staffId: string,
  dates: string[],
  rows: RangeRows,
  now: Date = new Date(),
): StaffDaySnapshot[] {
  // Pre-partition once for O(N) instead of O(N*D).
  const wdByDate = partitionByDate(rows.workdays, (w) => w.started_at.slice(0, 10));
  const trByDate = partitionByDate(rows.timeReports, (t) => t.report_date);
  const tlByDate = partitionByDate(rows.travelLogs, (t) => t.start_time.slice(0, 10));
  const leByDate = partitionByDate(rows.locationEntries, (l) => l.entry_date);
  const flByDate = partitionByDate(rows.flags, (f) => f.flag_date);
  const evByDate = partitionByDate(rows.assistantEvents, (e) => e.happened_at.slice(0, 10));
  const atByDate = new Map<string, DayAttestationRow>();
  for (const a of rows.attestations) atByDate.set(a.date, a);

  return dates.map((date) => {
    const dayWorkdays = wdByDate.get(date) ?? [];
    const workday = dayWorkdays[0] ?? null;
    return buildStaffDaySnapshot(
      {
        staffId,
        date,
        workday: workday as WorkdayRow | null,
        timeReports: trByDate.get(date) ?? [],
        travelLogs: tlByDate.get(date) ?? [],
        locationEntries: leByDate.get(date) ?? [],
        flags: flByDate.get(date) ?? [],
        assistantEvents: evByDate.get(date) ?? [],
        attestation: atByDate.get(date) ?? null,
        nameMaps: rows.nameMaps,
      },
      now,
    );
  });
}

// ---- Canonical totals derived from day snapshots ----

export interface SummarizedTotals {
  /** Brutto (workday start → end). */
  grossWorkdayMinutes: number;
  /** Användar-/admin-attesterad rast. */
  breakMinutes: number;
  /** Admin manuell justering. */
  manualDeductionMinutes: number;
  /** Lönegrundande = brutto − rast − manual. */
  payableMinutes: number;
  /** Godkänd lönegrundande tid (workday.approved). */
  approvedPayableMinutes: number;
  /** Lönegrundande tid som väntar på attest (ingen day_attestation och ej godkänd). */
  awaitingAttestPayableMinutes: number;
  /** Antal dagar med actionsNeeded > 0 (oresolved input behövs). */
  daysWithActions: number;
  /** Antal dagar med någon brutto. */
  daysWithWork: number;
  /** Project / warehouse / transport / other_place breakdown. */
  projectMinutes: number;
  warehouseMinutes: number;
  transportMinutes: number;
  otherPlaceMinutes: number;
}

export function summarizeSnapshots(snaps: StaffDaySnapshot[]): SummarizedTotals {
  const out: SummarizedTotals = {
    grossWorkdayMinutes: 0,
    breakMinutes: 0,
    manualDeductionMinutes: 0,
    payableMinutes: 0,
    approvedPayableMinutes: 0,
    awaitingAttestPayableMinutes: 0,
    daysWithActions: 0,
    daysWithWork: 0,
    projectMinutes: 0,
    warehouseMinutes: 0,
    transportMinutes: 0,
    otherPlaceMinutes: 0,
  };
  for (const s of snaps) {
    const t = s.totals;
    out.grossWorkdayMinutes += t.grossWorkdayMinutes;
    out.breakMinutes += t.breakMinutes;
    out.manualDeductionMinutes += t.manualDeductionMinutes;
    out.payableMinutes += t.payableMinutes;
    out.projectMinutes += t.projectMinutes;
    out.warehouseMinutes += t.warehouseMinutes;
    out.transportMinutes += t.transportMinutes;
    out.otherPlaceMinutes += t.otherPlaceMinutes;
    if (t.grossWorkdayMinutes > 0) out.daysWithWork += 1;
    if (s.workday?.approved) {
      out.approvedPayableMinutes += t.payableMinutes;
    } else if (t.grossWorkdayMinutes > 0 && !s.attestation) {
      out.awaitingAttestPayableMinutes += t.payableMinutes;
    }
    if ((s.actionsNeeded ?? []).some((a) => a.needsUserInput)) {
      out.daysWithActions += 1;
    }
  }
  return out;
}

// Compact per-day shape for month/report listings.
export interface DaySummary {
  date: string;
  weekday: number; // 1=Mon..7=Sun
  grossWorkdayMinutes: number;
  breakMinutes: number;
  payableMinutes: number;
  projectMinutes: number;
  warehouseMinutes: number;
  transportMinutes: number;
  otherPlaceMinutes: number;
  isWorkdayOpen: boolean;
  approved: boolean;
  attested: boolean;
  actionsCount: number;
  status: "empty" | "open" | "needs_attest" | "needs_action" | "attested" | "approved";
}

function isoWeekday(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function toDaySummary(s: StaffDaySnapshot): DaySummary {
  const t = s.totals;
  const open = !!s.workday?.isOpen;
  const approved = !!s.workday?.approved;
  const attested = !!s.attestation && s.attestation.status !== "revoked";
  const actionsCount = (s.actionsNeeded ?? []).filter((a) => a.needsUserInput).length;
  let status: DaySummary["status"];
  if (t.grossWorkdayMinutes === 0 && !open) status = "empty";
  else if (open) status = "open";
  else if (approved) status = "approved";
  else if (actionsCount > 0) status = "needs_action";
  else if (!attested) status = "needs_attest";
  else status = "attested";

  return {
    date: s.date,
    weekday: isoWeekday(s.date),
    grossWorkdayMinutes: t.grossWorkdayMinutes,
    breakMinutes: t.breakMinutes,
    payableMinutes: t.payableMinutes,
    projectMinutes: t.projectMinutes,
    warehouseMinutes: t.warehouseMinutes,
    transportMinutes: t.transportMinutes,
    otherPlaceMinutes: t.otherPlaceMinutes,
    isWorkdayOpen: open,
    approved,
    attested,
    actionsCount,
    status,
  };
}

export function eachDayInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (let t = s.getTime(); t <= e.getTime(); t += 24 * 3600 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function eachDayOfMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}
