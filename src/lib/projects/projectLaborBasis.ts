/**
 * projectLaborBasis
 * ─────────────────
 * Härleder kostnadsunderlaget för PROJEKT-ekonomi (kostnad/uppföljning/export)
 * från en `ProjectTimeSummary` + valfri lista över workday-rader för samma
 * personal/dag.
 *
 * Regler (låsta i workmanScenario-testerna):
 *   • Projektkostnad = `confirmedMinutes` (godkända/inlämnade time_reports).
 *   • Approved travel adderas ENDAST om `includeApprovedTravel=true`.
 *   • Suggested/active/suggested travel räknas ALDRIG som projektkostnad —
 *     de exponeras separat som `pendingMinutes` så UI kan visa "väntar på
 *     attest" utan att blanda in dem i belopp.
 *   • Workday-tid räknas ALDRIG mot projektet. Skillnaden mellan workday
 *     och projektets confirmed+approved-travel rapporteras som
 *     `unallocatedWorkdayMinutes` per staff — en INTERN AVVIKELSE för
 *     "ofördelad arbetstid", inte en kostnadspost.
 *
 * Lön kan basera sig på workday separat. Denna fil rör inte lön.
 */

import type {
  ProjectTimeSummary,
  PtmStaffBreakdown,
} from './projectTimeModel';

export interface WorkdayWindow {
  staffId: string;
  /** ISO start. */
  startedAt: string;
  /** ISO slut. null = pågående (räknas inte). */
  endedAt: string | null;
  /** Eventuell registrerad rast i minuter. */
  breakMinutes?: number | null;
}

export interface ProjectLaborStaffBasis {
  staffId: string;
  /** Bekräftad projekttid (time_reports). */
  confirmedMinutes: number;
  /** Godkänd restid mot projektet (om includeApprovedTravel). */
  approvedTravelMinutes: number;
  /** Total kostnadsbärande minuter för projektet. */
  billableMinutes: number;
  /** Workday total (stängd) minus rast. 0 om workday saknas eller pågår. */
  workdayMinutes: number;
  /**
   * Ofördelad arbetstid: workday − (confirmed + approved travel).
   * 0 om workday saknas. Negativt clampas till 0 (ska inte hända vid
   * korrekt rapportering, men dyker upp om TR ligger utanför workday).
   */
  unallocatedWorkdayMinutes: number;
}

export interface ProjectLaborBasis {
  /** Total kostnadsbärande minuter (sum av confirmed + ev approved travel). */
  billableMinutes: number;
  confirmedMinutes: number;
  approvedTravelMinutes: number;
  /** Aktiv + suggested + suggested travel — visas separat som "väntar". */
  pendingMinutes: number;
  /** Ofördelad workday-tid över alla staff. Avvikelse, inte kostnad. */
  unallocatedWorkdayMinutes: number;
  perStaff: ProjectLaborStaffBasis[];
  /** True om någon ofördelad workday-tid finns → trigga UI-avvikelse. */
  hasUnallocatedWorkday: boolean;
  /** Settings använda. */
  options: { includeApprovedTravel: boolean };
}

export interface BuildProjectLaborBasisOptions {
  /** Inkludera godkänd restid i `billableMinutes`. Default: false. */
  includeApprovedTravel?: boolean;
  /**
   * Workday-fönster för aktuella personer/datum. Endast STÄNGDA workdays
   * räknas som "tid att fördela". Caller ansvarar för datumfilter.
   */
  workdays?: WorkdayWindow[];
}

const minutesBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));

const sumWorkdayMinutes = (rows: WorkdayWindow[]): number => {
  let total = 0;
  for (const w of rows) {
    if (!w.endedAt) continue; // pågående räknas inte
    const m = minutesBetween(w.startedAt, w.endedAt) - Math.max(0, w.breakMinutes ?? 0);
    total += Math.max(0, m);
  }
  return total;
};

export function buildProjectLaborBasis(
  summary: ProjectTimeSummary,
  opts: BuildProjectLaborBasisOptions = {},
): ProjectLaborBasis {
  const includeApprovedTravel = opts.includeApprovedTravel === true;

  const workdaysByStaff = new Map<string, WorkdayWindow[]>();
  for (const w of opts.workdays ?? []) {
    const list = workdaysByStaff.get(w.staffId) ?? [];
    list.push(w);
    workdaysByStaff.set(w.staffId, list);
  }

  // Alla staff som någonsin nämns — projekt-staff ∪ workday-staff
  const staffIds = new Set<string>();
  for (const s of summary.staffBreakdown) staffIds.add(s.staffId);
  for (const id of workdaysByStaff.keys()) staffIds.add(id);

  const breakdownById = new Map<string, PtmStaffBreakdown>(
    summary.staffBreakdown.map(s => [s.staffId, s] as const),
  );

  const perStaff: ProjectLaborStaffBasis[] = [];
  let totalConfirmed = 0;
  let totalApprovedTravel = 0;
  let totalUnallocated = 0;

  for (const staffId of staffIds) {
    const b = breakdownById.get(staffId);
    const confirmed = b?.confirmedMinutes ?? 0;
    const approvedTravel = b?.travelMinutesApproved ?? 0;
    const billable = confirmed + (includeApprovedTravel ? approvedTravel : 0);
    const workdayMinutes = sumWorkdayMinutes(workdaysByStaff.get(staffId) ?? []);
    const unallocated = workdayMinutes > 0
      ? Math.max(0, workdayMinutes - (confirmed + approvedTravel))
      : 0;

    totalConfirmed += confirmed;
    totalApprovedTravel += approvedTravel;
    totalUnallocated += unallocated;

    perStaff.push({
      staffId,
      confirmedMinutes: confirmed,
      approvedTravelMinutes: approvedTravel,
      billableMinutes: billable,
      workdayMinutes,
      unallocatedWorkdayMinutes: unallocated,
    });
  }

  const billableMinutes = totalConfirmed + (includeApprovedTravel ? totalApprovedTravel : 0);
  const pendingMinutes =
    summary.activeMinutes
    + summary.suggestedMinutes
    + summary.travelMinutesSuggested
    + (includeApprovedTravel ? 0 : summary.travelMinutesApproved);

  return {
    billableMinutes,
    confirmedMinutes: totalConfirmed,
    approvedTravelMinutes: totalApprovedTravel,
    pendingMinutes,
    unallocatedWorkdayMinutes: totalUnallocated,
    perStaff: perStaff.sort((a, b) => b.billableMinutes - a.billableMinutes),
    hasUnallocatedWorkday: totalUnallocated > 0,
    options: { includeApprovedTravel },
  };
}
