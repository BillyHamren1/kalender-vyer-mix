/**
 * Billy 2026-05-04 — full-day regression.
 *
 * Scenario:
 *   06:00  GPS arrival vid Lager (FA Warehouse)
 *   06:05  GPS departure från Lager
 *   13:30  Workday startar
 *   21:07  Workday slutar
 *   (ingen time_report täcker 13:30–21:07 → ofördelad tid)
 *
 * Förväntat:
 *   1. "Dagens faktiska händelser" innehåller GPS arrival + visit + departure
 *      kring 06:00–06:05 OCH workday_started/ended.
 *   2. "Nuvarande rapport" exponerar workday + tom fördelning + ofördelad tid
 *      lika med hela workday-spannet.
 *   3. "Föreslagna korrigeringar" innehåller en pre-workday-anomaly med
 *      tidsförslag baserat på 06:00.
 *
 * Regel: GPS-händelser får ALDRIG döljas bara för att de saknar matchande
 * time_report. Rapporten är en tolkning av dagen, inte hela sanningen.
 */
import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel } from '../actualStaffDayModel';
import type { PlaceVisit } from '../pingPlaceSegments';

const lagerVisit: PlaceVisit = {
  placeKey: 'site:lager',
  knownSite: { id: 'lager', name: 'FA Warehouse' },
  centre: { lat: 59.5, lng: 17.85 },
  start: '2026-05-04T06:00:00Z',
  end: '2026-05-04T06:05:00Z',
  durationMin: 5,
  pingCount: 4,
  pings: [],
};

describe('Billy 2026-05-04 — full-day regression', () => {
  const model = buildActualStaffDayModel({
    date: '2026-05-04',
    workday: {
      id: 'wd-billy',
      started_at: '2026-05-04T13:30:00Z',
      ended_at: '2026-05-04T21:07:00Z',
    },
    timeReports: [],         // ingen fördelning gjord
    locationEntries: [],
    travelLogs: [],
    assistantEvents: [],
    flags: [],
    visits: [lagerVisit],
    travels: [],
    pings: [],
    latestPing: { recorded_at: '2026-05-04T21:07:00Z' },
    now: new Date('2026-05-04T22:00:00Z'),
  });

  it('A. visar Lager-arrival 06:00 i händelsejournalen', () => {
    const arrival = model.actualEvents.find(
      e => e.kind === 'gps_arrival' && e.place === 'FA Warehouse',
    );
    expect(arrival).toBeDefined();
    expect(arrival!.at).toBe('2026-05-04T06:00:00Z');
  });

  it('A. visar Lager-departure 06:05 i händelsejournalen', () => {
    const departure = model.actualEvents.find(
      e => e.kind === 'gps_departure' && e.place === 'FA Warehouse',
    );
    expect(departure).toBeDefined();
    expect(departure!.at).toBe('2026-05-04T06:05:00Z');
  });

  it('A. visar workday_started 13:30 och workday_ended 21:07', () => {
    const start = model.actualEvents.find(e => e.kind === 'workday_started');
    const end = model.actualEvents.find(e => e.kind === 'workday_ended');
    expect(start?.at).toBe('2026-05-04T13:30:00Z');
    expect(end?.at).toBe('2026-05-04T21:07:00Z');
  });

  it('A. GPS-händelser är kronologiskt FÖRE workday-händelser', () => {
    const ts = model.actualEvents.map(e => +new Date(e.at));
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    const firstGps = model.actualEvents.findIndex(e => e.kind === 'gps_arrival');
    const wdStart = model.actualEvents.findIndex(e => e.kind === 'workday_started');
    expect(firstGps).toBeGreaterThanOrEqual(0);
    expect(firstGps).toBeLessThan(wdStart);
  });

  it('B. reportState bevarar Billys workday 13:30–21:07', () => {
    expect(model.reportState.workday?.started_at).toBe('2026-05-04T13:30:00Z');
    expect(model.reportState.workday?.ended_at).toBe('2026-05-04T21:07:00Z');
  });

  it('B. ingen fördelning → distributedMinutes = 0', () => {
    expect(model.proposedReport.distributedMinutes).toBe(0);
  });

  it('B. ofördelad tid täcker hela workday-spannet (≈ 7h37m)', () => {
    // 13:30 → 21:07 = 7h37m = 457 min
    expect(model.proposedReport.undistributedMinutes).toBe(457);
  });

  it('C. föreslagna korrigeringar innehåller pre-workday-anomaly med 06:00', () => {
    const pre = model.proposedReport.anomalies.find(a => a.id.startsWith('pre-wd'));
    expect(pre).toBeDefined();
    expect(pre!.detail).toContain('FA Warehouse');
    expect(pre!.suggestion).toContain('06:00');
    expect(model.proposedReport.proposedWorkdayStart).toBe('2026-05-04T06:00:00Z');
  });

  it('REGEL: GPS-besöket på Lager döljs ALDRIG bara för att rapporten saknar matchande rad', () => {
    // Inga time_reports / LTE finns — men Lager-besöket MÅSTE ändå exponeras
    // både som vistelse och som arrival/departure i actualEvents.
    expect(model.reportState.timeReports).toHaveLength(0);
    expect(model.reportState.locationEntries).toHaveLength(0);
    expect(model.actualVisits.find(v => v.label === 'FA Warehouse')).toBeDefined();
    expect(
      model.actualEvents.filter(e => e.place === 'FA Warehouse').length,
    ).toBeGreaterThanOrEqual(3); // arrival + visit + departure
  });
});
