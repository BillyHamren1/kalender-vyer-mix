import { describe, it, expect } from 'vitest';
import { buildTimeRegistrationSegments, type GpsTimelineSegmentLike } from '@/lib/time-engine/buildTimeRegistrationSegments';
import type { ActiveTimeRegistration, WorkTarget } from '@/lib/time-engine/contracts';

const reg = (overrides: Partial<ActiveTimeRegistration> = {}): ActiveTimeRegistration => ({
  id: 'reg-1',
  staffId: 'staff-1',
  organizationId: 'org-1',
  startedAt: '2026-05-08T08:00:00.000Z',
  endedAt: '2026-05-08T12:00:00.000Z',
  status: 'stopped',
  startSource: 'gps_geofence_auto_start',
  startedByUser: false,
  autoStarted: true,
  startTargetType: 'project',
  startTargetId: 'target-1',
  startTargetLabel: 'FA Warehouse',
  currentKind: 'work_target' as any, // type uses RegistrationKind which still has legacy values
  currentLabel: 'FA Warehouse',
  currentTargetKey: 'project:target-1',
  confidence: 0.9,
  needsUserChoice: false,
  ...overrides,
});

const seg = (over: Partial<GpsTimelineSegmentLike>): GpsTimelineSegmentLike => ({
  id: 'gps-x',
  startTs: '2026-05-08T08:00:00.000Z',
  endTs: '2026-05-08T09:00:00.000Z',
  kind: 'stay',
  type: 'known_site',
  label: 'FA Warehouse',
  matchedTargetId: 'target-1',
  matchedTargetType: 'project',
  matchedTargetName: 'FA Warehouse',
  confidence: 0.9,
  ...over,
});

const target: WorkTarget = {
  key: 'project:target-1',
  kind: 'project',
  refId: 'target-1',
  label: 'FA Warehouse',
  center: { lat: 0, lng: 0 },
  radiusM: 100,
};

describe('buildTimeRegistrationSegments', () => {
  it('returns [] when no active registration', () => {
    expect(
      buildTimeRegistrationSegments({
        activeRegistration: null,
        gpsTimeline: { segments: [seg({})] },
      }),
    ).toEqual([]);
  });

  it('maps known_site → work_target, travel → transport, gps_gap → gps_gap', () => {
    const out = buildTimeRegistrationSegments({
      activeRegistration: reg(),
      gpsTimeline: {
        segments: [
          seg({ id: 'a', startTs: '2026-05-08T08:00:00.000Z', endTs: '2026-05-08T09:00:00.000Z', kind: 'stay', type: 'known_site' }),
          seg({ id: 'b', startTs: '2026-05-08T09:00:00.000Z', endTs: '2026-05-08T09:30:00.000Z', kind: 'travel', type: 'transport', matchedTargetId: null, matchedTargetType: null, matchedTargetName: null }),
          seg({ id: 'c', startTs: '2026-05-08T09:30:00.000Z', endTs: '2026-05-08T10:00:00.000Z', kind: 'gps_gap', type: 'gps_gap', matchedTargetId: null, matchedTargetType: null, matchedTargetName: null, label: 'GPS-glapp' }),
        ],
      },
      targetsByRefId: new Map([[target.refId, target]]),
    });
    expect(out.map((s) => s.kind)).toEqual(['work_target', 'transport', 'gps_gap']);
    expect(out[0].targetKey).toBe('project:target-1');
    expect(out[0].targetKind).toBe('project');
    expect(out[1].targetKey).toBeNull();
    expect(out[2].targetKey).toBeNull();
  });

  it('clips segments to registration window', () => {
    const out = buildTimeRegistrationSegments({
      activeRegistration: reg({ startedAt: '2026-05-08T08:30:00.000Z', endedAt: '2026-05-08T09:30:00.000Z' }),
      gpsTimeline: {
        segments: [
          // entirely before window — dropped
          seg({ id: 'before', startTs: '2026-05-08T07:00:00.000Z', endTs: '2026-05-08T08:00:00.000Z' }),
          // straddles start — clipped
          seg({ id: 'mid', startTs: '2026-05-08T08:00:00.000Z', endTs: '2026-05-08T10:00:00.000Z' }),
          // entirely after — dropped
          seg({ id: 'after', startTs: '2026-05-08T11:00:00.000Z', endTs: '2026-05-08T12:00:00.000Z' }),
        ],
      },
      targetsByRefId: new Map([[target.refId, target]]),
    });
    expect(out).toHaveLength(1);
    expect(out[0].startedAt).toBe('2026-05-08T08:30:00.000Z');
    expect(out[0].endedAt).toBe('2026-05-08T09:30:00.000Z');
  });

  it('does NOT subtract work time for gps_gap (registration length unchanged)', () => {
    const out = buildTimeRegistrationSegments({
      activeRegistration: reg({ startedAt: '2026-05-08T08:00:00.000Z', endedAt: '2026-05-08T10:00:00.000Z' }),
      gpsTimeline: {
        segments: [
          seg({ id: 'a', startTs: '2026-05-08T08:00:00.000Z', endTs: '2026-05-08T08:30:00.000Z', kind: 'stay', type: 'known_site' }),
          seg({ id: 'gap', startTs: '2026-05-08T08:30:00.000Z', endTs: '2026-05-08T09:30:00.000Z', kind: 'gps_gap', type: 'gps_gap', matchedTargetId: null, matchedTargetType: null, matchedTargetName: null }),
          seg({ id: 'b', startTs: '2026-05-08T09:30:00.000Z', endTs: '2026-05-08T10:00:00.000Z', kind: 'stay', type: 'known_site' }),
        ],
      },
      targetsByRefId: new Map([[target.refId, target]]),
    });
    // registration is 120 minutes; gap is 60 of those — but the timer keeps ticking.
    // We assert the total *covered* duration of all segments equals the full window.
    const totalMs = out.reduce((acc, s) => acc + (Date.parse(s.endedAt!) - Date.parse(s.startedAt)), 0);
    expect(totalMs).toBe(120 * 60 * 1000);
    expect(out.find((s) => s.kind === 'gps_gap')).toBeDefined();
  });

  it('merges adjacent work_target segments with the same targetKey', () => {
    const out = buildTimeRegistrationSegments({
      activeRegistration: reg(),
      gpsTimeline: {
        segments: [
          seg({ id: 'a', startTs: '2026-05-08T08:00:00.000Z', endTs: '2026-05-08T08:30:00.000Z' }),
          seg({ id: 'b', startTs: '2026-05-08T08:30:00.000Z', endTs: '2026-05-08T09:00:00.000Z' }),
        ],
      },
      targetsByRefId: new Map([[target.refId, target]]),
    });
    expect(out).toHaveLength(1);
    expect(out[0].startedAt).toBe('2026-05-08T08:00:00.000Z');
    expect(out[0].endedAt).toBe('2026-05-08T09:00:00.000Z');
  });

  it('uses now() as window end when registration is open-ended', () => {
    const now = new Date('2026-05-08T09:00:00.000Z');
    const out = buildTimeRegistrationSegments({
      activeRegistration: reg({ endedAt: null, status: 'active' }),
      gpsTimeline: {
        segments: [
          seg({ id: 'a', startTs: '2026-05-08T08:00:00.000Z', endTs: '2026-05-08T11:00:00.000Z' }),
        ],
      },
      targetsByRefId: new Map([[target.refId, target]]),
      now,
    });
    expect(out).toHaveLength(1);
    expect(out[0].endedAt).toBe('2026-05-08T09:00:00.000Z');
  });
});
