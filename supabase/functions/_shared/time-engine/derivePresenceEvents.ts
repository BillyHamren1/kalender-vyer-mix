/**
 * derivePresenceEvents — pure helper.
 *
 * Walks an ordered list of GpsTimelineSegment and emits presence events:
 *   - arrival         : transition INTO a known_site from a different (or no) known_site
 *                       (gps_gap is "looked through" — does not count as outside).
 *   - departure       : transition OUT of a known_site into a different known_site or
 *                       a confirmed signal segment (transport / unknown_place).
 *                       gps_gap alone NEVER triggers departure.
 *   - signal_lost     : a gps_gap segment begins (we just lost reliable signal).
 *   - signal_resumed  : a gps_gap segment ends and a new signal segment follows.
 *
 * Read-only — never produces time_report / location_time_entry / travel.
 */

import type { GpsTimelineSegment } from './buildGpsDayTimeline.ts';

export type PresenceEventType =
  | 'arrival'
  | 'departure'
  | 'signal_lost'
  | 'signal_resumed';

export interface DerivedPresenceEvent {
  eventType: PresenceEventType;
  /** When the event happened (ISO). */
  eventAt: string;
  targetType: string;        // 'project' | 'large_project' | 'organization_location' | 'booking' | 'unknown' | 'none'
  targetId: string | null;
  targetLabel: string | null;
  confidence: number | null;
  gpsSegmentId: string;
  metadata: Record<string, unknown>;
}

export interface DerivePresenceEventsInput {
  segments: GpsTimelineSegment[];
}

function isKnown(seg: GpsTimelineSegment | undefined | null): boolean {
  return !!seg && seg.type === 'known_site' && !!seg.matchedTargetId;
}

function isGap(seg: GpsTimelineSegment | undefined | null): boolean {
  return !!seg && seg.type === 'gps_gap';
}

function targetKey(seg: GpsTimelineSegment): string {
  return `${seg.matchedTargetType ?? 'unknown'}::${seg.matchedTargetId ?? ''}`;
}

/** Walk back/forward skipping gps_gap segments. */
function prevSignal(segs: GpsTimelineSegment[], i: number): GpsTimelineSegment | null {
  for (let j = i - 1; j >= 0; j--) if (!isGap(segs[j])) return segs[j];
  return null;
}
function nextSignal(segs: GpsTimelineSegment[], i: number): GpsTimelineSegment | null {
  for (let j = i + 1; j < segs.length; j++) if (!isGap(segs[j])) return segs[j];
  return null;
}

export function derivePresenceEvents(
  input: DerivePresenceEventsInput,
): DerivedPresenceEvent[] {
  const segs = [...(input.segments ?? [])].sort(
    (a, b) => Date.parse(a.startTs) - Date.parse(b.startTs),
  );

  const out: DerivedPresenceEvent[] = [];

  for (let i = 0; i < segs.length; i++) {
    const cur = segs[i];

    // --- gps_gap → signal_lost / signal_resumed --------------------------
    if (isGap(cur)) {
      const before = prevSignal(segs, i);
      out.push({
        eventType: 'signal_lost',
        eventAt: cur.startTs,
        targetType: before && isKnown(before)
          ? (before.matchedTargetType ?? 'unknown')
          : 'none',
        targetId: before && isKnown(before) ? (before.matchedTargetId ?? null) : null,
        targetLabel: before && isKnown(before)
          ? (before.matchedTargetName ?? before.label ?? null)
          : null,
        confidence: null,
        gpsSegmentId: cur.id,
        metadata: {
          gap_minutes: cur.durationMin,
          previous_segment_type: before?.type ?? null,
          previous_segment_id: before?.id ?? null,
        },
      });

      const after = nextSignal(segs, i);
      if (after) {
        out.push({
          eventType: 'signal_resumed',
          eventAt: cur.endTs,
          targetType: isKnown(after)
            ? (after.matchedTargetType ?? 'unknown')
            : (after.type === 'transport' ? 'transport' : 'unknown'),
          targetId: isKnown(after) ? (after.matchedTargetId ?? null) : null,
          targetLabel: isKnown(after)
            ? (after.matchedTargetName ?? after.label ?? null)
            : (after.label ?? null),
          confidence: after.confidence ?? null,
          gpsSegmentId: cur.id,
          metadata: {
            gap_minutes: cur.durationMin,
            next_segment_type: after.type,
            next_segment_id: after.id,
          },
        });
      }
      continue;
    }

    if (!isKnown(cur)) continue;

    // --- arrival / departure on known_site (look past gaps) --------------
    const prev = prevSignal(segs, i);
    const next = nextSignal(segs, i);

    const enteredFromOutside =
      !prev || !isKnown(prev) || targetKey(prev) !== targetKey(cur);

    // Departure requires a confirmed next signal that is not the same target.
    // gps_gap alone (no following signal) is NOT a departure.
    const willLeave =
      !!next && (!isKnown(next) || targetKey(next) !== targetKey(cur));

    if (enteredFromOutside) {
      out.push({
        eventType: 'arrival',
        eventAt: cur.startTs,
        targetType: cur.matchedTargetType ?? 'unknown',
        targetId: cur.matchedTargetId ?? null,
        targetLabel: cur.matchedTargetName ?? cur.label ?? null,
        confidence: cur.confidence ?? null,
        gpsSegmentId: cur.id,
        metadata: {
          previous_segment_type: prev?.type ?? null,
          previous_segment_id: prev?.id ?? null,
          ping_count: cur.pingCount,
          duration_min: cur.durationMin,
          reason: cur.reason,
        },
      });
    }

    if (willLeave) {
      out.push({
        eventType: 'departure',
        eventAt: cur.endTs,
        targetType: cur.matchedTargetType ?? 'unknown',
        targetId: cur.matchedTargetId ?? null,
        targetLabel: cur.matchedTargetName ?? cur.label ?? null,
        confidence: cur.confidence ?? null,
        gpsSegmentId: cur.id,
        metadata: {
          next_segment_type: next?.type ?? null,
          next_segment_id: next?.id ?? null,
          ping_count: cur.pingCount,
          duration_min: cur.durationMin,
          reason: cur.reason,
        },
      });
    }
  }

  return out;
}
