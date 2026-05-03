/**
 * calculateDayMetrics — CENTRAL SOURCE OF TRUTH for "how much did this person work today?"
 * ========================================================================================
 *
 * KRITISK PRINCIP:
 *   Workday = total arbetstid (det är "containern").
 *   Projekt/plats/restid = fördelning INUTI workday.
 *   Dessa får ALDRIG adderas ovanpå varandra som total arbetstid.
 *
 * Felaktigt (gammal logik, gav 15h dagar):
 *   total = workdayMinutes + activityMinutes + travelMinutes
 *
 * Rätt (denna helper):
 *   payableMinutes = workdayMinutes  (när workday finns)
 *   allocatedMinutes = activityMinutes + travelMinutes
 *   unallocatedMinutes = max(0, workdayMinutes - allocatedMinutes)
 *
 * Pure & UI-agnostic. Inga DB-anrop.
 */

export interface DayMetricsInput {
  /** Workday-rader för dagen (oftast 0–1, ibland flera vid nattskift). */
  workday?: { started_at: string; ended_at: string | null } | null;
  /** Projekt/booking/plats-segment som motsvarar verklig aktivitet. */
  activitySegments?: ReadonlyArray<{
    start: string;
    end: string | null;
    /** Minuter eller timmar — ange en av två. */
    minutes?: number;
    hours?: number;
    /** Markera presence-only/subdivision för att exkludera från sum. */
    excludeFromTotals?: boolean;
  }>;
  /** Restid (travel_time_logs). Räknas som allokerat men inte som projekt. */
  travelSegments?: ReadonlyArray<{
    start: string;
    end: string | null;
    minutes?: number;
    hours?: number;
  }>;
  /** Klocka för pågående beräkningar (test-injicerbar). */
  now?: Date;
}

export interface DayMetrics {
  /** Total arbetsdag i minuter (workday open → fram till `now`). */
  workdayMinutes: number;
  /** Är arbetsdagen fortfarande öppen? */
  workdayOpen: boolean;
  /** Summering av projekt/plats-segment. */
  activityMinutes: number;
  /** Summering av restid. */
  travelMinutes: number;
  /** activity + travel — total fördelad tid inom workday. */
  allocatedMinutes: number;
  /** workday - allocated. Aldrig negativt. */
  unallocatedMinutes: number;
  /**
   * Tid som ska räknas som "betalbar/total arbetstid" mot lön/fakturering.
   * Default = workdayMinutes (när det finns en workday).
   * Fallback = allocatedMinutes (när workday saknas helt — t.ex. äldre data).
   */
  payableMinutes: number;
}

const MS_PER_MIN = 60_000;

function toMinutes(seg: { minutes?: number; hours?: number; start: string; end: string | null }, now: number): number {
  if (typeof seg.minutes === 'number' && Number.isFinite(seg.minutes)) {
    return Math.max(0, seg.minutes);
  }
  if (typeof seg.hours === 'number' && Number.isFinite(seg.hours)) {
    return Math.max(0, Math.round(seg.hours * 60));
  }
  if (!seg.start) return 0;
  const s = new Date(seg.start).getTime();
  const e = seg.end ? new Date(seg.end).getTime() : now;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.round((e - s) / MS_PER_MIN);
}

export function calculateDayMetrics(input: DayMetricsInput): DayMetrics {
  const now = (input.now ?? new Date()).getTime();

  const workdayOpen = !!input.workday && !input.workday.ended_at;
  let workdayMinutes = 0;
  if (input.workday?.started_at) {
    const s = new Date(input.workday.started_at).getTime();
    const e = input.workday.ended_at ? new Date(input.workday.ended_at).getTime() : now;
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      workdayMinutes = Math.round((e - s) / MS_PER_MIN);
    }
  }

  const activityMinutes = (input.activitySegments ?? [])
    .filter(s => !s.excludeFromTotals)
    .reduce((sum, s) => sum + toMinutes(s, now), 0);

  const travelMinutes = (input.travelSegments ?? [])
    .reduce((sum, s) => sum + toMinutes(s, now), 0);

  const allocatedMinutes = activityMinutes + travelMinutes;

  const unallocatedMinutes = workdayMinutes > 0
    ? Math.max(0, workdayMinutes - allocatedMinutes)
    : 0;

  // Payable = workday när den finns; annars fallback till allokerat (legacy data
  // utan workday-rad). Aldrig workday + activity.
  const payableMinutes = workdayMinutes > 0 ? workdayMinutes : allocatedMinutes;

  return {
    workdayMinutes,
    workdayOpen,
    activityMinutes,
    travelMinutes,
    allocatedMinutes,
    unallocatedMinutes,
    payableMinutes,
  };
}

export const minutesToHours = (m: number): number => m / 60;
