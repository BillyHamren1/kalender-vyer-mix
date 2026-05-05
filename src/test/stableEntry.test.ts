import { describe, it, expect } from 'vitest';
import {
  createEntryTracker,
  recordEntryPing,
  evaluateStableEntry,
  firstReliableArrivalTs,
  ENTRY_PING_MIN_DWELL_MS,
} from '@/lib/geofence/stableEntry';

describe('stableEntry', () => {
  it('single ping is insufficient', () => {
    const t = createEntryTracker();
    const now = Date.now();
    recordEntryPing(t, { ts: now, distance: 50, accuracy: 20 });
    const ev = evaluateStableEntry(t, now, 1000);
    expect(ev.status).toBe('insufficient');
  });

  it('three pings within 2 min → stable', () => {
    const t = createEntryTracker();
    const now = Date.now();
    recordEntryPing(t, { ts: now, distance: 50, accuracy: 20 });
    recordEntryPing(t, { ts: now + 30_000, distance: 40, accuracy: 25 });
    recordEntryPing(t, { ts: now + 60_000, distance: 30, accuracy: 30 });
    const ev = evaluateStableEntry(t, now + 60_000, 1000);
    expect(ev.status).toBe('stable');
  });

  it('two pings spanning ≥2 min → stable via dwell', () => {
    const t = createEntryTracker();
    const now = Date.now();
    recordEntryPing(t, { ts: now, distance: 50, accuracy: 20 });
    recordEntryPing(t, { ts: now + ENTRY_PING_MIN_DWELL_MS, distance: 30, accuracy: 25 });
    const ev = evaluateStableEntry(t, now + ENTRY_PING_MIN_DWELL_MS, 1000);
    expect(ev.status).toBe('stable');
  });

  it('mostly bad accuracy → unstable', () => {
    const t = createEntryTracker();
    const now = Date.now();
    recordEntryPing(t, { ts: now, distance: 50, accuracy: 200 });
    recordEntryPing(t, { ts: now + 30_000, distance: 40, accuracy: 200 });
    recordEntryPing(t, { ts: now + 60_000, distance: 30, accuracy: 30 });
    const ev = evaluateStableEntry(t, now + 60_000, 1000);
    expect(ev.status).toBe('unstable');
  });

  it('no recent ping → no_signal', () => {
    const t = createEntryTracker();
    const now = Date.now();
    recordEntryPing(t, { ts: now, distance: 50, accuracy: 20 });
    const ev = evaluateStableEntry(t, now, 10 * 60 * 1000);
    expect(ev.status).toBe('no_signal');
  });

  it('firstReliableArrivalTs picks earliest good-accuracy ping', () => {
    const t = createEntryTracker();
    const now = Date.now();
    recordEntryPing(t, { ts: now, distance: 50, accuracy: 200 });
    recordEntryPing(t, { ts: now + 1000, distance: 40, accuracy: 30 });
    expect(firstReliableArrivalTs(t)).toBe(now + 1000);
  });
});
