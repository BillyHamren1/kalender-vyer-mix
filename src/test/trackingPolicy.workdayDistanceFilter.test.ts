/**
 * Backend tracking policy får ALDRIG returnera glesa distanceFilter
 * (200m/500m) under aktiv arbetsdag. Under aktiv timer max 25m, under
 * öppen workday utan target max 50m. Under battery_saver (idle) får 500m
 * gälla.
 *
 * Skyddar mot regression där en gles policy gjorde att telefonen
 * uppfattades som "tyst" trots öppen workday.
 */
import { describe, it, expect } from 'vitest';
import { buildTrackingPolicy } from '../../supabase/functions/_shared/trackingPolicy';

const base = { activeBoosts: [] as never[], lastPingAt: null };

describe('trackingPolicy distanceFilter under workday/active_work', () => {
  it('active_work får aldrig vara glesare än 25m', () => {
    const p = buildTrackingPolicy({ ...base, hasActiveTimer: true, workdayOpen: true });
    expect(p.mode).toBe('active_work');
    expect(p.distanceFilter).toBeLessThanOrEqual(25);
  });

  it('öppen workday utan timer (normal) får aldrig vara glesare än 50m', () => {
    const p = buildTrackingPolicy({ ...base, hasActiveTimer: false, workdayOpen: true });
    expect(p.mode).toBe('normal');
    expect(p.distanceFilter).toBeLessThanOrEqual(50);
  });

  it('battery_saver (idle) får använda 500m', () => {
    const p = buildTrackingPolicy({ ...base, hasActiveTimer: false, workdayOpen: false });
    expect(p.mode).toBe('battery_saver');
    expect(p.distanceFilter).toBe(500);
  });
});
