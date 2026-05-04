// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { classifyLocationEntry } from '../locationEntryClassification';

describe('classifyLocationEntry', () => {
  it('treats location_id + source=manual (no booking/lp) as work timer, NOT presence', () => {
    const c = classifyLocationEntry({
      source: 'manual',
      booking_id: null,
      large_project_id: null,
      location_id: 'loc-lager',
    });
    expect(c.isPresenceOnly).toBe(false);
    expect(c.isLocationWorkTimer).toBe(true);
  });

  it('treats source=gps without booking/lp as presence-only', () => {
    const c = classifyLocationEntry({
      source: 'gps',
      booking_id: null,
      large_project_id: null,
      location_id: 'loc-lager',
    });
    expect(c.isPresenceOnly).toBe(true);
    expect(c.isLocationWorkTimer).toBe(false);
  });

  it('treats geofence_background event as presence-only', () => {
    const c = classifyLocationEntry({
      source: 'geofence_background',
      booking_id: null,
      large_project_id: null,
      location_id: 'loc-x',
    });
    expect(c.isPresenceOnly).toBe(true);
  });

  it('LTE with booking_id is never presence-only regardless of source', () => {
    const c = classifyLocationEntry({
      source: 'gps',
      booking_id: 'b1',
      large_project_id: null,
      location_id: null,
    });
    expect(c.isPresenceOnly).toBe(false);
    expect(c.isLocationWorkTimer).toBe(false);
  });

  it('LTE with large_project_id is never presence-only', () => {
    const c = classifyLocationEntry({
      source: 'manual',
      booking_id: null,
      large_project_id: 'lp1',
      location_id: null,
    });
    expect(c.isPresenceOnly).toBe(false);
  });

  it('treats source=location_timer / mobile / auto_assigned as work timer', () => {
    for (const src of ['location_timer', 'mobile', 'auto_assigned', 'timer']) {
      const c = classifyLocationEntry({
        source: src,
        booking_id: null,
        large_project_id: null,
        location_id: 'loc-lager',
      });
      expect(c.isLocationWorkTimer, `source=${src}`).toBe(true);
      expect(c.isPresenceOnly, `source=${src}`).toBe(false);
    }
  });

  it('empty source on a location_id row defaults to work timer (legacy inserts)', () => {
    const c = classifyLocationEntry({
      source: null,
      booking_id: null,
      large_project_id: null,
      location_id: 'loc-lager',
    });
    expect(c.isLocationWorkTimer).toBe(true);
    expect(c.isPresenceOnly).toBe(false);
  });

  // Billy-scenario: workday 13:30–21:07 + Lager-LTE source=manual. Tidigare
  // klassades raden som presence-only → hours=0 → "Fördelad 0h". Nu räknas
  // den som riktig location work timer.
  it('Billy: workday + Lager LTE source=manual ger inte fördelad 0h', () => {
    const c = classifyLocationEntry({
      source: 'manual',
      booking_id: null,
      large_project_id: null,
      location_id: 'loc-lager',
    });
    expect(c.isPresenceOnly).toBe(false);
    expect(c.isLocationWorkTimer).toBe(true);
  });
});
