/**
 * Ren hjälpfunktion för Gantt-vyns fas-färgning.
 *
 * Phase härleds från personalkalenderns calendar_events.event_type
 * (inte från bookings.rigdaydate/eventdate/rigdowndate), eftersom
 * förrigg/extra rig-dagar kan finnas i kalendern utan att bookings-
 * datumkolumnerna uppdaterats.
 *
 * Mappning: 'rig' → 'rig', 'rigdown' → 'rigdown', 'event' → 'work'
 */
export type CalendarPhase = 'rig' | 'event' | 'rigdown';
export type GanttPhaseKind = 'rig' | 'rigdown' | 'work';

export interface ResolvePhaseInput {
  targetType?: string | null;
  targetId?: string | null;
  bookingPhaseByDate?: Record<string, CalendarPhase> | null;
  largeProjectPhaseByDate?: Record<string, CalendarPhase> | null;
}

const phaseToKind = (p: CalendarPhase): GanttPhaseKind =>
  p === 'event' ? 'work' : p;

/**
 * Returnerar 'rig' | 'rigdown' | 'work' om en fas hittas, annars null.
 */
export function resolveGanttPhaseKind(input: ResolvePhaseInput): GanttPhaseKind | null {
  const { targetType, targetId, bookingPhaseByDate, largeProjectPhaseByDate } = input;
  if (!targetId) return null;

  if (targetType === 'booking') {
    const p = bookingPhaseByDate?.[targetId];
    if (p) return phaseToKind(p);
  }
  if (targetType === 'large_project' || targetType === 'project') {
    const p = largeProjectPhaseByDate?.[targetId];
    if (p) return phaseToKind(p);
  }
  return null;
}

/**
 * Bygger largeProjectPhaseByDate från (booking_id → phase) + (booking_id → large_project_id).
 * Prioritet vid kollision: rig > rigdown > event.
 */
export function buildLargeProjectPhaseMap(
  bookingPhase: Record<string, CalendarPhase>,
  bookingToLargeProject: Record<string, string | null | undefined>,
): Record<string, CalendarPhase> {
  const priority: Record<CalendarPhase, number> = { rig: 3, rigdown: 2, event: 1 };
  const out: Record<string, CalendarPhase> = {};
  for (const [bookingId, phase] of Object.entries(bookingPhase)) {
    const lpId = bookingToLargeProject[bookingId];
    if (!lpId) continue;
    const existing = out[lpId];
    if (!existing || priority[phase] > priority[existing]) {
      out[lpId] = phase;
    }
  }
  return out;
}
