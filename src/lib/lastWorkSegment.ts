/**
 * lastWorkSegment — gap-baserad restidshärledning
 * ================================================
 *
 * OFFICIELL TIDMODELL (Tidappen):
 *   • Dagtimer = hela arbetsdagen.
 *   • Aktivitet = projekt/plats/bokning inuti dagen.
 *   • Restid   = GAPET mellan två aktiviteter (stopp → nästa start).
 *
 * Den här modulen lagrar det senast STOPPADE arbetssegmentet i
 * localStorage så att nästa start kan beräkna gap = next_start − prev_stop
 * och föreslå/skapa en restidsrad utan att förlita sig på live GPS-travel.
 *
 * Endast riktiga arbetstargets räknas: project | booking | location.
 *
 * Startregler (enkel första iteration):
 *   • <10 min   → ignorera (samma plats / kort paus)
 *   • 10–180 min → möjlig restid → skapa candidate (auto)
 *   • >180 min  → needs_review (för långt — ingen auto-skapelse)
 */

const STORAGE_KEY = 'eventflow-last-work-segment-v1';

export type WorkTargetKind = 'project' | 'booking' | 'location';

export interface LastWorkSegment {
  /** Lokal datumnyckel YYYY-MM-DD — gap räknas bara inom samma dag. */
  date: string;
  targetType: WorkTargetKind;
  targetId: string;
  targetLabel: string;
  stoppedAtIso: string;
}

export type GapDecision =
  | { kind: 'too_short'; gapMin: number }
  | { kind: 'candidate'; gapMin: number }
  | { kind: 'needs_review'; gapMin: number }
  | { kind: 'cross_day'; gapMin: number }
  | { kind: 'no_previous' };

export const GAP_MIN_MIN = 10;
export const GAP_MAX_MIN_AUTO = 180;

function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function readLastWorkSegment(): LastWorkSegment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastWorkSegment;
    if (!parsed?.targetType || !parsed?.stoppedAtIso) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function recordWorkSegmentStop(seg: Omit<LastWorkSegment, 'date'>): void {
  try {
    const full: LastWorkSegment = {
      ...seg,
      date: todayKey(new Date(seg.stoppedAtIso)),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  } catch {
    /* best-effort */
  }
}

export function clearLastWorkSegment(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Beräkna gap mellan föregående stopp och en föreslagen ny start.
 * Returnerar en GapDecision som anropare kan agera på.
 */
export function evaluateGap(
  nextStartIso: string,
  prev: LastWorkSegment | null = readLastWorkSegment(),
): GapDecision {
  if (!prev) return { kind: 'no_previous' };
  const prevDay = prev.date;
  const nextDay = todayKey(new Date(nextStartIso));
  const gapMs = new Date(nextStartIso).getTime() - new Date(prev.stoppedAtIso).getTime();
  const gapMin = Math.round(gapMs / 60_000);

  if (prevDay !== nextDay) return { kind: 'cross_day', gapMin };
  if (gapMin < GAP_MIN_MIN) return { kind: 'too_short', gapMin };
  if (gapMin > GAP_MAX_MIN_AUTO) return { kind: 'needs_review', gapMin };
  return { kind: 'candidate', gapMin };
}
