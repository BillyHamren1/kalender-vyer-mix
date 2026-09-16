/**
 * Jobbfas för ett projekt — härledd ENBART av datum (rigg, event, nedrigg).
 *
 * Detta är INTE projektets status (Aktivt / Stängt / Avbokat), utan en
 * tidsbaserad lins: pågår jobbet nu, ligger det framåt, eller är det över?
 *
 * Regel: ett jobb räknas som avslutat först DAGEN EFTER sista nedriggdagen.
 */

export type ProjectJobPhase = 'upcoming' | 'active' | 'finished' | 'undated';

export interface JobPhaseInput {
  rigdaydate?: string | null;
  eventdate?: string | null;
  rigdowndate?: string | null;
}

export const JOB_PHASE_LABEL: Record<ProjectJobPhase, string> = {
  upcoming: 'Kommande',
  active: 'Pågående',
  finished: 'Avslutade',
  undated: 'Utan datum',
};

/** YYYY-MM-DD i lokal tid. */
export const toDayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dayKey = (raw: string | null | undefined): string | null => {
  if (!raw || typeof raw !== 'string' || raw.length < 10) return null;
  const key = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
};

/** Sista jobbdagen (nedrigg → event → rigg). */
export function getJobLastDay(p: JobPhaseInput): string | null {
  const keys = [dayKey(p.rigdowndate), dayKey(p.eventdate), dayKey(p.rigdaydate)].filter(
    (k): k is string => !!k,
  );
  if (keys.length === 0) return null;
  return keys.reduce((max, k) => (k > max ? k : max));
}

/** Första jobbdagen (rigg → event → nedrigg). */
export function getJobFirstDay(p: JobPhaseInput): string | null {
  const keys = [dayKey(p.rigdaydate), dayKey(p.eventdate), dayKey(p.rigdowndate)].filter(
    (k): k is string => !!k,
  );
  if (keys.length === 0) return null;
  return keys.reduce((min, k) => (k < min ? k : min));
}

export function getProjectJobPhase(p: JobPhaseInput, today: Date = new Date()): ProjectJobPhase {
  const first = getJobFirstDay(p);
  const last = getJobLastDay(p);
  if (!first || !last) return 'undated';

  const now = toDayKey(today);
  // Avslutat först dagen EFTER sista nedriggdagen.
  if (now > last) return 'finished';
  if (now < first) return 'upcoming';
  return 'active';
}
