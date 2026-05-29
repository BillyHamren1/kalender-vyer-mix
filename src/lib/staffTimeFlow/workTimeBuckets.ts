/**
 * workTimeBuckets — gemensam beräkning av normal arbetstid vs övertid.
 *
 * Regler (Europe/Stockholm lokal tid):
 *   - Normal arbetstid: 07:00–17:00
 *   - Övertid: all arbetstid utanför 07:00–17:00 (inkl. nattpass och över midnatt)
 *   - Restid räknas separat (travelMinutes), aldrig som normal/overtime.
 *   - Hidden/unknown/private/gap räknas inte alls.
 *
 * Rast (breakMinutes utan exakt position):
 *   - Dras från normalMinutes först.
 *   - Spiller över till overtimeMinutes om större än normal.
 *   - travelMinutes minskas aldrig av rast.
 *
 * DST-säker: använder Intl.DateTimeFormat för Stockholm wall-clock, inte
 * iso.slice(11,16) eller manuella +2-offsets.
 */

const TZ = "Europe/Stockholm";
const NORMAL_START_MIN = 7 * 60;   // 07:00
const NORMAL_END_MIN = 17 * 60;    // 17:00

export interface WorkTimeRowInput {
  /** "work" räknas som arbete, "travel" som restid; allt annat ignoreras. */
  kind: string;
  startIso: string | null;
  endIso: string | null;
  /** Fallback om start/end saknas eller är ogiltiga. */
  minutes: number;
}

export interface WorkTimeBuckets {
  normalMinutes: number;
  overtimeMinutes: number;
  travelMinutes: number;
  totalWorkMinutes: number;
}

/** Hämta minute-of-day (0..1439) i Europe/Stockholm för en given UTC-instant. */
export function stockholmMinuteOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  let h = 0, m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value) % 24;
    else if (p.type === "minute") m = Number(p.value);
  }
  return h * 60 + m;
}

function isWorkKind(kind: string): boolean {
  return kind === "work" || kind === "manual_work";
}
function isTravelKind(kind: string): boolean {
  return kind === "travel";
}

/**
 * Dela ett arbetspass [start, end] mot Stockholm 07:00–17:00.
 * DST-säkert via minutvis iteration (worst case ~1440 steg per pass).
 */
export function splitWorkIntervalByRule(startIso: string, endIso: string): { normal: number; overtime: number } {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { normal: 0, overtime: 0 };
  }
  const totalMin = Math.round((end - start) / 60_000);
  // Hård gräns: ett enskilt pass kan rimligen inte vara mer än 48h.
  const safeMin = Math.min(totalMin, 48 * 60);
  let normal = 0;
  let overtime = 0;
  for (let i = 0; i < safeMin; i++) {
    // Klassa varje minut efter dess STARTtid (minute i = [start + i, start + i + 1)).
    const d = new Date(start + i * 60_000);
    const mod = stockholmMinuteOfDay(d);
    if (mod >= NORMAL_START_MIN && mod < NORMAL_END_MIN) normal++;
    else overtime++;
  }
  return { normal, overtime };
}

export interface CalculateWorkTimeBucketsOptions {
  /** Rast i minuter utan exakt position; dras från normal först. */
  breakMinutes?: number | null;
}

export function calculateWorkTimeBuckets(
  rows: WorkTimeRowInput[],
  options: CalculateWorkTimeBucketsOptions = {},
): WorkTimeBuckets {
  let normalMinutes = 0;
  let overtimeMinutes = 0;
  let travelMinutes = 0;

  for (const row of rows) {
    if (isTravelKind(row.kind)) {
      travelMinutes += Math.max(0, Math.round(row.minutes || 0));
      continue;
    }
    if (!isWorkKind(row.kind)) continue;

    if (row.startIso && row.endIso) {
      const { normal, overtime } = splitWorkIntervalByRule(row.startIso, row.endIso);
      normalMinutes += normal;
      overtimeMinutes += overtime;
    } else {
      // Fallback: ingen tidsposition — räkna allt som normal arbetstid.
      normalMinutes += Math.max(0, Math.round(row.minutes || 0));
    }
  }

  // Rastavdrag: först från normal, sedan från overtime. Travel orörd.
  let breakLeft = Math.max(0, Math.round(options.breakMinutes ?? 0));
  if (breakLeft > 0) {
    const fromNormal = Math.min(normalMinutes, breakLeft);
    normalMinutes -= fromNormal;
    breakLeft -= fromNormal;
    if (breakLeft > 0) {
      const fromOvertime = Math.min(overtimeMinutes, breakLeft);
      overtimeMinutes -= fromOvertime;
      breakLeft -= fromOvertime;
    }
  }

  return {
    normalMinutes,
    overtimeMinutes,
    travelMinutes,
    totalWorkMinutes: normalMinutes + overtimeMinutes,
  };
}
