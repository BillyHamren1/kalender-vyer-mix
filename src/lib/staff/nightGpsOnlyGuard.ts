/**
 * nightGpsOnlyGuard — UI-side spegling av "Night Auto-Start Guard"-policyn
 * (memory: night-auto-start-guard-v1) för /staff-management/time-reports.
 *
 * Backend nightPolicy blockerar AUTO-START av timer 00:00–05:00 lokal tid
 * utan starkare bevis, men display-lagret (StaffGanttView) ritade ändå
 * candidate-block av nattens GPS-pings. Resultat: en person utan
 * time_report/LTE/manuell timer såg ut att ha "1h 58m arbete på FA
 * Warehouse" mellan 00:01 och 01:58 fast bara GPS spårades.
 *
 * Den här helpern klassar varje block som:
 *   - 'main'                   → visa som vanligt
 *   - 'raw_only_night_gps'     → flytta till råvy / dämpa, räkna inte i
 *                                 arbetstotaler
 *
 * Pure / unit-testbar. Inga DB-anrop, inga React-imports.
 */

const TZ = 'Europe/Stockholm';

/** Returnerar timme (0–23) i Europe/Stockholm för en ISO-tid. */
export function stockholmHour(iso: string): number {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return 0;
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    return Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  } catch {
    return 0;
  }
}

/** Är någon del av [startAt, endAt] inom 00:00–05:00 lokal tid? */
export function overlapsNightWindow(startAt: string, endAt: string): boolean {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  // Sampla varje halvtimme — räcker för att detektera 00–05-överlapp utan tunga beräkningar.
  for (let t = start; t <= end; t += 30 * 60 * 1000) {
    const h = stockholmHour(new Date(t).toISOString());
    if (h < 5) return true;
  }
  // Sista samplet (kan ha hoppats över)
  const hEnd = stockholmHour(new Date(end - 1).toISOString());
  return hEnd < 5;
}

export interface NightGuardBlockInput {
  startAt: string;
  endAt: string;
  kind?: string | null;
}

export interface NightGuardEvidence {
  /** Tidsintervaller från time_reports (oavsett approved-status). */
  timeReportWindows: Array<{ startIso: string; endIso: string | null }>;
  /** Tidsintervaller från location_time_entries. */
  locationEntryWindows: Array<{ startIso: string; endIso: string | null }>;
  /** Tidsintervall för workday som startats av user_timer/manuell källa. */
  manualWorkdayWindow: { startIso: string; endIso: string | null } | null;
  /** Tidsintervaller från travel_time_logs. */
  travelLogWindows?: Array<{ startIso: string; endIso: string | null }>;
}

export type NightGpsOnlyClassification =
  | { decision: 'main'; reason: string }
  | { decision: 'raw_only_night_gps'; reason: string };

const intervalsOverlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => aStart < bEnd && bStart < aEnd;

function blockHasHardEvidence(
  block: NightGuardBlockInput,
  evidence: NightGuardEvidence,
): boolean {
  const aStart = new Date(block.startAt).getTime();
  const aEnd = new Date(block.endAt).getTime();
  if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) return false;

  const check = (windows?: Array<{ startIso: string; endIso: string | null }>): boolean => {
    if (!windows || windows.length === 0) return false;
    for (const w of windows) {
      const bStart = new Date(w.startIso).getTime();
      const bEnd = w.endIso ? new Date(w.endIso).getTime() : Date.now();
      if (!Number.isFinite(bStart) || !Number.isFinite(bEnd)) continue;
      if (intervalsOverlap(aStart, aEnd, bStart, bEnd)) return true;
    }
    return false;
  };

  if (check(evidence.timeReportWindows)) return true;
  if (check(evidence.locationEntryWindows)) return true;
  if (check(evidence.travelLogWindows)) return true;
  if (evidence.manualWorkdayWindow) {
    if (check([evidence.manualWorkdayWindow])) return true;
  }
  return false;
}

/**
 * Huvud-API. Klassar ett candidate-block som 'main' eller 'raw_only_night_gps'.
 *
 * Regel:
 *   - Är blocket helt utanför natt-fönstret (00:00–05:00) → 'main'
 *   - Är det 'transport' / 'break' / 'needs_review' → 'main' (vi suppressar
 *     bara förmodade arbetsblock som ljuger om nattjobb)
 *   - Annars: kräv hård evidens (TR/LTE/manuell workday/travel) som
 *     överlappar blocket. Saknas allt → 'raw_only_night_gps'.
 */
export function classifyNightGpsOnly(
  block: NightGuardBlockInput,
  evidence: NightGuardEvidence,
): NightGpsOnlyClassification {
  if (!overlapsNightWindow(block.startAt, block.endAt)) {
    return { decision: 'main', reason: 'outside_night_window' };
  }
  const kind = (block.kind ?? '').toLowerCase();
  if (kind === 'transport' || kind === 'break' || kind === 'needs_review') {
    return { decision: 'main', reason: `kind=${kind}_never_suppressed` };
  }
  if (blockHasHardEvidence(block, evidence)) {
    return { decision: 'main', reason: 'has_hard_evidence' };
  }
  return {
    decision: 'raw_only_night_gps',
    reason: 'night_window_without_time_report_or_lte_or_manual_workday',
  };
}
