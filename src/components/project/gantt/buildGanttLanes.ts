/**
 * Group GanttCalendarEvents by phase + source_date and produce labelled lanes.
 *
 * Each lane = one phase ("rig" | "event" | "rigDown").
 * Each cell  = one (phase, date) tuple. May contain >1 event when a large
 * project has multiple sibling bookings on the same day; we render ONE bar
 * per cell because the staff calendar treats them as a single phase day.
 */
import type { GanttCalendarEvent, GanttPhase } from '@/hooks/useProjectGanttEvents';

export interface GanttCell {
  phase: GanttPhase;
  date: string;             // YYYY-MM-DD
  dayIndex: number;         // 1-based per-phase ordinal across the project
  startISO: string;
  endISO: string;
  label: string;            // "Rigg dag 1", "Event", "Demont. dag 2"
  events: GanttCalendarEvent[];
}

export interface GanttLane {
  phase: GanttPhase;
  title: string;
  cells: GanttCell[];
}

const PHASE_TITLE: Record<GanttPhase, string> = {
  rig: 'Riggning',
  event: 'Event',
  rigDown: 'Demontering',
};

const PHASE_LABEL_SHORT: Record<GanttPhase, string> = {
  rig: 'Rigg',
  event: 'Event',
  rigDown: 'Demont.',
};

export function buildGanttLanes(events: GanttCalendarEvent[]): GanttLane[] {
  const byPhase: Record<GanttPhase, Map<string, GanttCalendarEvent[]>> = {
    rig: new Map(),
    event: new Map(),
    rigDown: new Map(),
  };

  for (const ev of events) {
    if (!ev.source_date) continue;
    const bucket = byPhase[ev.event_type];
    if (!bucket) continue;
    if (!bucket.has(ev.source_date)) bucket.set(ev.source_date, []);
    bucket.get(ev.source_date)!.push(ev);
  }

  return (Object.keys(byPhase) as GanttPhase[]).map((phase) => {
    const sortedDates = Array.from(byPhase[phase].keys()).sort();
    const multiDay = sortedDates.length > 1;

    const cells: GanttCell[] = sortedDates.map((date, idx) => {
      const evs = byPhase[phase].get(date)!;
      // Use the earliest start + latest end of the group to size the bar.
      const sorted = [...evs].sort((a, b) => a.start_time.localeCompare(b.start_time));
      const startISO = sorted[0].start_time;
      const endISO = sorted.reduce((acc, e) => (e.end_time > acc ? e.end_time : acc), sorted[0].end_time);
      const label = phase === 'event'
        ? PHASE_LABEL_SHORT.event + (multiDay ? ` dag ${idx + 1}` : '')
        : `${PHASE_LABEL_SHORT[phase]}${multiDay ? ` dag ${idx + 1}` : ''}`;
      return { phase, date, dayIndex: idx + 1, startISO, endISO, label, events: evs };
    });

    return { phase, title: PHASE_TITLE[phase], cells };
  });
}

export function getOverallRange(lanes: GanttLane[]): { minDate: string; maxDate: string } | null {
  const dates = lanes.flatMap((l) => l.cells.map((c) => c.date));
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return { minDate: sorted[0], maxDate: sorted[sorted.length - 1] };
}
