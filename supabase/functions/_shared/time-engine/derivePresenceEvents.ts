/**
 * derivePresenceEvents — pure helper.
 *
 * Walks an ordered list of GpsTimelineSegment and emits arrival/departure
 * presence events on transitions IN/OUT of a `known_site` segment.
 *
 * Rules:
 *   - arrival: previous segment is NOT a known_site (or none), current IS.
 *   - departure: previous segment IS a known_site, current is NOT (or end-of-day).
 *   - moving directly between two different known_sites yields:
 *       departure(prev) + arrival(next).
 *   - gps_gap and unknown_place do NOT generate events on their own —
 *     they only matter as a transition state.
 *   - never produces time_report / location_time_entry / travel — read-only.
 */

import type { GpsTimelineSegment } from './buildGpsDayTimeline.ts';

export type PresenceEventType = 'arrival' | 'departure';

export interface DerivedPresenceEvent {
  eventType: PresenceEventType;
  /** When the arrival/departure happened (ISO). */
  eventAt: string;
  targetType: string;        // 'project' | 'large_project' | 'organization_location' | 'booking' | 'unknown'
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

function targetKey(seg: GpsTimelineSegment): string {
  return `${seg.matchedTargetType ?? 'unknown'}::${seg.matchedTargetId ?? ''}`;
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
    const prev = segs[i - 1] ?? null;
    const next = segs[i + 1] ?? null;

    if (!isKnown(cur)) continue;

    const enteredFromOutside = !isKnown(prev) || targetKey(prev!) !== targetKey(cur);
    const willLeave = !isKnown(next) || targetKey(next!) !== targetKey(cur);

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
          end_of_day: next === null,
        },
      });
    }
  }

  return out;
}
