import { describe, it, expect } from 'vitest';
import { buildDayPartition } from '../dayPartition';

/**
 * Regression: skärmdump 23 maj 2026.
 * Åström 06:04–06:05 (1m) → Okänd plats Åström→Åström 06:05–09:10 (3h 5m) → Åström 09:10–09:19 (9m)
 * ska bli ETT sammanhängande Åström-block.
 */
describe('dayPartition same-site sandwich collapse', () => {
  it('kollapsar stay(A) → unknown_place → stay(A) (även >15 min)', () => {
    const visits = [
      { start: '2026-05-23T04:04:00Z', end: '2026-05-23T04:05:00Z', knownSite: { id: 'astrom', name: 'Åström' } },
      { start: '2026-05-23T07:10:00Z', end: '2026-05-23T07:19:00Z', knownSite: { id: 'astrom', name: 'Åström' } },
    ];
    const pings = [
      { recorded_at: '2026-05-23T04:04:00Z', lat: 59.49, lng: 17.85 },
      { recorded_at: '2026-05-23T05:30:00Z', lat: 59.4901, lng: 17.8501 },
      { recorded_at: '2026-05-23T06:30:00Z', lat: 59.4899, lng: 17.8499 },
      { recorded_at: '2026-05-23T07:19:00Z', lat: 59.49, lng: 17.85 },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].type).toBe('work');
    expect(out.segments[0].knownSiteId).toBe('astrom');
  });

  it('kollapsar INTE när faktisk travel ligger emellan', () => {
    const visits = [
      { start: '2026-05-23T06:00:00Z', end: '2026-05-23T06:30:00Z', knownSite: { id: 'astrom', name: 'Åström' } },
      { start: '2026-05-23T09:00:00Z', end: '2026-05-23T09:30:00Z', knownSite: { id: 'astrom', name: 'Åström' } },
    ];
    const pings = [
      { recorded_at: '2026-05-23T06:00:00Z', lat: 59.49, lng: 17.85 },
      { recorded_at: '2026-05-23T07:30:00Z', lat: 59.55, lng: 17.95 },
      { recorded_at: '2026-05-23T09:00:00Z', lat: 59.49, lng: 17.85 },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    const types = out.segments.map((s) => s.type);
    expect(types).toContain('travel');
    expect(types).toContain('work');
  });
});
