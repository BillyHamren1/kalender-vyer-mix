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
/**
 * Plockar bokningsnummer (t.ex. "2603-35R1") från fri text.
 * Matchar både "#2603-35R1" och bart "2603-35R1".
 */
export function extractBookingNumberFromText(text?: string | null): string | null {
  if (!text) return null;
  const m = String(text).match(/#?\b(\d{3,5}-[A-Za-z0-9]+)\b/);
  return m ? m[1] : null;
}

/**
 * Slår upp booking-fas via bokningsnummer i titel/subtitle. Används som
 * fallback när targetType/targetId inte pekar på bookingen direkt (t.ex.
 * när blocket är resolved som project istället för booking).
 */
export function resolveBookingPhaseFromTitle(
  b: { title?: string | null; subtitle?: string | null },
  bookingPhaseByDate?: Record<string, CalendarPhase> | null,
): SessionPhaseKind | null {
  if (!bookingPhaseByDate) return null;
  const num = extractBookingNumberFromText(b.title) ?? extractBookingNumberFromText(b.subtitle);
  if (!num) return null;
  const phase = bookingPhaseByDate[num];
  if (!phase) return null;
  return phase === 'event' ? 'work' : phase;
}

export function sessionKeyForBlock(b: SessionBlockInput): string {
  // Bokningsnummer i titel/subtitle är högsta prioritet — unifierar block
  // som engine taggat olika (project vs booking vs null) men som hör till
  // samma jobb.
  const bookingNum =
    extractBookingNumberFromText(b.title) ?? extractBookingNumberFromText(b.subtitle);
  if (bookingNum) return `booking#:${bookingNum}`;
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
// ── Calendar event_type normalisering ─────────────────────────────────────
/**
 * Normaliserar `calendar_events.event_type` till den interna CalendarPhase-
 * vokabulären. Stöder rig/event/rigdown samt camelCase- och snake_case-
 * varianter ("rigDown", "rig_down", "nedrigg").
 *
 * Returnerar null om värdet inte är en phase (t.ex. 'meeting', 'unavailable').
 */
export function normalizeCalendarPhase(value: unknown): CalendarPhase | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (v === 'rig' || v === 'rigg') return 'rig';
  if (v === 'event') return 'event';
  if (v === 'rigdown' || v === 'riggdown' || v === 'nedrigg' || v === 'rigner' || v === 'riggner') return 'rigdown';
  return null;
}

// ── Phase application on V2/Allocation Gantt blocks ───────────────────────
type GanttKindForPhase =
  | 'work'
  | 'warehouse'
  | 'rig'
  | 'rigdown'
  | 'transport'
  | 'review'
  | 'unknown'
  | 'break'
  | 'pre_work'
  | string;

interface PhaseApplicableBlock {
  id: string;
  kind: GanttKindForPhase;
  title?: string | null;
  subtitle?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  meta?: Record<string, unknown> | null;
}

const PHASE_OVERRIDABLE_KINDS = new Set<string>(['work', 'project', 'booking', 'large_project']);
const PHASE_LOCKED_KINDS = new Set<string>([
  'warehouse', 'transport', 'review', 'unknown', 'break', 'private', 'pre_work',
]);

/**
 * Försök hitta targetType/targetId från block-metadata
 * (businessContextResolution.selectedTargetType/Id), när det saknas på blocket.
 */
function resolveTargetFromMeta(b: PhaseApplicableBlock): { targetType?: string | null; targetId?: string | null } {
  const meta = b.meta ?? null;
  const bc = (meta && (meta as any).businessContextResolution) || null;
  if (bc && typeof bc === 'object') {
    const t = (bc as any).selectedTargetType ?? null;
    const id = (bc as any).selectedTargetId ?? null;
    if (t || id) return { targetType: t, targetId: id };
  }
  return {};
}

function resolveBlockPhaseForPlanning<T extends PhaseApplicableBlock>(
  b: T,
  bookingPhaseByDate?: Record<string, CalendarPhase> | null,
  largeProjectPhaseByDate?: Record<string, CalendarPhase> | null,
): SessionPhaseKind | null {
  const targetType = b.targetType ?? null;
  const targetId = b.targetId ?? null;

  // Direkt resolve på block-target
  const direct = resolveGanttPhaseKind({
    targetType,
    targetId,
    bookingPhaseByDate: bookingPhaseByDate ?? undefined,
    largeProjectPhaseByDate: largeProjectPhaseByDate ?? undefined,
  });
  if (direct === 'rig' || direct === 'rigdown') return direct;
  if (direct === 'work') return 'work';

  // Fallback: targetType=project men targetId egentligen large_project_id
  if (targetType === 'project' && targetId && largeProjectPhaseByDate?.[targetId]) {
    const p = largeProjectPhaseByDate[targetId];
    return p === 'event' ? 'work' : p;
  }

  // Fallback: targetType saknas → läs från metadata.businessContextResolution
  if (!targetId) {
    const fromMeta = resolveTargetFromMeta(b);
    if (fromMeta.targetId) {
      const viaMeta = resolveGanttPhaseKind({
        targetType: fromMeta.targetType ?? null,
        targetId: fromMeta.targetId,
        bookingPhaseByDate: bookingPhaseByDate ?? undefined,
        largeProjectPhaseByDate: largeProjectPhaseByDate ?? undefined,
      });
      if (viaMeta === 'rig' || viaMeta === 'rigdown') return viaMeta;
      if (viaMeta === 'work') return 'work';
      if (fromMeta.targetType === 'project' && largeProjectPhaseByDate?.[fromMeta.targetId]) {
        const p = largeProjectPhaseByDate[fromMeta.targetId];
        return p === 'event' ? 'work' : p;
      }
    }
  }

  // Fallback: bokningsnummer i title/subtitle
  const fromTitle = resolveBookingPhaseFromTitle(
    { title: b.title ?? null, subtitle: b.subtitle ?? null },
    bookingPhaseByDate ?? undefined,
  );
  if (fromTitle === 'rig' || fromTitle === 'rigdown') return fromTitle;
  if (fromTitle === 'work') return 'work';

  return null;
}

/**
 * Post-processar Gantt-block från V2 (`displayTimelineV2`) och allocation
 * (`workdayAllocation`) med phase-resolve mot personalkalendern.
 *
 * Block med kind warehouse/transport/review/unknown/break/private rörs aldrig.
 * Endast work/project/booking/large_project-liknande block får kind = rig/rigdown
 * om fas resolveras. Inkluderar sessions-arv: om något syskonblock i samma
 * session resolveras till rig/rigdown ärver övriga samma fas.
 */
export function applyPlanningPhaseToGanttBlocks<T extends PhaseApplicableBlock>(
  blocks: T[],
  bookingPhaseByDate?: Record<string, CalendarPhase> | null,
  largeProjectPhaseByDate?: Record<string, CalendarPhase> | null,
): T[] {
  if (!blocks || blocks.length === 0) return blocks;

  // Per-block direkt fas (utan sessionsarv)
  const perBlockPhase: Record<string, SessionPhaseKind | null> = {};
  for (const b of blocks) {
    if (PHASE_LOCKED_KINDS.has(String(b.kind))) {
      perBlockPhase[b.id] = null;
      continue;
    }
    perBlockPhase[b.id] = resolveBlockPhaseForPlanning(b, bookingPhaseByDate, largeProjectPhaseByDate);
  }

  // Sessionsarv: rig/rigdown smittar syskon
  const sessionMap = buildSessionPhaseMap(
    blocks.map((b) => ({
      id: b.id,
      targetType: b.targetType ?? null,
      targetId: b.targetId ?? null,
      title: b.title ?? null,
      subtitle: b.subtitle ?? null,
      startAt: b.startAt ?? null,
      endAt: b.endAt ?? null,
    })),
    perBlockPhase,
  );

  return blocks.map((b) => {
    if (PHASE_LOCKED_KINDS.has(String(b.kind))) return b;
    if (!PHASE_OVERRIDABLE_KINDS.has(String(b.kind))) return b;

    let phase: SessionPhaseKind | null = perBlockPhase[b.id] ?? null;
    if (phase !== 'rig' && phase !== 'rigdown') {
      const inherited = sessionMap[sessionKeyForBlock({
        id: b.id,
        title: b.title ?? null,
        subtitle: b.subtitle ?? null,
        targetType: b.targetType ?? null,
        targetId: b.targetId ?? null,
      })];
      if (inherited === 'rig' || inherited === 'rigdown') phase = inherited;
    }

    if (phase === 'rig') return { ...b, kind: 'rig' as GanttKindForPhase };
    if (phase === 'rigdown') return { ...b, kind: 'rigdown' as GanttKindForPhase };
    if (phase === 'work') return { ...b, kind: 'work' as GanttKindForPhase };
    return b;
  });
}

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
