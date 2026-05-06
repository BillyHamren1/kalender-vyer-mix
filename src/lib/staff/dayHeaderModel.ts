/**
 * dayHeaderModel — EN normaliserad "tolkad huvudjournal" för tidrapportsvyn.
 *
 * Alla personer renderas från SAMMA modell, i SAMMA ordning:
 *
 *   1. Arbetsdag           — start, slut/pågår, duration, lönegrundande
 *   2. Aktiv just nu       — projekt/plats där tid registreras NU
 *   3. Fördelning          — projekt / restid / oallokerat
 *   4. Status              — Pågår / Redo för attest / Behöver granskning / Godkänd
 *
 * Status-vokabulären är HÅRT begränsad till exakt fyra värden. Detaljer som
 *   - "TIMER SAKNAS"
 *   - "TIMER SEDAN ..."
 *   - "ARBETSDAG SAKNAS"
 *   - "SIGNAL TAPPAD"
 *   - "GPS_ON_KNOWN_WORK_SITE"
 *   - "timer_tail" / "timer_bridge"
 * får ALDRIG vara huvudstatus. De är debug-info och hör hemma i expanderade
 * rader / detaljvyer.
 *
 * Pure / UI-agnostic. Inga DB-anrop.
 */
import type { ActualStaffDayModel } from './actualStaffDayModel';

export type DayHeaderStatus =
  | 'ongoing'        // "Pågår"
  | 'ready_review'   // "Redo för attest"
  | 'needs_review'   // "Behöver granskning"
  | 'approved';      // "Godkänd"

export const DAY_HEADER_STATUS_LABEL: Record<DayHeaderStatus, string> = {
  ongoing: 'Pågår',
  ready_review: 'Redo för attest',
  needs_review: 'Behöver granskning',
  approved: 'Godkänd',
};

export interface DayHeaderWorkdaySection {
  startIso: string | null;
  endIso: string | null;
  ongoing: boolean;
  /** Total arbetsdag i minuter. */
  workdayMinutes: number;
  /** Lönegrundande tid i minuter (workday − rast). */
  payableMinutes: number;
}

export interface DayHeaderActiveSection {
  /** True när någon timer/aktivitet pågår just nu. */
  hasActive: boolean;
  /** Visningsetikett för aktiv aktivitet — projekt/plats. */
  label: string | null;
  /** ISO när den aktiva aktiviteten startade. */
  sinceIso: string | null;
  /** Minuter pågående. */
  runningMinutes: number;
}

export interface DayHeaderAllocationSection {
  /** Projekttid (time_reports + bekräftade aktivitetstimrar). */
  projectMinutes: number;
  /** Godkänd restid. */
  travelMinutes: number;
  /** Oallokerad tid inom workday. */
  unallocatedMinutes: number;
}

export interface DayHeaderModel {
  workday: DayHeaderWorkdaySection;
  active: DayHeaderActiveSection;
  allocation: DayHeaderAllocationSection;
  status: DayHeaderStatus;
  statusLabel: string;
}

export interface BuildDayHeaderInput {
  model: ActualStaffDayModel;
  /** Klocka för pågående beräkningar (test-injicerbar). */
  now?: Date;
}

const MS_PER_MIN = 60_000;

const safeMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

const minutesBetween = (a: number, b: number) =>
  Math.max(0, Math.round((b - a) / MS_PER_MIN));

const hoursToMinutes = (h: number | undefined | null): number => {
  if (!h || !Number.isFinite(h)) return 0;
  return Math.max(0, Math.round(h * 60));
};

/**
 * Bygg den normaliserade huvudjournals-modellen från ActualStaffDayModel.
 *
 * STATUS-LOGIK (i fallande prioritet):
 *   - Behöver granskning  ← signalLost ELLER kvarvarande proposed-anomalies
 *                          ELLER (workday saknas men det finns rapporter/visits)
 *                          ELLER pågående timer utan workday
 *   - Pågår               ← workday öppen ELLER aktiv timer
 *   - Godkänd             ← alla time_reports approved (och ≥1 finns) och inga
 *                          öppna timrar/workday
 *   - Redo för attest     ← workday avslutad och inga blockerande anomalies
 *
 * Inga "auto-skapad", "GPS"-prefix etc. läcker ut som status — de bor i sina
 * egna inline-badges, inte i huvudstatusen.
 */
export function buildDayHeaderModel(input: BuildDayHeaderInput): DayHeaderModel {
  const { model } = input;
  const now = (input.now ?? new Date()).getTime();
  const wd = model.reportState.workday;

  // ── 1. Arbetsdag ───────────────────────────────────────────────────
  const startMs = safeMs(wd?.started_at);
  const endMs = wd ? (wd.ended_at ? safeMs(wd.ended_at) : now) : null;
  const ongoing = !!wd && !wd.ended_at;
  const workdayMinutes =
    startMs != null && endMs != null && endMs > startMs ? minutesBetween(startMs, endMs) : 0;

  // Rast: härleds från time_reports.breakHours om sådant fält finns,
  // annars 0. (ActualStaffDayModel exponerar inte rast separat — vi
  // håller payable = workday som default.)
  const breakMinutes = 0;
  const payableMinutes = Math.max(0, workdayMinutes - breakMinutes);

  // ── 2. Aktiv just nu ───────────────────────────────────────────────
  // Pågående time_report (ingen end_iso).
  const openTimeReport = (model.reportState.timeReports ?? []).find(t => !t.end_iso) ?? null;
  // Pågående location_time_entry som inte är presence-only.
  const openLocation =
    (model.reportState.locationEntries ?? []).find(
      e => !e.exited_at && !e.isPresenceOnly,
    ) ?? null;

  let active: DayHeaderActiveSection = {
    hasActive: false,
    label: null,
    sinceIso: null,
    runningMinutes: 0,
  };
  if (openTimeReport) {
    const ms = safeMs(openTimeReport.start_iso);
    active = {
      hasActive: true,
      label: openTimeReport.label || 'Pågående aktivitet',
      sinceIso: openTimeReport.start_iso,
      runningMinutes: ms != null ? minutesBetween(ms, now) : 0,
    };
  } else if (openLocation) {
    const ms = safeMs(openLocation.entered_at);
    active = {
      hasActive: true,
      label: openLocation.label || 'Pågående aktivitet',
      sinceIso: openLocation.entered_at,
      runningMinutes: ms != null ? minutesBetween(ms, now) : 0,
    };
  }

  // ── 3. Fördelning ──────────────────────────────────────────────────
  const projectMinutes = (model.reportState.timeReports ?? [])
    .filter(t => t.end_iso)
    .reduce((s, t) => s + hoursToMinutes(t.hours), 0);

  const travelMinutes = (model.reportState.travelLogs ?? [])
    .filter(t => t.approved && t.end_iso)
    .reduce((s, t) => s + hoursToMinutes(t.hours), 0);

  const allocated = projectMinutes + travelMinutes;
  const unallocatedMinutes =
    payableMinutes > 0 ? Math.max(0, payableMinutes - allocated) : 0;

  // ── 4. Status ──────────────────────────────────────────────────────
  const hasOpenTimer = active.hasActive;
  const hasReports = (model.reportState.timeReports ?? []).length > 0;
  const hasVisitsOrEvents =
    (model.actualVisits?.length ?? 0) > 0 || (model.actualEvents?.length ?? 0) > 0;

  // Filtrera ut info-only anomalier (de blockerar inte attest).
  const blockingAnomalies = (model.proposedReport?.anomalies ?? []).filter(
    a => a.severity !== 'info',
  );

  let status: DayHeaderStatus;
  if (
    model.signalLost ||
    blockingAnomalies.length > 0 ||
    (!wd && hasVisitsOrEvents) ||
    (!wd && hasOpenTimer)
  ) {
    status = 'needs_review';
  } else if (ongoing || hasOpenTimer) {
    status = 'ongoing';
  } else if (
    wd &&
    !ongoing &&
    hasReports &&
    (model.reportState.timeReports ?? []).every(t => t.approved)
  ) {
    status = 'approved';
  } else {
    // Avslutad arbetsdag, ingen blockerare → klar för attest.
    // Saknar workday helt och hållet utan något annat → också "klar för attest"
    // (det finns inget att granska; tom dag).
    status = 'ready_review';
  }

  return {
    workday: {
      startIso: wd?.started_at ?? null,
      endIso: wd?.ended_at ?? null,
      ongoing,
      workdayMinutes,
      payableMinutes,
    },
    active,
    allocation: {
      projectMinutes,
      travelMinutes,
      unallocatedMinutes,
    },
    status,
    statusLabel: DAY_HEADER_STATUS_LABEL[status],
  };
}
