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
