/**
 * Display Timeline V2 → Gantt Block mapper (UI-only).
 *
 * Tar `displayTimelineBlocksV2` (Lager 4.1 från get-staff-presence-day) och
 * översätter till den enkla `GanttBlockFromTimeline`-formen som StaffGanttView
 * ritar. Pure function, ingen DOM, inga writes.
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
  targetLabel?: string | null;
  label?: string | null;
  address?: string | null;
  addressLabel?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  centroid?: { lat: number; lng: number } | null;
  sourceLocationTruthSegmentIds?: string[] | null;
  sourceAllocationSegmentIds?: string[] | null;
  durationMinutes?: number;
  severity?: 'normal' | 'info' | 'warning' | 'needs_user_review' | string;
  confidence?: string | null;
  warnings?: string[] | null;
  humanWarnings?: string[] | null;
  metadata?: Record<string, unknown> | null;
  // Map Trace 4 — fysisk plats och matchnings-trace propageras från Lager 2/3.
  physicalLocationLabel?: string | null;
  physicalLocationAddress?: string | null;
  physicalLocationLat?: number | null;
  physicalLocationLng?: number | null;
  physicalLocationSource?: string | null;
  physicalLocationConfidence?: string | null;
  locationMatchDiagnostics?: unknown;
  businessContextResolution?: unknown;
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
    // Time Engine 4 — unlinked_address är ARBETE som saknar projekt-koppling.
    // Endast verklig konflikt (needs_user_review) renderas som review-block.
    // warning/info → kind 'work' med chips/warnings som förklarar.
    if (b.severity === 'needs_user_review') return 'review';
    return 'work';
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
        label: b.label ?? null,
        targetLabel: b.targetLabel ?? null,
        addressLabel: b.addressLabel ?? null,
        locationName: b.locationName ?? null,
        latitude: b.latitude ?? b.centroid?.lat ?? null,
        longitude: b.longitude ?? b.centroid?.lng ?? null,
        centroid: b.centroid ?? null,
        sourceLocationTruthSegmentIds: Array.isArray(b.sourceLocationTruthSegmentIds)
          ? [...b.sourceLocationTruthSegmentIds]
          : null,
        sourceAllocationSegmentIds: Array.isArray(b.sourceAllocationSegmentIds)
          ? [...b.sourceAllocationSegmentIds]
          : null,
        // Map Trace 4 — fysisk plats + matchnings-trace till block-detalj.
        physicalLocationLabel:
          b.physicalLocationLabel
          ?? ((b.metadata as any)?.physicalLocationLabel ?? null),
        physicalLocationAddress:
          b.physicalLocationAddress
          ?? ((b.metadata as any)?.physicalLocationAddress ?? null),
        physicalLocationLat:
          b.physicalLocationLat
          ?? ((b.metadata as any)?.physicalLocationLat ?? null),
        physicalLocationLng:
          b.physicalLocationLng
          ?? ((b.metadata as any)?.physicalLocationLng ?? null),
        physicalLocationSource:
          b.physicalLocationSource
          ?? ((b.metadata as any)?.physicalLocationSource ?? null),
        physicalLocationConfidence:
          b.physicalLocationConfidence
          ?? ((b.metadata as any)?.physicalLocationConfidence ?? null),
        locationMatchDiagnostics:
          b.locationMatchDiagnostics
          ?? (b.metadata as any)?.locationMatchDiagnostics
          ?? null,
        businessContextResolution:
          b.businessContextResolution
          ?? (b.metadata as any)?.businessContextResolution
          ?? null,
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
  addressLabel?: string | null;
  locationName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  centroid?: { lat: number; lng: number } | null;
  sourceLocationTruthSegmentIds?: string[] | null;
  sourceAllocationSegmentIds?: string[] | null;
  durationMinutes?: number | null;
  warnings?: string[] | null;
  confidence?: string | null;
  // Map Trace 4 — fysisk plats + matchnings-trace propageras från Lager 2/3.
  physicalLocationLabel?: string | null;
  physicalLocationAddress?: string | null;
  physicalLocationLat?: number | null;
  physicalLocationLng?: number | null;
  physicalLocationSource?: string | null;
  physicalLocationConfidence?: string | null;
  locationMatchDiagnostics?: unknown;
  businessContextResolution?: unknown;
  businessContextStatus?: string | null;
}

const ALLOC_TYPE_TO_KIND: Record<string, GanttKindLite | 'work_phase' | 'hidden'> = {
  project_work: 'work_phase',
  large_project_work: 'work_phase',
  booking_work: 'work_phase',
  warehouse_work: 'warehouse',
  supplier_visit: 'work',
  work_travel: 'transport',
  commute_travel: 'transport',
  unlinked_work_address: 'work',
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
        label: s.label ?? null,
        targetLabel: s.targetLabel ?? null,
        addressLabel: s.addressLabel ?? null,
        locationName: s.locationName ?? null,
        latitude: s.latitude ?? s.centroid?.lat ?? null,
        longitude: s.longitude ?? s.centroid?.lng ?? null,
        centroid: s.centroid ?? null,
        sourceLocationTruthSegmentIds: Array.isArray(s.sourceLocationTruthSegmentIds)
          ? [...s.sourceLocationTruthSegmentIds]
          : null,
        sourceAllocationSegmentIds: Array.isArray(s.sourceAllocationSegmentIds)
          ? [...s.sourceAllocationSegmentIds]
          : null,
        physicalLocationLabel: s.physicalLocationLabel ?? null,
        physicalLocationAddress: s.physicalLocationAddress ?? null,
        physicalLocationLat: s.physicalLocationLat ?? null,
        physicalLocationLng: s.physicalLocationLng ?? null,
        physicalLocationSource: s.physicalLocationSource ?? null,
        physicalLocationConfidence: s.physicalLocationConfidence ?? null,
        locationMatchDiagnostics: s.locationMatchDiagnostics ?? null,
        businessContextResolution: s.businessContextResolution ?? null,
        businessContextStatus: s.businessContextStatus ?? null,
      },
    });
  }
  return out;
}

// ── Stabil sessionKey för V2/allocation-block ────────────────────────────

const normalizeKeyPart = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Bygg en stabil sessionKey som låter merge-passet slå ihop flera V2/allocation-
 * block på samma jobb/plats.
 *
 * Prioritet:
 *   1. target:{targetType}:{targetId}
 *   2. address:{normalized}
 *   3. title:{normalized}
 *   4. id:{id} (sista utvägen — block får inte mergeas med någon)
 */
export function sessionKeyFromTimelineBlock(b: {
  id: string;
  title?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  address?: string | null;
}): string {
  if (b.targetType && b.targetId) {
    return `target:${b.targetType}:${b.targetId}`;
  }
  if (b.address && b.address.trim()) {
    return `address:${normalizeKeyPart(b.address.trim())}`;
  }
  if (b.title && b.title.trim()) {
    return `title:${normalizeKeyPart(b.title.trim())}`;
  }
  return `id:${b.id}`;
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
 * @deprecated Bygger valet på RÅA counts. Använd `selectGanttSourceFromMapped`
 * — det förhindrar tomma Gantts när V2 fanns men bara innehöll private/hidden-
 * block (mapped → 0). Behålls för bakåtkompatibilitet med tester.
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

export interface SelectFromMappedInput {
  mappedV2Count: number;
  mappedAllocationCount: number;
  legacyCount: number;
}

/**
 * Deterministisk källprioritet baserad på RENDERBARA block (efter mapping).
 *
 * Använd detta när du har kört `mapDisplayTimelineBlocksToGantt` /
 * `mapWorkdayAllocationSegmentsToGantt`. Då räknar vi bara block som faktiskt
 * kan ritas — så en V2-uppsättning med enbart private/hidden eskalerar
 * korrekt till allocation eller legacy istället för att lämna tom Gantt.
 */
export function selectGanttSourceFromMapped(input: SelectFromMappedInput): GanttBlockSource {
  if (input.mappedV2Count > 0) return 'displayTimelineV2';
  if (input.mappedAllocationCount > 0) return 'workdayAllocation';
  if (input.legacyCount > 0) return 'reportCandidate';
  return 'empty';
}
