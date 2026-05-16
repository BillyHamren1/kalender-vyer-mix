/**
 * Display Timeline V2 → Gantt Block mapper (UI-only).
 *
 * Tar `displayTimelineBlocksV2` (Lager 4.1 från get-staff-presence-day) och
 * översätter till den enkla `GanttBlockLite`-formen som StaffGanttView ritar.
 * Pure function, ingen DOM, inga writes.
 *
 * Också fallback-mapper för `workdayAllocationSegments` (Lager 3) så att Gantt
 * kan rita NÅGOT så fort motorn producerat segment, även om V2 inte hunnit
 * konsolidera dem.
 */

export type GanttKindLite =
  | 'work'
  | 'warehouse'
  | 'rig'
  | 'rigdown'
  | 'transport'
  | 'review'
  | 'unknown'
  | 'break'
  | 'pre_work';

export interface GanttBlockFromTimeline {
  id: string;
  kind: GanttKindLite;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  title: string;
  subtitle: string | null;
  targetType: string | null;
  targetId: string | null;
  address: string | null;
  warnings: string[];
  /** Vilken källa blocket kom från — för debug och tooltip-prefix. */
  source: 'displayTimelineV2' | 'workdayAllocation';
  /** Råa metadata för tooltip/drawer (severity, displayType etc). */
  meta?: Record<string, unknown>;
}

const DETECT_RIG = /\brigg?\b|rigday|rigg?dag|bygg(?!nad)/i;
const DETECT_RIGDOWN = /\brigdown\b|rigga\s*ner|nedrigg|rig\s*ner|rig-?ner/i;

const detectPhaseKind = (
  title?: string | null,
  subtitle?: string | null,
): 'rig' | 'rigdown' | null => {
  const hay = `${title ?? ''} ${subtitle ?? ''}`;
  if (DETECT_RIGDOWN.test(hay)) return 'rigdown';
  if (DETECT_RIG.test(hay)) return 'rig';
  return null;
};

// ── Display Timeline V2 ──────────────────────────────────────────────────

export interface DisplayTimelineBlockLite {
  id: string;
  startAt: string;
  endAt: string;
  title?: string | null;
  subtitle?: string | null;
  displayType:
    | 'project'
    | 'large_project'
    | 'booking'
    | 'warehouse'
    | 'supplier'
    | 'travel'
    | 'commute'
    | 'unlinked_address'
    | 'private'
    | 'review'
    | 'break_or_gap';
  targetType?: string | null;
  targetId?: string | null;
  label?: string | null;
  address?: string | null;
  durationMinutes?: number;
  severity?: 'normal' | 'info' | 'warning' | 'needs_user_review' | string;
  confidence?: string | null;
  warnings?: string[] | null;
  humanWarnings?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

const DISPLAY_TYPE_TO_KIND: Record<
  DisplayTimelineBlockLite['displayType'],
  GanttKindLite | 'work_phase' | 'hidden'
> = {
  project: 'work_phase',
  large_project: 'work_phase',
  booking: 'work_phase',
  warehouse: 'warehouse',
  supplier: 'work', // tills vidare — supplier-besök visas som arbete
  travel: 'transport',
  commute: 'transport',
  unlinked_address: 'review',
  private: 'hidden',
  review: 'review',
  break_or_gap: 'break',
};

const resolveKindForDisplayBlock = (
  b: DisplayTimelineBlockLite,
): GanttKindLite | null => {
  const mapped = DISPLAY_TYPE_TO_KIND[b.displayType];
  if (!mapped) return 'unknown';
  if (mapped === 'hidden') return null;
  if (mapped === 'work_phase') {
    const phase = detectPhaseKind(b.title, b.subtitle);
    if (phase) return phase;
    return 'work';
  }
  if (mapped === 'review' && b.displayType === 'unlinked_address') {
    // Eskalera till "review" om severity kräver det, annars stanna review
    // (visas redan dämpat). Använd `unknown` bara om severity är normal/info.
    if (b.severity === 'needs_user_review' || b.severity === 'warning') return 'review';
    return 'unknown';
  }
  return mapped;
};

const fallbackTitleForDisplayBlock = (b: DisplayTimelineBlockLite): string => {
  const t = (b.title ?? '').trim();
  if (t) return t;
  const lab = (b.label ?? '').trim();
  if (lab) return lab;
  switch (b.displayType) {
    case 'warehouse': return 'Lager';
    case 'travel': return 'Resa';
    case 'commute': return 'Pendling';
    case 'supplier': return 'Leverantör';
    case 'unlinked_address': return 'Okänd arbetsadress';
    case 'review': return 'Behöver granskning';
    case 'break_or_gap': return 'Glapp i dagen';
    case 'private': return 'Privat tid';
    default: return 'Arbete';
  }
};

const durationMin = (startAt: string, endAt: string, fallback?: number): number => {
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  const s = Date.parse(startAt);
  const e = Date.parse(endAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.round((e - s) / 60000);
};

export function mapDisplayTimelineBlocksToGantt(
  blocks: readonly DisplayTimelineBlockLite[] | null | undefined,
): GanttBlockFromTimeline[] {
  if (!blocks || blocks.length === 0) return [];
  const out: GanttBlockFromTimeline[] = [];
  for (const b of blocks) {
    const kind = resolveKindForDisplayBlock(b);
    if (!kind) continue; // private och liknande döljs från huvud-Gantt
    out.push({
      id: b.id,
      kind,
      startAt: b.startAt,
      endAt: b.endAt,
      durationMinutes: durationMin(b.startAt, b.endAt, b.durationMinutes),
      title: fallbackTitleForDisplayBlock(b),
      subtitle: b.subtitle ?? b.address ?? null,
      targetType: b.targetType ?? null,
      targetId: b.targetId ?? null,
      address: b.address ?? null,
      warnings: Array.isArray(b.humanWarnings) && b.humanWarnings.length > 0
        ? [...b.humanWarnings]
        : Array.isArray(b.warnings) ? [...b.warnings] : [],
      source: 'displayTimelineV2',
      meta: {
        displayType: b.displayType,
        severity: b.severity ?? null,
        confidence: b.confidence ?? null,
      },
    });
  }
  return out;
}

// ── Workday Allocation (Lager 3) fallback ────────────────────────────────

export interface WorkdayAllocationSegmentLite {
  id?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  startIso?: string | null;
  endIso?: string | null;
  allocationType?: string | null;
  type?: string | null;
  label?: string | null;
  title?: string | null;
  address?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  durationMinutes?: number | null;
  warnings?: string[] | null;
  confidence?: string | null;
}

const ALLOC_TYPE_TO_KIND: Record<string, GanttKindLite | 'work_phase' | 'hidden'> = {
  project_work: 'work_phase',
  large_project_work: 'work_phase',
  booking_work: 'work_phase',
  warehouse_work: 'warehouse',
  supplier_visit: 'work',
  work_travel: 'transport',
  commute_travel: 'transport',
  unlinked_work_address: 'review',
  private_time: 'hidden',
  needs_work_allocation_review: 'review',
};

export function mapWorkdayAllocationSegmentsToGantt(
  segments: readonly WorkdayAllocationSegmentLite[] | null | undefined,
): GanttBlockFromTimeline[] {
  if (!segments || segments.length === 0) return [];
  const out: GanttBlockFromTimeline[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const startAt = s.startAt ?? s.startIso ?? null;
    const endAt = s.endAt ?? s.endIso ?? null;
    if (!startAt || !endAt) continue;
    const allocType = (s.allocationType ?? s.type ?? '').toString();
    const mapped = ALLOC_TYPE_TO_KIND[allocType];
    if (mapped === 'hidden') continue;
    let kind: GanttKindLite;
    if (!mapped) {
      kind = 'unknown';
    } else if (mapped === 'work_phase') {
      kind = detectPhaseKind(s.title ?? s.label, null) ?? 'work';
    } else {
      kind = mapped;
    }
    const title = (s.title ?? s.label ?? '').trim() || 'Arbete';
    out.push({
      id: s.id ?? `alloc-${i}-${startAt}`,
      kind,
      startAt,
      endAt,
      durationMinutes: durationMin(startAt, endAt, s.durationMinutes ?? undefined),
      title,
      subtitle: s.address ?? null,
      targetType: s.targetType ?? null,
      targetId: s.targetId ?? null,
      address: s.address ?? null,
      warnings: Array.isArray(s.warnings) ? [...s.warnings] : [],
      source: 'workdayAllocation',
      meta: {
        allocationType: allocType,
        confidence: s.confidence ?? null,
      },
    });
  }
  return out;
}

// ── Source selector ──────────────────────────────────────────────────────

export type GanttBlockSource =
  | 'displayTimelineV2'
  | 'workdayAllocation'
  | 'reportCandidate'
  | 'empty';

export interface SelectGanttSourceInput {
  displayTimelineBlocksV2?: readonly DisplayTimelineBlockLite[] | null;
  workdayAllocationSegments?: readonly WorkdayAllocationSegmentLite[] | null;
  reportCandidateBlocksCount: number;
}

/**
 * Deterministisk källprioritet. V2 vinner; om V2 är tomt och legacy finns,
 * fallar vi tillbaka till legacy så vyn aldrig blir tom p.g.a. fel källa.
 */
export function selectGanttBlockSource(input: SelectGanttSourceInput): GanttBlockSource {
  const v2 = input.displayTimelineBlocksV2?.length ?? 0;
  const alloc = input.workdayAllocationSegments?.length ?? 0;
  const legacy = input.reportCandidateBlocksCount;
  if (v2 > 0) return 'displayTimelineV2';
  if (alloc > 0) return 'workdayAllocation';
  if (legacy > 0) return 'reportCandidate';
  return 'empty';
}
