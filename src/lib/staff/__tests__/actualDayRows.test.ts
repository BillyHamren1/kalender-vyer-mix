// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildActualDayRows } from '../actualDayRows';
import type { PlaceVisit, TravelGap } from '../pingPlaceSegments';

const visit = (
  key: string,
  label: string,
  start: string,
  end: string,
  lat: number,
  lng: number,
  siteId?: string,
): PlaceVisit => ({
  placeKey: key,
  knownSite: siteId ? { id: siteId, name: label } : null,
  centre: { lat, lng },
  start,
  end,
  durationMin: Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
  pingCount: 5,
  pings: [],
});

const travel = (key: string, from: PlaceVisit, to: PlaceVisit): TravelGap => ({
  key,
  start: from.end,
  end: to.start,
  durationMin: Math.round((new Date(to.start).getTime() - new Date(from.end).getTime()) / 60_000),
  from,
  to,
  pings: [],
});

describe('buildActualDayRows', () => {
  it('slår ihop kort mikroavstickare till samma plats i ett enda sammanhållet platsblock', () => {
    const faMorning = visit('fa-1', 'FA Warehouse', '2026-05-03T07:00:00Z', '2026-05-03T09:00:00Z', 59.49, 17.85, 'fa');
    const microStop = visit('tmp-1', 'Trädskolevägen', '2026-05-03T09:03:00Z', '2026-05-03T09:10:00Z', 59.4912, 17.8511);
    const faReturn = visit('fa-2', 'FA Warehouse', '2026-05-03T09:13:00Z', '2026-05-03T11:00:00Z', 59.49, 17.85, 'fa');

    const rows = buildActualDayRows(
      [faMorning, microStop, faReturn],
      [travel('t1', faMorning, microStop), travel('t2', microStop, faReturn)],
      ['FA Warehouse', 'Trädskolevägen', 'FA Warehouse'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('visit');
    expect(rows[0].label).toBe('FA Warehouse');
    expect(rows[0].startIso).toBe('2026-05-03T07:00:00Z');
    expect(rows[0].endIso).toBe('2026-05-03T11:00:00Z');
  });

  it('gör kort mellanplats till resa när den inte hör till samma plats', () => {
    const fa = visit('fa', 'FA Warehouse', '2026-05-03T07:00:00Z', '2026-05-03T09:00:00Z', 59.49, 17.85, 'fa');
    const shortStop = visit('tmp-2', 'Nynäsvägen', '2026-05-03T09:05:00Z', '2026-05-03T09:12:00Z', 59.31, 18.08);
    const westers = visit('w', 'Westers Catering', '2026-05-03T09:30:00Z', '2026-05-03T14:00:00Z', 59.32, 18.07, 'w');

    const rows = buildActualDayRows(
      [fa, shortStop, westers],
      [travel('t1', fa, shortStop), travel('t2', shortStop, westers)],
      ['FA Warehouse', 'Nynäsvägen', 'Westers Catering'],
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'visit', label: 'FA Warehouse' });
    expect(rows[1]).toMatchObject({ kind: 'travel', label: 'Resa: FA Warehouse → Westers Catering' });
    expect(rows[2]).toMatchObject({ kind: 'visit', label: 'Westers Catering' });
  });
});