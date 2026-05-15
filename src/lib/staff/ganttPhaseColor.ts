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

// ── Session-level phase inheritance ────────────────────────────────────────
// Mål: ett jobb (samma target/session) ska inte visa blandad ARBETE/RIGG.
// Om något block i sessionen har en planerad fas (rig/rigdown), ärver alla
// "work"-block samma fas. "ARBETE" används bara om INGET block i sessionen
// kan resolveras till en fas.

export type SessionPhaseKind = 'rig' | 'rigdown' | 'work';

export interface SessionBlockInput {
  id: string;
  targetType?: string | null;
  targetId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}

/**
 * Bygger en sessionsnyckel som grupperar block som hör till samma jobb.
 * Prioritet: targetType:targetId → normaliserad titel → block-id (unik).
 */
export function sessionKeyForBlock(b: SessionBlockInput): string {
  if (b.targetId && b.targetType) return `${b.targetType}:${b.targetId}`;
  if (b.targetId) return `tid:${b.targetId}`;
  const norm = (b.title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm) return `title:${norm}`;
  return `block:${b.id}`;
}

const PHASE_PRIORITY: Record<SessionPhaseKind, number> = { rig: 3, rigdown: 2, work: 0 };

/**
 * Bygger en map sessionKey → härdad fas (rig/rigdown) baserat på alla
 * block i samma session. Block som redan resolveras till rig/rigdown
 * "smittar" syskonblock som annars skulle bli work.
 *
 * `perBlockPhase` är fas per block (efter resolveGanttPhaseKind + ev. text-detektering),
 * eller null om inget hittades.
 */
export function buildSessionPhaseMap(
  blocks: SessionBlockInput[],
  perBlockPhase: Record<string, SessionPhaseKind | null | undefined>,
): Record<string, SessionPhaseKind> {
  const out: Record<string, SessionPhaseKind> = {};
  for (const b of blocks) {
    const phase = perBlockPhase[b.id];
    if (!phase || phase === 'work') continue;
    const key = sessionKeyForBlock(b);
    const existing = out[key];
    if (!existing || PHASE_PRIORITY[phase] > PHASE_PRIORITY[existing]) {
      out[key] = phase;
    }
  }
  return out;
}
