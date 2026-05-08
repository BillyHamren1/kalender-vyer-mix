/**
 * Time Engine — buildTimeRegistrationSegments (frontend mirror)
 * =============================================================
 *
 * Pure builder. Mirrors `supabase/functions/_shared/time-engine/buildTimeRegistrationSegments.ts`.
 * See that file's docblock for canonical rules.
 *
 * The frontend does not own the GPS timeline builder, so this module accepts
 * a structurally compatible segment shape (`GpsTimelineSegmentLike`) instead
 * of importing the Deno-only builder type.
 */

import type {
  ActiveTimeRegistration,
  ISODateTime,
  TimeRegistrationSegment,
  TimeRegistrationSegmentKind,
  WorkTarget,
  WorkTargetKind,
} from './contracts';

export interface GpsTimelineSegmentLike {
  id: string;
  startTs: ISODateTime;
  endTs: ISODateTime;
  kind: 'stay' | 'travel' | 'gps_gap';
  type: 'known_site' | 'unknown_place' | 'transport' | 'gps_gap';
  label: string;
  matchedTargetId: string | null;
  matchedTargetType: WorkTargetKind | null;
  matchedTargetName: string | null;
  confidence: number;
}

export interface BuildTimeRegistrationSegmentsInput {
  activeRegistration: ActiveTimeRegistration | null;
  gpsTimeline: { segments: GpsTimelineSegmentLike[] };
  targetsByRefId?: ReadonlyMap<string, WorkTarget> | Record<string, WorkTarget>;
  now?: Date;
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

function mapGpsSegmentKind(seg: GpsTimelineSegmentLike): {
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
  seg: GpsTimelineSegmentLike,
  targetsByRefId: BuildTimeRegistrationSegmentsInput['targetsByRefId'],
): { targetKind: WorkTargetKind | null; targetRefId: string | null; targetKey: string | null } {
  if (!seg.matchedTargetId) return { targetKind: null, targetRefId: null, targetKey: null };
  let target: WorkTarget | undefined;
  if (targetsByRefId instanceof Map) target = targetsByRefId.get(seg.matchedTargetId);
  else if (targetsByRefId) target = (targetsByRefId as Record<string, WorkTarget>)[seg.matchedTargetId];
  return {
    targetKind: seg.matchedTargetType ?? target?.kind ?? null,
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

  type Clipped = TimeRegistrationSegment & { startedAt: ISODateTime; endedAt: ISODateTime };
  const clipped: Clipped[] = [];

  for (const seg of input.gpsTimeline.segments) {
    const interval = clipInterval(seg.startTs, seg.endTs, windowStart, windowEnd);
    if (!interval) continue;
    const { kind, label } = mapGpsSegmentKind(seg);
    const t = resolveTarget(seg, input.targetsByRefId);
    clipped.push({
      registrationId: reg.id,
      startedAt: interval.start,
      endedAt: interval.end,
      kind,
      label,
      targetKind: kind === 'work_target' ? t.targetKind : null,
      targetRefId: kind === 'work_target' ? t.targetRefId : null,
      targetKey: kind === 'work_target' ? t.targetKey : null,
      confidence: typeof seg.confidence === 'number' ? seg.confidence : 0,
      sourceGpsSegmentId: seg.id,
    });
  }

  clipped.sort((a, b) => MS(a.startedAt) - MS(b.startedAt!));

  const merged: Clipped[] = [];
  for (const seg of clipped) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.kind === seg.kind &&
      (last.targetKey ?? null) === (seg.targetKey ?? null) &&
      MS(last.endedAt) >= MS(seg.startedAt) - 1
    ) {
      if (MS(seg.endedAt) > MS(last.endedAt)) last.endedAt = seg.endedAt;
      if (seg.confidence > last.confidence) last.confidence = seg.confidence;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}
