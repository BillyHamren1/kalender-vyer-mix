import { describe, expect, it } from 'vitest';
import { mergeTrackingPolicy } from '../mergeTrackingPolicy';
import { resolveAppliedTrackingDistanceFilter } from '../nativeTrackingPolicy';

describe('mergeTrackingPolicy', () => {
  it('lokal near_target 35m vinner över backend battery_saver 500m', () => {
    const merged = mergeTrackingPolicy({
      backend: { heartbeatMs: 300_000, distanceFilter: 500, mode: 'battery_saver' },
      local: { heartbeatMs: 60_000, distanceFilter: 35, mode: 'near_target' },
    });
    expect(merged.distanceFilter).toBe(35);
    // Backend styr fortfarande heartbeat.
    expect(merged.heartbeatMs).toBe(300_000);
    expect(merged.reason).toContain('backend:battery_saver');
    expect(merged.reason).toContain('local:near_target');
  });

  it('backend 500m + lokal idle 50m => applied 50m', () => {
    const merged = mergeTrackingPolicy({
      backend: { heartbeatMs: 300_000, distanceFilter: 500, mode: 'battery_saver' },
      local: { heartbeatMs: 60_000, distanceFilter: 50, mode: 'idle' },
    });
    expect(merged.distanceFilter).toBe(50);
  });

  it('backend 20m + lokal idle 50m => applied 20m (native MIN är 20m, capture får vara tät)', () => {
    const merged = mergeTrackingPolicy({
      backend: { heartbeatMs: 60_000, distanceFilter: 20, mode: 'active' },
      local: { heartbeatMs: 60_000, distanceFilter: 50, mode: 'idle' },
    });
    expect(merged.distanceFilter).toBe(20);
    const applied = resolveAppliedTrackingDistanceFilter({
      desiredDistanceFilter: merged.distanceFilter,
      isNativePlatform: true,
    });
    expect(applied).toBe(20);
  });

  it('utan backend används lokal decision rakt av', () => {
    const merged = mergeTrackingPolicy({
      backend: null,
      local: { heartbeatMs: 60_000, distanceFilter: 35, mode: 'near_target' },
    });
    expect(merged).toMatchObject({ heartbeatMs: 60_000, distanceFilter: 35 });
    expect(merged.reason).toBe('local:near_target');
  });

  it('skyddet är komplett: backend 500m near_target 35m på native => 35m applied (inte 500m)', () => {
    const merged = mergeTrackingPolicy({
      backend: { heartbeatMs: 300_000, distanceFilter: 500, mode: 'battery_saver' },
      local: { heartbeatMs: 60_000, distanceFilter: 35, mode: 'near_target' },
    });
    const applied = resolveAppliedTrackingDistanceFilter({
      desiredDistanceFilter: merged.distanceFilter,
      isNativePlatform: true,
    });
    expect(applied).toBe(35);
  });
});
