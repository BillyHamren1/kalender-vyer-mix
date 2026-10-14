/** Local clock values here are normalized by the canonical warehouse read hook. */
export interface PlannedJob { date: string; startTime: string | null; endTime: string | null; status?: string; plannedDurationMinutes?: number | null }
export const clockMinutes = (value: string | null): number | null => {
  if (value === '24:00') return 24 * 60;
  const match = value?.match(/^(\d{2}):(\d{2})$/);
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return +match[1] * 60 + +match[2];
};
export function durationMinutes(job: PlannedJob): number | null {
  if (job.plannedDurationMinutes != null && Number.isFinite(job.plannedDurationMinutes) && job.plannedDurationMinutes >= 0) return job.plannedDurationMinutes;
  const start = clockMinutes(job.startTime), end = clockMinutes(job.endTime);
  // Clock-only values cannot establish a cross-day duration safely.
  return start !== null && end !== null && end > start ? end - start : null;
}
export function planningSummary(jobs: PlannedJob[]): string {
  const durations = jobs.map(durationMinutes);
  const total = durations.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const unknown = durations.filter(value => value === null).length;
  return `${Math.floor(total / 60)} h${total % 60 ? ` ${total % 60} min` : ''} planerat${unknown ? ` · ${unknown} utan fullständig tid` : ''}`;
}
export function conflictingJobs<T extends PlannedJob>(jobs: T[]): Set<T> {
  const result = new Set<T>();
  jobs.forEach((a, index) => jobs.slice(index + 1).forEach(b => {
    if (a.date !== b.date || ['cancelled', 'completed'].includes(a.status || '') || ['cancelled', 'completed'].includes(b.status || '')) return;
    const as = clockMinutes(a.startTime), ae = clockMinutes(a.endTime), bs = clockMinutes(b.startTime), be = clockMinutes(b.endTime);
    if (as !== null && ae !== null && bs !== null && be !== null && ae > as && be > bs && as < be && bs < ae) { result.add(a); result.add(b); }
  }));
  return result;
}
/** Use visual bounds too: short appointments must not cover each other's cards. */
export function timelineLanes<T>(items: { job: T; top: number; height: number }[]) {
  const ends: number[] = [];
  const placed = [...items].sort((a, b) => a.top - b.top).map(item => {
    let lane = ends.findIndex(end => end <= item.top);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.top + item.height;
    return { ...item, lane };
  });
  return { items: placed, laneCount: Math.max(1, ends.length) };
}
