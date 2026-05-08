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

export type GapTreatment =
  | 'merged_as_same_area'
  | 'shown_as_signal_gap_between_places'
  | 'signal_gap_without_confirmed_departure';

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
  /** Avstånd (meter) mellan blockets centrum och nästa stabila plats efter sista glappet. */
  transitionDistanceMeters?: number | null;
  /** Tröskelvärde för "samma område" (meter). */
  sameAreaThresholdMeters?: number;
  /** Hur det sista glappet i blocket behandlades. */
  gapTreatment?: GapTreatment;
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
export const SAME_AREA_THRESHOLD_M = 5000; // < 5km efter glapp = samma område

const num = (v: any): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const centerOf = (r: SmoothInputRow): { lat: number; lng: number } | null => {
  const lat = num((r as any).centerLat) ?? num((r as any).lat);
  const lng = num((r as any).centerLng) ?? num((r as any).lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
};

const haversineMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
};

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
    const anchorCenter = centerOf(row);

    let blockStart = row.at;
    let blockEnd = endOf(row);
    const mergedSegmentIds: string[] = [];
    if (row.gpsSegmentId) mergedSegmentIds.push(row.gpsSegmentId);
    const suppressed: SuppressedNoiseSegment[] = [];
    let arrivalsInBlock = 1;

    // Distansmetadata om sista bridgade glappet
    let transitionDistanceMeters: number | null = null;
    let gapTreatment: GapTreatment | undefined;

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

      // Annan känd arrival på annat target → kolla avstånd; <5km = samma område
      if (isKnownArrival(next) && targetKey(next) !== anchorKey) {
        const otherCenter = centerOf(next);
        const dist =
          anchorCenter && otherCenter
            ? haversineMeters(anchorCenter, otherCenter)
            : null;
        if (dist != null && dist < SAME_AREA_THRESHOLD_M) {
          // Merge cross-target inom samma område. Behåll ankarets identitet.
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
          transitionDistanceMeters = dist;
          gapTreatment = 'merged_as_same_area';
          j += 1;
          continue;
        }
        // ≥ 5km → verkligt platsbyte, bryt
        if (dist != null) transitionDistanceMeters = dist;
        gapTreatment = 'shown_as_signal_gap_between_places';
        break;
      }

      // Kort transport/unknown ELLER teknisk händelse (gps_gap, signal_lost,
      // signal_resumed, departure) → kolla om följt av samma target eller plats
      // i samma område (< 5km). GPS-glapp / signal-events / departure utan
      // bevisat platsbyte = signalstatus, inte rörelse.
      if (isShortNoise(next) || isBridgeableTechnical(next)) {
        const sequenceHasGap = isBridgeableTechnical(next) || (() => {
          for (let s = j; s < sorted.length; s += 1) {
            const r = sorted[s];
            if (!(isShortNoise(r) || isBridgeableTechnical(r))) break;
            if (r.type === 'gps_gap') return true;
          }
          return false;
        })();

        // Leta nästa "icke-noise"
        let k = j + 1;
        while (k < sorted.length && (isShortNoise(sorted[k]) || isBridgeableTechnical(sorted[k]))) k += 1;
        const after = k < sorted.length ? sorted[k] : null;

        let absorb = false;
        if (after && isKnownArrival(after)) {
          if (targetKey(after) === anchorKey) {
            absorb = true;
            if (sequenceHasGap) {
              transitionDistanceMeters = 0;
              gapTreatment = 'merged_as_same_area';
            }
          } else {
            const otherCenter = centerOf(after);
            const dist =
              anchorCenter && otherCenter
                ? haversineMeters(anchorCenter, otherCenter)
                : null;
            if (dist != null && dist < SAME_AREA_THRESHOLD_M) {
              absorb = true;
              transitionDistanceMeters = dist;
              gapTreatment = 'merged_as_same_area';
            } else {
              if (dist != null) transitionDistanceMeters = dist;
              if (sequenceHasGap) gapTreatment = 'shown_as_signal_gap_between_places';
              absorb = false;
            }
          }
        } else {
          // Inget arrival efter — gps-glapp utan bekräftad departure
          if (sequenceHasGap) gapTreatment = 'signal_gap_without_confirmed_departure';
          absorb = false;
        }

        if (absorb) {
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
          j = k;
          continue;
        }
        // Bryt — låt bridging-rader stanna kvar i timeline som egna händelser
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
      transitionDistanceMeters,
      sameAreaThresholdMeters: SAME_AREA_THRESHOLD_M,
      gapTreatment,
    };
    blocks.push(block);
    out.push(block);
    if (arrivalsInBlock > 1) {
      // dragit in andra arrivals i blocket
    }
    i = j;
  }

  // Post-pass: merge consecutive transport blocks when no stable stop sits between them.
  const merged = mergeConsecutiveTransports(out);
  merged.sort((a, b) => a.at.localeCompare(b.at));

  return {
    smoothed: merged,
    blocks,
    stats: {
      inputRows: sorted.length,
      smoothedRows: merged.length,
      blocksCreated: blocks.length,
      suppressedNoise,
      mergedArrivals,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport-merge post-pass
// ─────────────────────────────────────────────────────────────────────────────

const STABLE_STOP_MIN_MIN = 3; // unknown_place < 3 min räknas inte som stabilt stopp

const isStableStop = (r: any): boolean => {
  if (!r) return false;
  if (r.type === 'smoothed_presence') return true;
  if (r.type === 'arrival') return true;
  if (r.type === 'unknown_place' && (r.durationMin ?? 0) >= STABLE_STOP_MIN_MIN) return true;
  return false;
};

const isTransportMergeable = (r: any): boolean => {
  if (!r) return false;
  if (r.type === 'transport') return true;
  if (r.type === 'gps_gap') return true;
  if (r.type === 'signal_lost' || r.type === 'signal_resumed') return true;
  if (r.type === 'departure') return true;
  if (r.type === 'unknown_place' && (r.durationMin ?? 0) < STABLE_STOP_MIN_MIN) return true;
  return false;
};

function mergeConsecutiveTransports(
  rows: Array<SmoothInputRow | SmoothedPresenceBlock>,
): Array<SmoothInputRow | SmoothedPresenceBlock> {
  const sorted = [...rows].sort((a, b) => a.at.localeCompare(b.at));
  const out: Array<SmoothInputRow | SmoothedPresenceBlock> = [];

  let i = 0;
  while (i < sorted.length) {
    const row: any = sorted[i];
    if (row.type !== 'transport') {
      out.push(row);
      i += 1;
      continue;
    }

    // Walk forward across bridgeable rows; stop on stable stop or timer events.
    let j = i + 1;
    let lastTransportIdx = i;
    while (j < sorted.length) {
      const next: any = sorted[j];
      if (next.type === 'active_timer_started' || next.type === 'active_timer_stopped') break;
      if (isStableStop(next)) break;
      if (!isTransportMergeable(next)) break;
      if (next.type === 'transport') lastTransportIdx = j;
      j += 1;
    }

    const endIdx = lastTransportIdx;
    const members = sorted.slice(i, endIdx + 1);
    const transportMembers = members.filter((m: any) => m.type === 'transport');

    if (transportMembers.length <= 1) {
      out.push(row);
      i += 1;
      continue;
    }

    const first: any = transportMembers[0];
    const last: any = transportMembers[transportMembers.length - 1];
    const blockStart = first.at;
    const blockEnd = last.endAt ?? last.at;
    const durationMin = minutesBetween(blockStart, blockEnd);

    const mergedTransportSegmentIds: string[] = transportMembers
      .map((m: any) => m.gpsSegmentId)
      .filter((x: any): x is string => !!x);

    const absorbed = members.filter((m: any) => m.type !== 'transport');
    const suppressedNoiseSegments: SuppressedNoiseSegment[] = absorbed.map((m: any) => ({
      id: m.gpsSegmentId ?? null,
      segmentId: m.gpsSegmentId ?? null,
      type: m.type,
      kind: noiseKind(m),
      at: m.at,
      startTs: m.at,
      endAt: m.endAt ?? null,
      endTs: m.endAt ?? null,
      durationMin: m.durationMin ?? null,
      label: m.label,
      reason: noiseReason(m),
    }));

    const signalGapsDuringTransport: SignalGapMeta[] = absorbed
      .filter((m: any) => m.type === 'gps_gap')
      .map((m: any) => ({
        segmentId: m.gpsSegmentId ?? null,
        startTs: m.at,
        endTs: m.endAt ?? null,
        durationMin: m.durationMin ?? null,
      }));
    const signalGapMin = signalGapsDuringTransport.reduce((s, g) => s + (g.durationMin ?? 0), 0);

    const mergedRow: any = {
      ...first,
      type: 'transport',
      at: blockStart,
      endAt: blockEnd,
      durationMin,
      label: 'Transport',
      source: 'smoothed_transport_merge',
      mergedTransportSegmentIds,
      suppressedNoiseSegments,
      signalGapsDuringTransport,
      signalGapCount: signalGapsDuringTransport.length,
      signalGapMin,
    };

    out.push(mergedRow);

    // Re-emit any trailing tech rows between last transport and the stop, so the
    // raw view doesn't lose the breadcrumbs entirely (clean view filters them).
    for (let k = endIdx + 1; k < j; k += 1) {
      out.push(sorted[k]);
    }
    i = j;
  }

  return out;
}
