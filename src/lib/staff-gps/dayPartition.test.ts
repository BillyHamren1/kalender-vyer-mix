import { describe, it, expect } from 'vitest';
import { buildDayPartition } from './dayPartition';

const iso = (h: number, m = 0) =>
  new Date(Date.UTC(2026, 4, 20, h, m, 0)).toISOString();

describe('buildDayPartition – from/to-labels på travel-segment', () => {
  it('travel-segment mellan två kända platser får fromLabel + toLabel', () => {
    const pings = [
      { recorded_at: iso(8, 0), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(9, 0), lat: 59.3, lng: 18.0 },
      // rörelse mellan visits
      { recorded_at: iso(9, 30), lat: 59.32, lng: 18.05 },
      { recorded_at: iso(10, 0), lat: 59.4, lng: 18.2 },
      { recorded_at: iso(11, 0), lat: 59.4, lng: 18.2 },
    ];
    const visits = [
      { start: iso(8, 0), end: iso(9, 0), knownSite: { id: 'wh', name: 'FA Warehouse' } },
      { start: iso(10, 0), end: iso(11, 0), knownSite: { id: 'pr', name: 'Swedish game fair' } },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    const travel = out.segments.find((s) => s.type === 'travel');
    expect(travel).toBeTruthy();
    expect(travel?.fromLabel).toBe('FA Warehouse');
    expect(travel?.toLabel).toBe('Swedish game fair');
  });

  it('travel i slutet av dagen har fromLabel från sista visit, toLabel=null', () => {
    const pings = [
      { recorded_at: iso(8, 0), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(9, 0), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(9, 30), lat: 59.4, lng: 18.2 },
      { recorded_at: iso(10, 0), lat: 59.5, lng: 18.4 },
    ];
    const visits = [
      { start: iso(8, 0), end: iso(9, 0), knownSite: { id: 'wh', name: 'FA Warehouse' } },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    const last = out.segments[out.segments.length - 1];
    expect(last.type).toBe('travel');
    expect(last.fromLabel).toBe('FA Warehouse');
    expect(last.toLabel).toBeNull();
  });

  it('lager → direkt resa: lager-visit behålls även om kort', () => {
    const pings = [
      { recorded_at: iso(8, 0), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(8, 5), lat: 59.3, lng: 18.0 },
      // rörelse direkt efter
      { recorded_at: iso(8, 30), lat: 59.4, lng: 18.2 },
      { recorded_at: iso(9, 0), lat: 59.5, lng: 18.4 },
    ];
    const visits = [
      { start: iso(8, 0), end: iso(8, 5), knownSite: { id: 'wh', name: 'FA Warehouse' } },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    const work = out.segments.find((s) => s.type === 'work');
    const travel = out.segments.find((s) => s.type === 'travel');
    expect(work?.label).toBe('FA Warehouse');
    expect(travel).toBeTruthy();
    expect(travel?.fromLabel).toBe('FA Warehouse');
  });
});

describe('buildDayPartition – absorbera kort GPS-brus', () => {
  it('kort unknown_place (<15m) i slutet av dagen slukas av föregående work', () => {
    const pings = [
      { recorded_at: iso(7, 10), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(11, 31), lat: 59.3, lng: 18.0 },
      // 5 min utanför geofence
      { recorded_at: iso(11, 33), lat: 59.301, lng: 18.001 },
      { recorded_at: iso(11, 36), lat: 59.301, lng: 18.001 },
    ];
    const visits = [
      { start: iso(7, 10), end: iso(11, 31), knownSite: { id: 'wh', name: 'FA Warehouse' } },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    expect(out.segments.find((s) => s.type === 'unknown_place')).toBeUndefined();
    const work = out.segments.find((s) => s.type === 'work');
    expect(work?.end).toBe(iso(11, 36));
  });


  it('kort travel mellan samma site (FA → FA) absorberas i föregående work', () => {
    const pings = [
      { recorded_at: iso(7, 10), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(11, 17), lat: 59.3, lng: 18.0 },
      // 2 min "travel" — ingen riktig displacement, men säg att vi har det
      { recorded_at: iso(11, 18), lat: 59.31, lng: 18.02 },
      { recorded_at: iso(11, 19), lat: 59.31, lng: 18.02 },
      { recorded_at: iso(11, 31), lat: 59.3, lng: 18.0 },
    ];
    const visits = [
      { start: iso(7, 10), end: iso(11, 17), knownSite: { id: 'wh', name: 'FA Warehouse' } },
      { start: iso(11, 19), end: iso(11, 31), knownSite: { id: 'wh', name: 'FA Warehouse' } },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    expect(out.segments.find((s) => s.type === 'travel')).toBeUndefined();
    const work = out.segments.filter((s) => s.type === 'work');
    expect(work.length).toBe(1);
    expect(work[0].knownSiteId).toBe('wh');
  });

  it('travel ≥10 min till ny adress behålls', () => {
    const pings = [
      { recorded_at: iso(8, 0), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(9, 0), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(9, 20), lat: 59.35, lng: 18.1 },
      { recorded_at: iso(9, 40), lat: 59.4, lng: 18.2 },
      { recorded_at: iso(11, 0), lat: 59.4, lng: 18.2 },
    ];
    const visits = [
      { start: iso(8, 0), end: iso(9, 0), knownSite: { id: 'a', name: 'A' } },
      { start: iso(9, 40), end: iso(11, 0), knownSite: { id: 'b', name: 'B' } },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    expect(out.segments.find((s) => s.type === 'travel')).toBeTruthy();
  });

  it('kort travel <10m till ny adress med <5 min vistelse absorberas', () => {
    const pings = [
      { recorded_at: iso(8, 0), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(9, 0), lat: 59.3, lng: 18.0 },
      { recorded_at: iso(9, 4), lat: 59.35, lng: 18.1 },
      { recorded_at: iso(9, 8), lat: 59.4, lng: 18.2 },
      { recorded_at: iso(9, 10), lat: 59.4, lng: 18.2 },
    ];
    const visits = [
      { start: iso(8, 0), end: iso(9, 0), knownSite: { id: 'a', name: 'A' } },
      { start: iso(9, 8), end: iso(9, 10), knownSite: { id: 'b', name: 'B' } },
    ];
    const out = buildDayPartition({ pings, visits, privateGeofenceIds: [] });
    // travel <10m, destination B är <5m → ska absorberas (B kan vara kvar som unknown/work; key är att travel försvinner)
    expect(out.segments.find((s) => s.type === 'travel')).toBeUndefined();
  });
});

