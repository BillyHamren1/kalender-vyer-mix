/**
 * Time Engine — buildTimeRegistrationSegments
 * ============================================
 *
 * Pure builder. Splits an active time registration into a sequence of
 * segments based on the GPS day timeline, restricted to the registration's
 * active window.
 *
 * STRICT RULES (no exceptions):
 *   - Pure function. No DB calls. No imports from legacy domain models.
 *   - Returns [] when no active registration is supplied.
 *   - Segments are clipped to [registration.startedAt, registration.endedAt ?? now].
 *   - Transport NEVER auto-starts a timer (that's the AutoStartPolicy's job).
 *     But when a timer is already active, transport becomes a valid segment.
 *   - Same for unknown_place.
 *   - GPS gaps DO NOT subtract work time. They are signal-status segments;
 *     the timer keeps ticking. We surface them as `gps_gap` segments only.
 *   - Adjacent segments with the same (kind, targetKey) are merged.
 *
 * Output kind mapping:
 *   inside_known_target  → work_target
 *   transport / movement → transport
 *   unknown_place        → unknown_place
 *   gps_gap / uncertain  → gps_gap
 */

import type {
  ActiveTimeRegistration,
  ISODateTime,
  TimeRegistrationSegment,
  TimeRegistrationSegmentKind,
  WorkTarget,
  WorkTargetKind,
} from './contracts.ts';
import type {
  GpsDayTimelineResult,
  GpsTimelineSegment,
} from './buildGpsDayTimeline.ts';

export interface BuildTimeRegistrationSegmentsInput {
  activeRegistration: ActiveTimeRegistration | null;
  gpsTimeline: Pick<GpsDayTimelineResult, 'segments'>;
  /** Optional lookup of WorkTarget by id; used to enrich work_target segments. */
  targetsByRefId?: ReadonlyMap<string, WorkTarget> | Record<string, WorkTarget>;
  /** "Now" for clipping open-ended registrations (defaults to Date.now). */
  now?: Date;
}

interface ClippedSegment {
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  kind: TimeRegistrationSegmentKind;
  label: string;
  targetKind: WorkTargetKind | null;
  targetRefId: string | null;
  targetKey: string | null;
  confidence: number;
  sourceGpsSegmentId: string;
}

const MS = (iso: ISODateTime) => Date.parse(iso);

function clipInterval(
  segStart: ISODateTime,
  segEnd: ISODateTime,
  windowStart: number,
  windowEnd: number,
): { start: ISODateTime; end: ISODateTime } | null {
  const s = Math.max(MS(segStart), windowStart);
  const e = Math.min(MS(segEnd), windowEnd);
  if (e <= s) return null;
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
}

function mapGpsSegmentKind(seg: GpsTimelineSegment): {
  kind: TimeRegistrationSegmentKind;
  label: string;
} {
  if (seg.kind === 'gps_gap' || seg.type === 'gps_gap') {
    return { kind: 'gps_gap', label: 'GPS-glapp' };
  }
  if (seg.kind === 'travel' || seg.type === 'transport') {
    return { kind: 'transport', label: 'Transport' };
  }
  if (seg.type === 'known_site') {
    return { kind: 'work_target', label: seg.label || seg.matchedTargetName || 'Arbetsplats' };
  }
  return { kind: 'unknown_place', label: 'Okänd plats' };
}

function resolveTarget(
  seg: GpsTimelineSegment,
  targetsByRefId: BuildTimeRegistrationSegmentsInput['targetsByRefId'],
): { targetKind: WorkTargetKind | null; targetRefId: string | null; targetKey: string | null } {
  if (!seg.matchedTargetId) {
    return { targetKind: null, targetRefId: null, targetKey: null };
  }
  let target: WorkTarget | undefined;
  if (targetsByRefId instanceof Map) {
    target = targetsByRefId.get(seg.matchedTargetId);
  } else if (targetsByRefId && typeof targetsByRefId === 'object') {
    target = (targetsByRefId as Record<string, WorkTarget>)[seg.matchedTargetId];
  }
  return {
    targetKind: (seg.matchedTargetType as WorkTargetKind | null) ?? target?.kind ?? null,
    targetRefId: seg.matchedTargetId,
    targetKey: target?.key ?? `${seg.matchedTargetType ?? 'work_target'}:${seg.matchedTargetId}`,
  };
}

export function buildTimeRegistrationSegments(
  input: BuildTimeRegistrationSegmentsInput,
): TimeRegistrationSegment[] {
  const reg = input.activeRegistration;
  if (!reg) return [];

  const windowStart = MS(reg.startedAt);
  const windowEnd = reg.endedAt ? MS(reg.endedAt) : (input.now ?? new Date()).getTime();
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
    return [];
  }

  // 1) Clip + map each GPS segment.
  const clipped: ClippedSegment[] = [];
  for (const seg of input.gpsTimeline.segments) {
    const interval = clipInterval(seg.startTs, seg.endTs, windowStart, windowEnd);
    if (!interval) continue;
    const { kind, label } = mapGpsSegmentKind(seg);
    const t = resolveTarget(seg, input.targetsByRefId);
    clipped.push({
      startedAt: interval.start,
      endedAt: interval.end,
      kind,
      label: kind === 'work_target' ? (t.targetKey ? label : label) : label,
      targetKind: kind === 'work_target' ? t.targetKind : null,
      targetRefId: kind === 'work_target' ? t.targetRefId : null,
      targetKey: kind === 'work_target' ? t.targetKey : null,
      confidence: typeof seg.confidence === 'number' ? seg.confidence : 0,
      sourceGpsSegmentId: seg.id,
    });
  }

  // 2) Sort by start. Builder must not assume input order.
  clipped.sort((a, b) => MS(a.startedAt) - MS(b.startedAt));

  // 3) Merge adjacent segments of the same (kind, targetKey).
  const merged: ClippedSegment[] = [];
  for (const seg of clipped) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.kind === seg.kind &&
      (last.targetKey ?? null) === (seg.targetKey ?? null) &&
      MS(last.endedAt) >= MS(seg.startedAt) - 1
    ) {
      // extend
      if (MS(seg.endedAt) > MS(last.endedAt)) last.endedAt = seg.endedAt;
      // keep best confidence
      if (seg.confidence > last.confidence) last.confidence = seg.confidence;
    } else {
      merged.push({ ...seg });
    }
  }

  // 4) Project to public TimeRegistrationSegment shape.
  return merged.map<TimeRegistrationSegment>((s) => ({
    registrationId: reg.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    kind: s.kind,
    label: s.label,
    targetKind: s.targetKind,
    targetRefId: s.targetRefId,
    targetKey: s.targetKey,
    confidence: s.confidence,
    sourceGpsSegmentId: s.sourceGpsSegmentId,
  }));
}
