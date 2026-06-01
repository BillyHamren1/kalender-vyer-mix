import { describe, it, expect } from 'vitest';
import { deriveCaptureUploadPolicy } from '../captureUploadPolicy';

describe('deriveCaptureUploadPolicy', () => {
  it('inside known geofence → batch_inside_geofence with 30 min upload interval', () => {
    const p = deriveCaptureUploadPolicy({ mode: 'active_timer' });
    expect(p.uploadMode).toBe('batch_inside_geofence');
    expect(p.uploadIntervalMs).toBe(30 * 60_000);
    // Capture must stay tight so we can build a real local batch.
    expect(p.captureDistanceFilter).toBeLessThanOrEqual(20);
    expect(p.captureThrottleMs).toBeLessThanOrEqual(30_000);
  });

  it('inside_geofence_pending behaves the same as active_timer', () => {
    const a = deriveCaptureUploadPolicy({ mode: 'inside_geofence_pending' });
    expect(a.uploadMode).toBe('batch_inside_geofence');
    expect(a.uploadIntervalMs).toBe(30 * 60_000);
  });

  it('near_target / arrived_pending → boundary_guard 60 s', () => {
    for (const mode of ['near_target', 'arrived_pending_user_response'] as const) {
      const p = deriveCaptureUploadPolicy({ mode });
      expect(p.uploadMode).toBe('boundary_guard');
      expect(p.uploadIntervalMs).toBe(60_000);
    }
  });

  it('workday_far + rörelse → moving live upload', () => {
    const p = deriveCaptureUploadPolicy({ mode: 'workday_far', speedMps: 3 });
    expect(p.uploadMode).toBe('moving_outside_known_geofence');
    expect(p.uploadIntervalMs).toBe(60_000);
  });

  it('workday_far + stilla → outside_idle 5 min', () => {
    const p = deriveCaptureUploadPolicy({ mode: 'workday_far', speedMps: 0 });
    expect(p.uploadMode).toBe('outside_idle');
    expect(p.uploadIntervalMs).toBe(5 * 60_000);
  });

  it('okänt mode → default 10 min', () => {
    const p = deriveCaptureUploadPolicy({ mode: null });
    expect(p.uploadMode).toBe('default');
    expect(p.uploadIntervalMs).toBe(10 * 60_000);
  });
});
