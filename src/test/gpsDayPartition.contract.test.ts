import { describe, it, expect } from 'vitest';
import { buildDayPartition } from '@/lib/staff-gps/dayPartition';

const D = '2026-05-25';
const t = (hhmm: string) => `${D}T${hhmm}:00.000Z`;
const ping = (hhmm: string, lat = 59.33, lng = 18.06) => ({
  recorded_at: t(hhmm),
  lat, lng,
});

describe('buildDayPartition — partition-invariant', () => {
  it('returnerar tom partition utan pings', () => {
    const p = buildDayPartition({ pings: [], visits: [], privateGeofenceIds: [] });
    expect(p.segments).toEqual([]);
    expect(p.windowMin).toBe(0);
  });

  it('summan av segmentens minuter === windowMin', () => {
    const pings = [
      ping('07:00'),
      ping('10:00', 59.40, 18.20),
      ping('11:00', 59.40, 18.20),
      ping('17:00', 59.33, 18.06),
    ];
    const visits = [
      { start: t('07:00'), end: t('09:30'), knownSite: { id: 'fa', name: 'FA' } },
      { start: t('11:00'), end: t('17:00'), knownSite: { id: 'cr', name: 'Craft' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    const sum = p.segments.reduce((a, s) => a + s.minutes, 0);
    expect(sum).toBe(p.windowMin);
    expect(p.workMin).toBeLessThanOrEqual(p.windowMin);
  });

  it('inga overlap mellan segment och inga gap', () => {
    const pings = [ping('06:00'), ping('20:00', 59.50, 18.30)];
    const visits = [
      { start: t('06:00'), end: t('09:00'), knownSite: { id: 'a', name: 'A' } },
      { start: t('14:00'), end: t('20:00'), knownSite: { id: 'b', name: 'B' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    for (let i = 1; i < p.segments.length; i++) {
      expect(p.segments[i].start).toBe(p.segments[i - 1].end);
    }
    expect(p.segments[0].start).toBe(p.firstIso);
    expect(p.segments[p.segments.length - 1].end).toBe(p.lastIso);
  });

  it('boundary mellan visit A och B räknas inte två gånger', () => {
    const pings = [ping('08:00'), ping('12:00')];
    const visits = [
      { start: t('08:00'), end: t('10:00'), knownSite: { id: 'a', name: 'A' } },
      { start: t('10:00'), end: t('12:00'), knownSite: { id: 'b', name: 'B' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    const sum = p.segments.reduce((a, s) => a + s.minutes, 0);
    expect(sum).toBe(p.windowMin);
    expect(p.workMin).toBe(p.windowMin);
  });

  it('privat-zon klassificeras som private och dras INTE in i workMin', () => {
    const pings = [ping('07:00'), ping('19:00')];
    const visits = [
      { start: t('07:00'), end: t('08:00'), knownSite: { id: 'home', name: 'Hem' } },
      { start: t('09:00'), end: t('19:00'), knownSite: { id: 'fa', name: 'FA' } },
    ];
    const p = buildDayPartition({
      pings, visits, privateGeofenceIds: ['home'],
    });
    expect(p.privateMin).toBeGreaterThan(0);
    expect(p.workMin + p.privateMin + p.travelMin + p.unknownMin + p.gapMin + p.idleMin).toBe(p.windowMin);
  });

  it('gap utan pings klassas som gps_gap', () => {
    const pings = [ping('07:00'), ping('08:00'), ping('18:00')];
    const visits = [
      { start: t('07:00'), end: t('08:00'), knownSite: { id: 'a', name: 'A' } },
      { start: t('18:00'), end: t('18:00'), knownSite: { id: 'b', name: 'B' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    expect(p.segments.some((s) => s.type === 'gps_gap')).toBe(true);
  });

  it('rörelse ≥ 500m mellan visits klassas som travel', () => {
    const pings = [
      ping('07:00', 59.33, 18.06),
      ping('07:30', 59.33, 18.06),
      ping('08:00', 59.40, 18.20),
      ping('08:30', 59.40, 18.20),
      ping('17:00', 59.40, 18.20),
    ];
    const visits = [
      { start: t('07:00'), end: t('07:30'), knownSite: { id: 'a', name: 'A' } },
      { start: t('08:30'), end: t('17:00'), knownSite: { id: 'b', name: 'B' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    expect(p.segments.some((s) => s.type === 'travel')).toBe(true);
  });
});
