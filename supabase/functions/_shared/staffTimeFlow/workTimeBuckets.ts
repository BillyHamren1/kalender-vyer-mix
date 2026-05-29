// Deno-mirror av src/lib/staffTimeFlow/workTimeBuckets.ts.
// Måste vara IDENTISK i logik. DST-säker via Intl.DateTimeFormat.

const TZ = "Europe/Stockholm";
const NORMAL_START_MIN = 7 * 60;
const NORMAL_END_MIN = 17 * 60;

export interface WorkTimeRowInput {
  kind: string;
  startIso: string | null;
  endIso: string | null;
  minutes: number;
}

export interface WorkTimeBuckets {
  normalMinutes: number;
  overtimeMinutes: number;
  travelMinutes: number;
  totalWorkMinutes: number;
}

function stockholmMinuteOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  let h = 0, m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value) % 24;
    else if (p.type === "minute") m = Number(p.value);
  }
  return h * 60 + m;
}

function isWorkKind(k: string): boolean { return k === "work" || k === "manual_work"; }
function isTravelKind(k: string): boolean { return k === "travel"; }

export function splitWorkIntervalByRule(startIso: string, endIso: string): { normal: number; overtime: number } {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { normal: 0, overtime: 0 };
  const totalMin = Math.round((end - start) / 60_000);
  const safeMin = Math.min(totalMin, 48 * 60);
  let normal = 0, overtime = 0;
  for (let i = 0; i < safeMin; i++) {
    const mod = stockholmMinuteOfDay(new Date(start + i * 60_000));
    if (mod >= NORMAL_START_MIN && mod < NORMAL_END_MIN) normal++;
    else overtime++;
  }
  return { normal, overtime };
}

export function calculateWorkTimeBuckets(
  rows: WorkTimeRowInput[],
  options: { breakMinutes?: number | null } = {},
): WorkTimeBuckets {
  let normal = 0, overtime = 0, travel = 0;
  for (const row of rows) {
    if (isTravelKind(row.kind)) { travel += Math.max(0, Math.round(row.minutes || 0)); continue; }
    if (!isWorkKind(row.kind)) continue;
    if (row.startIso && row.endIso) {
      const r = splitWorkIntervalByRule(row.startIso, row.endIso);
      normal += r.normal; overtime += r.overtime;
    } else {
      normal += Math.max(0, Math.round(row.minutes || 0));
    }
  }
  let bl = Math.max(0, Math.round(options.breakMinutes ?? 0));
  if (bl > 0) {
    const fn = Math.min(normal, bl); normal -= fn; bl -= fn;
    if (bl > 0) { const fo = Math.min(overtime, bl); overtime -= fo; bl -= fo; }
  }
  return { normalMinutes: normal, overtimeMinutes: overtime, travelMinutes: travel, totalWorkMinutes: normal + overtime };
}
