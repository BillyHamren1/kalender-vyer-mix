// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildStaffDayEventTimeline, hasPreWorkdayActivity } from '../dayEventTimeline';

const D = '2026-05-04';
const iso = (h: string) => `${D}T${h}:00.000Z`;

const baseInput = {
  dayStartIso: `${D}T00:00:00.000Z`,
  dayEndIso: `${D}T23:59:59.000Z`,
  workdays: [],
  ltes: [],
  timeReports: [],
  travel: [],
  assistantEvents: [],
  flags: [],
  pings: [],
};

describe('buildStaffDayEventTimeline', () => {
  it('returns empty when no signals', () => {
    expect(buildStaffDayEventTimeline(baseInput)).toEqual([]);
  });

  it('renders workday + LTE location-only as journal events with timer status', () => {
    const events = buildStaffDayEventTimeline({
      ...baseInput,
      workdays: [{ id: 'wd1', started_at: iso('13:30'), ended_at: iso('21:07') }],
      ltes: [{
        id: 'lte1',
        entered_at: iso('13:30'),
        exited_at: iso('21:00'),
        label: 'FA Warehouse',
        source: 'manual',
        isPresenceOnly: false,
      }],
    });
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain('workday_start');
    expect(kinds).toContain('workday_end');
    expect(kinds).toContain('lte_start');
    expect(kinds).toContain('lte_end');
    const lteStart = events.find(e => e.kind === 'lte_start')!;
    expect(lteStart.source).toBe('timer');
    expect(lteStart.status).toBe('confirmed');
  });

  it('flags GPS stays before workday start as pre_workday_activity', () => {
    // 12 pings on the same spot from 06:00 to 06:30
    const pings = Array.from({ length: 12 }, (_, i) => ({
      lat: 59.5,
      lng: 17.9,
      recorded_at: `${D}T06:${String(i * 3).padStart(2, '0')}:00.000Z`,
    }));
    const events = buildStaffDayEventTimeline({
      ...baseInput,
      workdays: [{ id: 'wd1', started_at: iso('13:30'), ended_at: null }],
      pings,
    });
    expect(hasPreWorkdayActivity(events)).toBe(true);
    const pre = events.find(e => e.kind === 'pre_workday_activity')!;
    expect(pre.severity).toBe('warning');
  });

  it('clusters pings into stay + movement + gap events (not raw pings)', () => {
    const ptsHome = Array.from({ length: 8 }, (_, i) => ({
      lat: 59.5, lng: 17.9,
      recorded_at: `${D}T08:${String(i * 3).padStart(2, '0')}:00.000Z`,
    }));
    const ptsAway = Array.from({ length: 8 }, (_, i) => ({
      lat: 59.6, lng: 18.0,
      recorded_at: `${D}T10:${String(i * 3).padStart(2, '0')}:00.000Z`,
    }));
    const events = buildStaffDayEventTimeline({
      ...baseInput,
      workdays: [{ id: 'wd1', started_at: iso('07:00'), ended_at: iso('18:00') }],
      pings: [...ptsHome, ...ptsAway],
    });
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain('gps_arrived');
    expect(kinds).toContain('gps_left');
    expect(kinds.some(k => k === 'gps_movement' || k === 'gps_gap')).toBe(true);
    // No raw ping events leak
    expect(events.every(e => !e.id.startsWith('ping:'))).toBe(true);
  });

  it('orders all events chronologically and mixes sources', () => {
    const events = buildStaffDayEventTimeline({
      ...baseInput,
      workdays: [{ id: 'wd', started_at: iso('07:00'), ended_at: iso('18:00') }],
      timeReports: [{ id: 'tr1', start_iso: iso('08:00'), end_iso: iso('12:00'), label: 'Job A', approved: true }],
      travel: [{ id: 'tv1', start_iso: iso('12:00'), end_iso: iso('13:00'), fromAddress: 'A', toAddress: 'B', approved: false, autoDetected: true, sourceTag: 'gap_derived' }],
      assistantEvents: [{ id: 'ae1', event_type: 'arrival', happened_at: iso('07:50'), target_label: 'Job A' }],
      flags: [{ id: 'f1', flag_type: 'missing_break', severity: 'warning', title: 'Saknar rast', description: null, created_at: iso('14:00') }],
    });
    const times = events.map(e => new Date(e.at).getTime());
    expect(times.every((t, i) => i === 0 || t >= times[i - 1])).toBe(true);
    const sources = new Set(events.map(e => e.source));
    expect(sources.has('workday')).toBe(true);
    expect(sources.has('admin')).toBe(true);
    expect(sources.has('travel')).toBe(true);
    expect(sources.has('assistant')).toBe(true);
    expect(sources.has('flag')).toBe(true);
  });

  it('marks unapproved travel as suggested', () => {
    const events = buildStaffDayEventTimeline({
      ...baseInput,
      travel: [{ id: 't', start_iso: iso('10:00'), end_iso: iso('10:30'), fromAddress: 'A', toAddress: 'B', approved: false }],
    });
    const tv = events.find(e => e.kind === 'travel_start')!;
    expect(tv.status).toBe('suggested');
  });
});
