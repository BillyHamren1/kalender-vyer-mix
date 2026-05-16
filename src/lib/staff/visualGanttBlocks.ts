/**
 * Visual Gantt Block builder (UI-only).
 *
 * Tar de tekniska engine-blocken (efter mergeContiguousBlocks) och bygger
 * en renare visuell tidslinje per person. Korta transport/granska/okänd/
 * pre_work-block som ligger nära ett huvudjobb absorberas som metadata
 * (chips / attachedEvents) i stället för att ritas som egna stora kort.
 *
 * INGEN backend-, time-engine-, GPS-, time_report- eller payroll-logik
 * berörs här — detta är ren UI-derive. Källblocken behålls oförändrade
 * i `attachedEvents` så drawer/tooltip fortfarande kan visa allt.
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

export interface GanttBlockLite {
  id: string;
  kind: GanttKindLite;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  title?: string;
  subtitle?: string | null;
  sessionKey?: string;
  isNightGpsOnly?: boolean;
  /** Engine-resolved targetId (om finns) — används för "samma plats"-absorption. */
  targetKey?: string | null;
}

export interface AttachedSummary {
  /** Stabil id från källblocket. */
  id: string;
  kind: GanttKindLite;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  /** "before" | "during" | "after" relativt host. */
  position: 'before' | 'during' | 'after';
  /** Mänsklig chip-label, t.ex. "Transport före 24 min". */
  chipLabel: string;
}

export interface VisualGanttBlock<TBlock extends GanttBlockLite = GanttBlockLite> {
  id: string;
  kind: GanttKindLite;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  /** Huvudblocket från källan (referens, inte muterat). */
  source: TBlock;
  /** Absorberade småblock (transport/review/unknown/pre_work). */
  attachedEvents: AttachedSummary[];
  /** Förkonstruerade chip-labels för rendering. */
  chips: string[];
  /** Hur många källblock detta visuella block representerar. */
  sourceBlockIds: string[];
}

export interface VisualGanttDiagnostics {
  staffName?: string;
  rawBlockCount: number;
  visualBlockCount: number;
  absorbedTransportCount: number;
  absorbedReviewCount: number;
  absorbedUnknownCount: number;
  absorbedPreWorkCount: number;
  hiddenPreWorkCount: number;
  standaloneSecondaryCount: number;
  lanePackedMainBlocksCount: number;
  examples: Array<{
    hostId: string | null;
    hostKind: GanttKindLite | null;
    absorbed: Array<{ id: string; kind: GanttKindLite; durationMinutes: number; position: string }>;
    reason: string;
  }>;
}

export interface BuildVisualGanttOptions {
  /** Block under detta gränsvärde (min) räknas som "kort" och kan absorberas. Default 30. */
  shortMinutes?: number;
  /** Transport >= detta (min) får alltid stå som eget block. Default 45. */
  longTransportMinutes?: number;
  /** Review/unknown >= detta (min) får alltid stå som eget block. Default 60. */
  longReviewMinutes?: number;
  /** Max gap (min) mellan host och kandidat för att räknas som "intill". Default 10. */
  adjacencyMinutes?: number;
  /** Skicka in staff-namn till diagnostiken. */
  staffName?: string;
}

const MAIN_KINDS: ReadonlySet<GanttKindLite> = new Set(['work', 'warehouse', 'rig', 'rigdown']);
const ABSORBABLE_KINDS: ReadonlySet<GanttKindLite> = new Set([
  'transport',
  'review',
  'unknown',
  'pre_work',
  'break',
]);

const KIND_LABEL: Record<GanttKindLite, string> = {
  work: 'Arbete',
  warehouse: 'Lager',
  rig: 'Rigg',
  rigdown: 'Rigga ner',
  transport: 'Transport',
  review: 'Granska',
  unknown: 'Okänd',
  break: 'Rast',
  pre_work: 'Före',
};

const minutesBetween = (aIso: string, bIso: string): number =>
  Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 60000;

const isOverlap = (a: GanttBlockLite, b: GanttBlockLite): boolean => {
  const aS = Date.parse(a.startAt);
  const aE = Date.parse(a.endAt);
  const bS = Date.parse(b.startAt);
  const bE = Date.parse(b.endAt);
  return aS < bE && bS < aE;
};

const formatMinutes = (m: number): string => {
  const mins = Math.round(m);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const r = mins - h * 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
};

const chipForAttachment = (
  kind: GanttKindLite,
  position: 'before' | 'during' | 'after',
  durationMinutes: number,
): string => {
  const label = KIND_LABEL[kind];
  const dur = formatMinutes(durationMinutes);
  if (kind === 'pre_work') return `Före arbetsdag ${dur}`;
  if (position === 'during') return `${label} under ${dur}`;
  if (position === 'before') return `${label} före ${dur}`;
  return `${label} efter ${dur}`;
};

/**
 * Bygg visuell tidslinje från tekniska gantt-block. Pure function — ingen DOM.
 */
export function buildVisualGanttBlocks<TBlock extends GanttBlockLite>(
  blocks: readonly TBlock[],
  options: BuildVisualGanttOptions = {},
): { blocks: VisualGanttBlock<TBlock>[]; diagnostics: VisualGanttDiagnostics } {
  const shortMin = options.shortMinutes ?? 30;
  const longTransport = options.longTransportMinutes ?? 45;
  const longReview = options.longReviewMinutes ?? 60;
  const adjacency = options.adjacencyMinutes ?? 10;

  const diagnostics: VisualGanttDiagnostics = {
    staffName: options.staffName,
    rawBlockCount: blocks.length,
    visualBlockCount: 0,
    absorbedTransportCount: 0,
    absorbedReviewCount: 0,
    absorbedUnknownCount: 0,
    absorbedPreWorkCount: 0,
    hiddenPreWorkCount: 0,
    standaloneSecondaryCount: 0,
    lanePackedMainBlocksCount: 0,
    examples: [],
  };

  if (blocks.length === 0) {
    return { blocks: [], diagnostics };
  }

  // Sortera kronologiskt
  const sorted = [...blocks].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );

  // Identifiera huvudblock
  const mains = sorted.filter((b) => MAIN_KINDS.has(b.kind) && !b.isNightGpsOnly);
  const nonMains = sorted.filter((b) => !MAIN_KINDS.has(b.kind));

  // Skapa visuella host-objekt
  const visuals = new Map<string, VisualGanttBlock<TBlock>>();
  for (const m of mains) {
    visuals.set(m.id, {
      id: m.id,
      kind: m.kind,
      startAt: m.startAt,
      endAt: m.endAt,
      durationMinutes: m.durationMinutes,
      source: m,
      attachedEvents: [],
      chips: [],
      sourceBlockIds: [m.id],
    });
  }

  const standalones: VisualGanttBlock<TBlock>[] = [];

  const findHost = (b: TBlock): TBlock | null => {
    // 1) any overlap
    const overlap = mains.find((m) => isOverlap(m, b));
    if (overlap) return overlap;
    // 2) adjacency: m.end within `adjacency` min before b.start  (transport före jobb)
    //    or m.start within `adjacency` min after b.end           (transport efter jobb)
    let best: { main: TBlock; gap: number } | null = null;
    for (const m of mains) {
      const gapBefore =
        Date.parse(b.startAt) >= Date.parse(m.endAt)
          ? minutesBetween(m.endAt, b.startAt)
          : Infinity;
      const gapAfter =
        Date.parse(b.endAt) <= Date.parse(m.startAt)
          ? minutesBetween(b.endAt, m.startAt)
          : Infinity;
      const gap = Math.min(gapBefore, gapAfter);
      if (gap <= adjacency && (!best || gap < best.gap)) best = { main: m, gap };
    }
    if (best) return best.main;
    // 3) sandwiched between two mains with same sessionKey
    return null;
  };

  const positionFor = (host: TBlock, b: TBlock): 'before' | 'during' | 'after' => {
    if (isOverlap(host, b)) return 'during';
    if (Date.parse(b.endAt) <= Date.parse(host.startAt)) return 'before';
    return 'after';
  };

  for (const b of nonMains) {
    // pre_work hidden helt från huvudtidslinjen — endast diagnostics
    if (b.kind === 'pre_work') {
      const host = findHost(b);
      if (host) {
        const v = visuals.get(host.id)!;
        const pos = positionFor(host, b);
        v.attachedEvents.push({
          id: b.id,
          kind: b.kind,
          startAt: b.startAt,
          endAt: b.endAt,
          durationMinutes: b.durationMinutes,
          position: pos,
          chipLabel: chipForAttachment(b.kind, pos, b.durationMinutes),
        });
        diagnostics.absorbedPreWorkCount += 1;
      } else {
        diagnostics.hiddenPreWorkCount += 1;
      }
      continue;
    }

    if (!ABSORBABLE_KINDS.has(b.kind)) {
      // Något oväntat — keep standalone
      standalones.push({
        id: b.id,
        kind: b.kind,
        startAt: b.startAt,
        endAt: b.endAt,
        durationMinutes: b.durationMinutes,
        source: b,
        attachedEvents: [],
        chips: [],
        sourceBlockIds: [b.id],
      });
      diagnostics.standaloneSecondaryCount += 1;
      continue;
    }

    // Långa block får alltid stå själva
    const tooLong =
      (b.kind === 'transport' && b.durationMinutes >= longTransport) ||
      ((b.kind === 'review' || b.kind === 'unknown') && b.durationMinutes >= longReview);

    if (tooLong) {
      standalones.push({
        id: b.id,
        kind: b.kind,
        startAt: b.startAt,
        endAt: b.endAt,
        durationMinutes: b.durationMinutes,
        source: b,
        attachedEvents: [],
        chips: [],
        sourceBlockIds: [b.id],
      });
      diagnostics.standaloneSecondaryCount += 1;
      continue;
    }

    const host = findHost(b);
    if (!host) {
      // Kort, ingen host → fortfarande standalone men dämpas i renderingen
      standalones.push({
        id: b.id,
        kind: b.kind,
        startAt: b.startAt,
        endAt: b.endAt,
        durationMinutes: b.durationMinutes,
        source: b,
        attachedEvents: [],
        chips: [],
        sourceBlockIds: [b.id],
      });
      diagnostics.standaloneSecondaryCount += 1;
      continue;
    }

    const v = visuals.get(host.id)!;
    const pos = positionFor(host, b);
    const chipLabel = chipForAttachment(b.kind, pos, b.durationMinutes);
    v.attachedEvents.push({
      id: b.id,
      kind: b.kind,
      startAt: b.startAt,
      endAt: b.endAt,
      durationMinutes: b.durationMinutes,
      position: pos,
      chipLabel,
    });
    v.sourceBlockIds.push(b.id);

    if (b.kind === 'transport') diagnostics.absorbedTransportCount += 1;
    else if (b.kind === 'review') diagnostics.absorbedReviewCount += 1;
    else if (b.kind === 'unknown') diagnostics.absorbedUnknownCount += 1;
  }

  // Slutproducera chips per host
  for (const v of visuals.values()) {
    v.chips = v.attachedEvents.map((a) => a.chipLabel);
  }

  // Combine hosts + standalones, sorted by startAt
  const out: VisualGanttBlock<TBlock>[] = [...visuals.values(), ...standalones].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );

  // Diagnostik: räkna lane-packed mains (>=2 mains som faktiskt överlappar)
  let lanePacked = 0;
  for (let i = 0; i < mains.length; i++) {
    for (let j = i + 1; j < mains.length; j++) {
      if (isOverlap(mains[i], mains[j])) {
        lanePacked += 1;
        break;
      }
    }
  }
  diagnostics.lanePackedMainBlocksCount = lanePacked;
  diagnostics.visualBlockCount = out.length;

  // Plocka upp till 3 exempel
  for (const v of visuals.values()) {
    if (diagnostics.examples.length >= 3) break;
    if (v.attachedEvents.length === 0) continue;
    diagnostics.examples.push({
      hostId: v.id,
      hostKind: v.kind,
      absorbed: v.attachedEvents.map((a) => ({
        id: a.id,
        kind: a.kind,
        durationMinutes: a.durationMinutes,
        position: a.position,
      })),
      reason: 'short_or_adjacent_to_main',
    });
  }

  return { blocks: out, diagnostics };
}
