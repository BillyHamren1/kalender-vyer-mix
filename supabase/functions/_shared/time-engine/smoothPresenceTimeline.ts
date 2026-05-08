// @ts-nocheck
/**
 * smoothPresenceTimeline
 * ──────────────────────
 * Presentation-only normalisation av närvaro-timeline.
 *
 * Tar de dedup'ade timeline-raderna från get-staff-presence-day och slår ihop
 * GPS-brus runt samma target till sammanhängande presence-block.
 *
 * VIKTIGT:
 *  - Den ändrar ALDRIG raw gpsDayTimeline.
 *  - Den skapar ALDRIG time_reports / workdays / LTE / travel.
 *  - Den ändrar ALDRIG auto-start-regler.
 *  - Den är bara presentationslager för dagvyn / presence-visning.
 */

export type PresenceTimelineType =
  | 'arrival'
  | 'departure'
  | 'signal_lost'
  | 'signal_resumed'
  | 'transport'
  | 'unknown_place'
  | 'gps_gap'
  | 'active_timer_started'
  | 'active_timer_stopped'
  | 'smoothed_presence';

export interface SmoothInputRow {
  at: string;
  endAt?: string | null;
  durationMin?: number | null;
  type: PresenceTimelineType;
  label: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  matchedTargetId?: string | null;
  matchedTargetType?: string | null;
  source: string;
  gpsSegmentId?: string | null;
  registrationId?: string | null;
  // any other props are kept untouched on pass-through rows
  [key: string]: any;
}

export interface SuppressedNoiseSegment {
  id: string | null;
  type: PresenceTimelineType;
  at: string;
  endAt: string | null;
  durationMin: number | null;
  label: string;
  reason:
    | 'short_transport'
    | 'short_unknown'
    | 'same_target_rearrival'
    | 'gps_gap_inside_stay'
    | 'signal_lost_inside_stay'
    | 'signal_resumed_inside_stay'
    | 'departure_inside_stay';
  kind?: 'gps_gap' | 'transport' | 'unknown' | 'signal' | 'departure' | 'rearrival';
  segmentId?: string | null;
  startTs?: string;
  endTs?: string | null;
}

export interface SignalGapMeta {
  segmentId: string | null;
  startTs: string;
  endTs: string | null;
  durationMin: number | null;
}

export interface SmoothedPresenceBlock {
  source: 'smoothed_gps_presence';
  type: 'smoothed_presence';
  at: string;          // start_at (alias för timeline-sort)
  endAt: string;
  startAt: string;
  durationMin: number;
  label: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string;
  mergedSegmentIds: string[];
  suppressedNoiseCount: number;
  suppressedNoiseSegments: SuppressedNoiseSegment[];
  /** GPS-glapp som absorberats inuti samma presence-block. Visas som varning, inte egen rad. */
  signalGapCount: number;
  signalGapMin: number;
  /** Detaljerad metadata om absorberade signalglapp. */
  signalGaps: SignalGapMeta[];
  /** Alla suppressade segment (alias av suppressedNoiseSegments med utökad info). */
  suppressedSegments: SuppressedNoiseSegment[];
}

export interface SmoothPresenceResult {
  /** Smoothed presentation timeline. Pass-through rader + smoothed_presence-block. */
  smoothed: Array<SmoothInputRow | SmoothedPresenceBlock>;
  /** Sammanfattning av varje merged block. */
  blocks: SmoothedPresenceBlock[];
  /** Counters för debug. */
  stats: {
    inputRows: number;
    smoothedRows: number;
    blocksCreated: number;
    suppressedNoise: number;
    mergedArrivals: number;
  };
}

const MERGE_NOISE_MAX_MIN = 5;     // brus mellan samma target som suppress:as

const targetKey = (r: SmoothInputRow): string | null => {
  const t = r.matchedTargetType ?? r.targetType ?? null;
  const id = r.matchedTargetId ?? r.targetId ?? null;
  if (!t || !id) return null;
  return `${t}:${id}`;
};

const isKnownArrival = (r: SmoothInputRow): boolean =>
  r.type === 'arrival' && !!targetKey(r);

const isShortNoise = (r: SmoothInputRow): boolean => {
  const dur = r.durationMin ?? 0;
  return (
    (r.type === 'transport' && dur < MERGE_NOISE_MAX_MIN) ||
    (r.type === 'unknown_place' && dur < MERGE_NOISE_MAX_MIN)
  );
};

/**
 * GPS-glapp / signalstatus = teknisk händelse, inte rörelse. Departure utan
 * efterföljande annan target = också teknisk. Alla absorberas om samma target
 * finns före OCH efter sträckan.
 */
const isBridgeableTechnical = (r: SmoothInputRow): boolean =>
  r.type === 'gps_gap' ||
  r.type === 'signal_lost' ||
  r.type === 'signal_resumed' ||
  r.type === 'departure';

const noiseReason = (r: SmoothInputRow): SuppressedNoiseSegment['reason'] => {
  if (r.type === 'transport') return 'short_transport';
  if (r.type === 'gps_gap') return 'gps_gap_inside_stay';
  if (r.type === 'signal_lost') return 'signal_lost_inside_stay';
  if (r.type === 'signal_resumed') return 'signal_resumed_inside_stay';
  if (r.type === 'departure') return 'departure_inside_stay';
  return 'short_unknown';
};

const noiseKind = (r: SmoothInputRow): NonNullable<SuppressedNoiseSegment['kind']> => {
  if (r.type === 'gps_gap') return 'gps_gap';
  if (r.type === 'transport') return 'transport';
  if (r.type === 'unknown_place') return 'unknown';
  if (r.type === 'signal_lost' || r.type === 'signal_resumed') return 'signal';
  if (r.type === 'departure') return 'departure';
  return 'unknown';
};

const endOf = (r: SmoothInputRow): string => r.endAt ?? r.at;

const minutesBetween = (a: string, b: string): number => {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(diff / 60000));
};

export function smoothPresenceTimeline(
  rows: SmoothInputRow[],
): SmoothPresenceResult {
  const sorted = [...rows].sort((a, b) => a.at.localeCompare(b.at));

  const out: Array<SmoothInputRow | SmoothedPresenceBlock> = [];
  const blocks: SmoothedPresenceBlock[] = [];
  let suppressedNoise = 0;
  let mergedArrivals = 0;

  let i = 0;
  while (i < sorted.length) {
    const row = sorted[i];

    if (!isKnownArrival(row)) {
      out.push(row);
      i += 1;
      continue;
    }

    // Vi har en känd arrival — försök bygga ett sammanhängande block.
    const anchorKey = targetKey(row)!;
    const anchorLabel = row.targetLabel ?? row.label;
    const anchorTargetType = row.matchedTargetType ?? row.targetType ?? null;
    const anchorTargetId = row.matchedTargetId ?? row.targetId ?? null;

    let blockStart = row.at;
    let blockEnd = endOf(row);
    const mergedSegmentIds: string[] = [];
    if (row.gpsSegmentId) mergedSegmentIds.push(row.gpsSegmentId);
    const suppressed: SuppressedNoiseSegment[] = [];
    let arrivalsInBlock = 1;

    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j];

      // Pass-through-rader (timer) bryter inte block men ingår inte i det.
      if (
        next.type === 'active_timer_started' ||
        next.type === 'active_timer_stopped'
      ) {
        break;
      }

      // Annan känd arrival samma target → merge in
      if (isKnownArrival(next) && targetKey(next) === anchorKey) {
        const ne = endOf(next);
        if (ne > blockEnd) blockEnd = ne;
        if (next.gpsSegmentId) mergedSegmentIds.push(next.gpsSegmentId);
        suppressed.push({
          id: next.gpsSegmentId ?? null,
          segmentId: next.gpsSegmentId ?? null,
          type: next.type,
          kind: 'rearrival',
          at: next.at,
          startTs: next.at,
          endAt: next.endAt ?? null,
          endTs: next.endAt ?? null,
          durationMin: next.durationMin ?? null,
          label: next.label,
          reason: 'same_target_rearrival',
        });
        arrivalsInBlock += 1;
        mergedArrivals += 1;
        j += 1;
        continue;
      }

      // Annan känd arrival på annat target → bryt
      if (isKnownArrival(next) && targetKey(next) !== anchorKey) {
        break;
      }

      // Kort transport/unknown ELLER teknisk händelse (gps_gap, signal_lost,
      // signal_resumed, departure) → kolla om följt av samma target. GPS-glapp
      // / signal-events / departure utan annan target = signalstatus, inte rörelse.
      if (isShortNoise(next) || isBridgeableTechnical(next)) {
        // Leta nästa "icke-noise" som är arrival
        let k = j + 1;
        while (k < sorted.length && (isShortNoise(sorted[k]) || isBridgeableTechnical(sorted[k]))) k += 1;
        const after = k < sorted.length ? sorted[k] : null;
        if (after && isKnownArrival(after) && targetKey(after) === anchorKey) {
          // Suppressa hela noise-strecket fram till nästa same-target arrival
          for (let s = j; s < k; s += 1) {
            const nz = sorted[s];
            if (nz.gpsSegmentId) mergedSegmentIds.push(nz.gpsSegmentId);
            suppressed.push({
              id: nz.gpsSegmentId ?? null,
              segmentId: nz.gpsSegmentId ?? null,
              type: nz.type,
              kind: noiseKind(nz),
              at: nz.at,
              startTs: nz.at,
              endAt: nz.endAt ?? null,
              endTs: nz.endAt ?? null,
              durationMin: nz.durationMin ?? null,
              label: nz.label,
              reason: noiseReason(nz),
            });
            suppressedNoise += 1;
          }
          // Fortsätt loop med arrival efter noise
          j = k;
          continue;
        }
        // Inget same-target follow-up → block slutar här
        break;
      }

      // Lång transport/unknown eller annan typ → bryt
      break;
    }

    const durationMin = minutesBetween(blockStart, blockEnd);
    const gapSegments = suppressed.filter((s) => s.reason === 'gps_gap_inside_stay');
    const signalGapMin = gapSegments.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
    const signalGaps: SignalGapMeta[] = gapSegments.map((s) => ({
      segmentId: s.segmentId ?? s.id ?? null,
      startTs: s.startTs ?? s.at,
      endTs: s.endTs ?? s.endAt ?? null,
      durationMin: s.durationMin ?? null,
    }));
    const block: SmoothedPresenceBlock = {
      source: 'smoothed_gps_presence',
      type: 'smoothed_presence',
      at: blockStart,
      startAt: blockStart,
      endAt: blockEnd,
      durationMin,
      label: anchorLabel,
      targetType: anchorTargetType,
      targetId: anchorTargetId,
      targetLabel: anchorLabel,
      mergedSegmentIds,
      suppressedNoiseCount: suppressed.length,
      suppressedNoiseSegments: suppressed,
      signalGapCount: gapSegments.length,
      signalGapMin,
      signalGaps,
      suppressedSegments: suppressed,
    };
    blocks.push(block);
    out.push(block);
    if (arrivalsInBlock > 1) {
      // dragit in andra arrivals i blocket
    }
    i = j;
  }

  out.sort((a, b) => a.at.localeCompare(b.at));

  return {
    smoothed: out,
    blocks,
    stats: {
      inputRows: sorted.length,
      smoothedRows: out.length,
      blocksCreated: blocks.length,
      suppressedNoise,
      mergedArrivals,
    },
  };
}
