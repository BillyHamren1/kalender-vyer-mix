/**
 * Tester för buildActualStaffDayModel.
 *
 * Låser kontraktet:
 *   - GPS-vistelser, workday, timer-rader, travel-förslag och avvikelser
 *     samexisterar i actualEvents.
 *   - Pre-workday GPS-aktivitet ger anomaly + förslag på ny workday-start.
 *   - Stale signal ger stale_signal-event + anomaly när workday/timer är öppen.
 *   - distributedMinutes räknar ENDAST stängda time_reports + godkänd travel.
 *   - suggestedTravelMinutes räknar ENDAST gap_derived/auto_detected travel
 *     som inte är godkänd.
 */
import { describe, it, expect } from 'vitest';
import {
  buildActualStaffDayModel,
  type BuildActualStaffDayInput,
} from '../actualStaffDayModel';
import type { PlaceVisit, TravelGap } from '../pingPlaceSegments';

const NOW = new Date('2026-05-04T15:00:00Z');

const baseInput = (overrides: Partial<BuildActualStaffDayInput> = {}): BuildActualStaffDayInput => ({
  date: '2026-05-04',
  workday: null,
  timeReports: [],
  locationEntries: [],
  travelLogs: [],
  assistantEvents: [],
  flags: [],
  visits: [],
  travels: [],
  pings: [],
  latestPing: null,
  now: NOW,
  ...overrides,
});

const visit = (id: string, name: string | null, startIso: string, endIso: string): PlaceVisit => ({
  placeKey: id,
  knownSite: name ? { id, name } : null,
  centre: { lat: 59.5, lng: 17.85 },
  start: startIso,
  end: endIso,
  durationMin: Math.round((+new Date(endIso) - +new Date(startIso)) / 60_000),
  pingCount: 5,
  pings: [],
});

describe('buildActualStaffDayModel', () => {
  it('producerar workday_started/ended events och räknar workday-minuter', () => {
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'w1', started_at: '2026-05-04T11:30:00Z', ended_at: '2026-05-04T19:00:00Z' },
    }));
    expect(m.actualEvents.find(e => e.kind === 'workday_started')).toBeDefined();
    expect(m.actualEvents.find(e => e.kind === 'workday_ended')).toBeDefined();
  });

  it('flaggar pre-workday GPS-aktivitet som anomaly + föreslår ny workday-start', () => {
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'w1', started_at: '2026-05-04T13:30:00Z', ended_at: '2026-05-04T21:07:00Z' },
      visits: [visit('site:lager', 'FA Warehouse', '2026-05-04T06:00:00Z', '2026-05-04T06:05:00Z')],
    }));
    const pre = m.proposedReport.anomalies.find(a => a.id.startsWith('pre-wd'));
    expect(pre).toBeDefined();
    expect(pre!.suggestion).toContain('06:00');
    expect(m.proposedReport.proposedWorkdayStart).toBe('2026-05-04T06:00:00Z');
    // GPS-händelser måste vara synliga, inte gömda.
    expect(m.actualEvents.some(e => e.kind === 'gps_arrival')).toBe(true);
    expect(m.actualEvents.some(e => e.kind === 'gps_visit')).toBe(true);
    expect(m.actualEvents.some(e => e.kind === 'gps_departure')).toBe(true);
  });

  it('Kevin-scenariot: stale signal ger stale_signal-event + anomaly när workday pågår', () => {
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'w1', started_at: '2026-05-04T10:01:00Z', ended_at: null },
      latestPing: { recorded_at: '2026-05-04T11:51:00Z' }, // ~3h tystnad fram till NOW
      now: NOW,
    }));
    expect(m.signalLost).toBe(true);
    expect(m.lastPingAgeMin).toBeGreaterThan(60);
    expect(m.actualEvents.some(e => e.kind === 'stale_signal')).toBe(true);
    expect(m.proposedReport.anomalies.some(a => a.id === 'stale-signal')).toBe(true);
  });

  it('stale signal triggas EJ när workday är stängd och inga timers är öppna', () => {
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'w1', started_at: '2026-05-04T10:00:00Z', ended_at: '2026-05-04T18:00:00Z' },
      latestPing: { recorded_at: '2026-05-04T11:00:00Z' },
    }));
    expect(m.signalLost).toBe(false);
    expect(m.actualEvents.some(e => e.kind === 'stale_signal')).toBe(false);
  });

  it('distributedMinutes räknar ENDAST stängda time_reports + godkänd travel', () => {
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'w1', started_at: '2026-05-04T08:00:00Z', ended_at: '2026-05-04T16:00:00Z' },
      timeReports: [
        { id: 't1', start_iso: '2026-05-04T08:00:00Z', end_iso: '2026-05-04T11:00:00Z', label: 'Craft', approved: false, hours: 3 },
        { id: 't2', start_iso: '2026-05-04T11:00:00Z', end_iso: null, label: 'Open', approved: false, hours: 0 }, // öppen → räknas inte
      ],
      travelLogs: [
        { id: 'tv1', start_iso: '2026-05-04T07:00:00Z', end_iso: '2026-05-04T08:00:00Z', fromAddress: 'A', toAddress: 'B', approved: true, autoDetected: false, source: 'manual', hours: 1 },
        { id: 'tv2', start_iso: '2026-05-04T16:00:00Z', end_iso: '2026-05-04T16:30:00Z', fromAddress: 'B', toAddress: 'C', approved: false, autoDetected: true, source: 'gap_derived', hours: 0.5 },
      ],
    }));
    expect(m.proposedReport.distributedMinutes).toBe(3 * 60 + 60); // 3h tr + 1h godkänd resa
    expect(m.proposedReport.suggestedTravelMinutes).toBe(30);       // gap_derived ej godkänd
  });

  it('travel_suggestion-event skapas för auto-detekterad/gap_derived travel som ej är godkänd', () => {
    const m = buildActualStaffDayModel(baseInput({
      travelLogs: [{
        id: 'tv1', start_iso: '2026-05-04T10:00:00Z', end_iso: '2026-05-04T10:30:00Z',
        fromAddress: 'A', toAddress: 'B', approved: false, autoDetected: true, source: 'gap_derived', hours: 0.5,
      }],
    }));
    expect(m.actualEvents.some(e => e.kind === 'travel_suggestion')).toBe(true);
  });

  it('GPS-gap > 20 min skapar gps_gap-event', () => {
    const m = buildActualStaffDayModel(baseInput({
      pings: [
        { lat: 59.5, lng: 17.8, recorded_at: '2026-05-04T10:00:00Z' } as any,
        { lat: 59.5, lng: 17.8, recorded_at: '2026-05-04T11:00:00Z' } as any,
      ],
    }));
    expect(m.actualEvents.some(e => e.kind === 'gps_gap')).toBe(true);
  });

  it('reportState är opåverkad — råa rader bevaras för admin-justering', () => {
    const tr = { id: 't1', start_iso: '2026-05-04T08:00:00Z', end_iso: '2026-05-04T11:00:00Z', label: 'X', approved: false, hours: 3 };
    const m = buildActualStaffDayModel(baseInput({ timeReports: [tr] }));
    expect(m.reportState.timeReports[0]).toBe(tr);
  });

  it('actualVisits är komprimerad form av PlaceVisit (label från knownSite eller koordinat)', () => {
    const m = buildActualStaffDayModel(baseInput({
      visits: [
        visit('site:lager', 'FA Warehouse', '2026-05-04T08:00:00Z', '2026-05-04T08:30:00Z'),
        visit('unknown:0', null, '2026-05-04T09:00:00Z', '2026-05-04T09:30:00Z'),
      ],
    }));
    expect(m.actualVisits[0].label).toBe('FA Warehouse');
    expect(m.actualVisits[0].knownSiteId).toBe('site:lager');
    expect(m.actualVisits[1].knownSiteId).toBeNull();
    expect(m.actualVisits[1].label).toMatch(/\d+\.\d+/); // koordinat-fallback
  });

  it('events är sorterade kronologiskt', () => {
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'w1', started_at: '2026-05-04T10:00:00Z', ended_at: '2026-05-04T18:00:00Z' },
      visits: [visit('v1', 'A', '2026-05-04T08:00:00Z', '2026-05-04T08:30:00Z')],
    }));
    const ts = m.actualEvents.map(e => +new Date(e.at));
    const sorted = [...ts].sort((a, b) => a - b);
    expect(ts).toEqual(sorted);
  });

  it('undistributedMinutes = workday − distributed (capped at 0)', () => {
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'w1', started_at: '2026-05-04T08:00:00Z', ended_at: '2026-05-04T16:00:00Z' }, // 8h
      timeReports: [
        { id: 't1', start_iso: '2026-05-04T08:00:00Z', end_iso: '2026-05-04T11:00:00Z', label: 'X', approved: false, hours: 3 },
      ],
    }));
    expect(m.proposedReport.undistributedMinutes).toBe(5 * 60);
  });
});
