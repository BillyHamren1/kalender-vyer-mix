/**
 * Regression: 2026-05-18 GPS-tystnaden.
 *
 * Tidigare hade `idle` heartbeat 10 min + distanceFilter 500m, vilket gjorde
 * att en stillastående telefon utan dagens BSA-targets gick tyst i timmar
 * (1–2 pings, sedan inget). Vi har sänkt rejält — låser värdena här så ingen
 * råkar dra upp dem igen utan att läsa det här testet.
 */
import { describe, it, expect } from 'vitest';
import { decideLocationMode } from '../locationMode';

const EMPTY = {
  position: null,
  targets: [],
  hasActiveTimer: false,
  hasPendingArrival: false,
  insideKeys: new Set<string>(),
  previousMode: null,
} as const;

describe('locationMode tightened defaults (2026-05-18)', () => {
  it('idle mode: heartbeat <= 3 min och distanceFilter <= 50m', () => {
    const d = decideLocationMode({ ...EMPTY });
    expect(d.mode).toBe('idle');
    expect(d.heartbeatMs).toBeLessThanOrEqual(3 * 60 * 1000);
    expect(d.distanceFilter).toBeLessThanOrEqual(50);
  });

  it('workday_far mode: heartbeat <= 2 min och distanceFilter <= 50m', () => {
    const d = decideLocationMode({
      ...EMPTY,
      targets: [{ key: 't', lat: 0, lng: 0, radius: 50 }],
      position: { lat: 1, lng: 1 }, // långt bort
    });
    expect(d.mode).toBe('workday_far');
    expect(d.heartbeatMs).toBeLessThanOrEqual(2 * 60 * 1000);
    expect(d.distanceFilter).toBeLessThanOrEqual(50);
  });

  it('active_timer mode: distanceFilter <= 30m så minsta rörelse fångas', () => {
    const d = decideLocationMode({ ...EMPTY, hasActiveTimer: true });
    expect(d.mode).toBe('active_timer');
    expect(d.distanceFilter).toBeLessThanOrEqual(30);
  });
});
