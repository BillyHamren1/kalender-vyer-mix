import { describe, it, expect } from 'vitest';
import { buildCanonicalStaffDayModel } from '../canonicalDayModel';

const NOW = new Date('2026-05-04T22:00:00Z');

describe('buildCanonicalStaffDayModel', () => {
  it('workday 09–21 utan time_reports → 12h payable, 12h ofördelad', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T21:00:00+02:00' }],
      distributionRows: [],
      now: NOW,
    });
    expect(m.workdayMinutes).toBe(12 * 60);
    expect(m.payableMinutes).toBe(12 * 60);
    expect(m.distributedMinutes).toBe(0);
    expect(m.undistributedMinutes).toBe(12 * 60);
    expect(m.overDistributedMinutes).toBe(0);
    expect(m.status).toBe('requires_distribution');
    // Oallokerad tid blockerar inte attest — info, inte review_required.
    expect(m.reviewRequired).toBe(false);
    const undist = m.anomalies.find(a => a.kind === 'large_undistributed');
    expect(undist).toBeTruthy();
    expect(undist!.severity).toBe('info');
  });

  it('workday 09–21 med 30 min rast → payable = 11.5h', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T21:00:00+02:00' }],
      distributionRows: [
        {
          id: 'tr1', start: '2026-05-04T09:00:00+02:00', end: '2026-05-04T21:00:00+02:00',
          hours: 11.5, breakHours: 0.5, label: 'Projekt A', category: 'project',
        },
      ],
      now: NOW,
    });
    expect(m.payableMinutes).toBe(11.5 * 60);
    expect(m.distributedMinutes).toBe(11.5 * 60);
    expect(m.undistributedMinutes).toBe(0);
    expect(m.status).toBe('ok');
  });

  it('time_reports utan workday → no_workday + warning', () => {
    const m = buildCanonicalStaffDayModel({
      distributionRows: [{
        id: 'tr1', start: '2026-05-04T09:00:00+02:00', end: '2026-05-04T17:00:00+02:00',
        hours: 8, label: 'Projekt A', category: 'project',
      }],
      now: NOW,
    });
    expect(m.workdayMinutes).toBe(0);
    expect(m.payableMinutes).toBe(0);
    expect(m.status).toBe('no_workday');
    expect(m.anomalies.some(a => a.kind === 'workday_missing_but_reports_exist')).toBe(true);
  });

  it('över-rapportering: 8h workday men 10h time_reports', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T17:00:00+02:00' }],
      distributionRows: [{
        id: 'tr1', start: null, end: null, hours: 10, label: 'A', category: 'project',
      }],
      now: NOW,
    });
    expect(m.payableMinutes).toBe(8 * 60);
    expect(m.distributedMinutes).toBe(8 * 60); // capped at payable
    expect(m.overDistributedMinutes).toBe(2 * 60);
    expect(m.status).toBe('over_reported');
  });

  it('travel: approved=false påverkar inte payable och inte distributed', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T17:00:00+02:00' }],
      distributionRows: [],
      travelSuggestions: [
        { id: 'tv1', start: null, end: null, hours: 1, fromAddress: 'A', toAddress: 'B', autoDetected: true, sourceTag: 'gap_derived' },
      ],
      now: NOW,
    });
    expect(m.payableMinutes).toBe(8 * 60);
    expect(m.distributedMinutes).toBe(0);
    expect(m.suggestedTravelMinutes).toBe(60);
    expect(m.approvedTravelMinutes).toBe(0);
  });

  it('travel: approved=true + destination räknas som fördelad, ökar inte payable', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T17:00:00+02:00' }],
      distributionRows: [
        { id: 'tr1', start: null, end: null, hours: 7, label: 'A', category: 'project' },
      ],
      travelSuggestions: [
        { id: 'tv1', start: null, end: null, hours: 0.5, fromAddress: 'A', toAddress: 'B', approved: true, destinationBookingId: 'b1' },
      ],
      now: NOW,
    });
    expect(m.payableMinutes).toBe(8 * 60);
    expect(m.distributedMinutes).toBe(7.5 * 60);
    expect(m.undistributedMinutes).toBe(30);
    expect(m.approvedTravelMinutes).toBe(30);
  });

  it('travel: approved kapas så fördelad aldrig överstiger payable', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T17:00:00+02:00' }],
      distributionRows: [
        { id: 'tr1', start: null, end: null, hours: 8, label: 'A', category: 'project' },
      ],
      travelSuggestions: [
        { id: 'tv1', start: null, end: null, hours: 1, fromAddress: 'A', toAddress: 'B', approved: true, destinationBookingId: 'b1' },
      ],
      now: NOW,
    });
    expect(m.payableMinutes).toBe(8 * 60);
    expect(m.distributedMinutes).toBe(8 * 60); // capped
    expect(m.overDistributedMinutes).toBe(60);
  });

  it('travel: missing destination → review_required och räknas inte som fördelad', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T17:00:00+02:00' }],
      distributionRows: [],
      travelSuggestions: [
        { id: 'tv1', start: null, end: null, hours: 1, fromAddress: 'A', toAddress: null, approved: true, destinationBookingId: null },
      ],
      now: NOW,
    });
    expect(m.distributedMinutes).toBe(0);
    expect(m.approvedTravelMinutes).toBe(0);
    expect(m.travelSuggestions[0].reviewRequired).toBe(true);
    expect(m.travelSuggestions[0].reviewReason).toBe('missing_destination');
    expect(m.anomalies.some(a => a.kind === 'travel_missing_destination')).toBe(true);
  });

  it('subdivisions räknas inte', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T17:00:00+02:00' }],
      distributionRows: [
        { id: 'tr1', start: null, end: null, hours: 8, label: 'Projekt', category: 'project' },
        { id: 'sub1', start: null, end: null, hours: 4, label: 'sub', category: 'project', isSubdivision: true },
      ],
      now: NOW,
    });
    expect(m.distributedMinutes).toBe(8 * 60);
  });

  it('öppen workday >18h → workday_open_stale anomaly', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T00:00:00Z', ended_at: null }],
      distributionRows: [],
      now: new Date('2026-05-04T20:00:00Z'),
    });
    expect(m.isWorkdayOpen).toBe(true);
    expect(m.status).toBe('open');
    expect(m.anomalies.some(a => a.kind === 'workday_open_stale')).toBe(true);
  });
});

import { describe as d2, it as i2, expect as e2 } from 'vitest';
import { buildCanonicalStaffDayModel as build2 } from '../canonicalDayModel';

d2('canonical — workday utan time_reports', () => {
  i2('09:00–21:00 utan reports → payable=720, undistributed=720, requires_distribution', () => {
    const m = build2({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T21:00:00+02:00' }],
      distributionRows: [],
      now: new Date('2026-05-04T22:00:00+02:00'),
    });
    e2(m.workdayMinutes).toBe(720);
    e2(m.payableMinutes).toBe(720);
    e2(m.distributedMinutes).toBe(0);
    e2(m.undistributedMinutes).toBe(720);
    e2(m.status).toBe('requires_distribution');
    e2(m.reviewRequired).toBe(true);
    e2(m.anomalies.some(a => a.kind === 'large_undistributed')).toBe(true);
  });

  i2('öppen timer + GPS-ping >10 min → signalLost + open_timer_signal_lost anomaly', () => {
    const NOW = new Date('2026-05-04T12:00:00Z');
    const m = build2({
      workdays: [{ started_at: '2026-05-04T08:00:00Z', ended_at: null }],
      distributionRows: [],
      activeTimers: [{ id: 't1', startedAt: '2026-05-04T11:00:00Z', label: 'Lager', source: 'location_entry' }],
      latestPing: { updatedAt: '2026-05-04T11:30:00Z' }, // 30 min ago
      now: NOW,
    });
    e2(m.activeTimerRows[0].signalLost).toBe(true);
    e2(m.activeTimerRows[0].lastPingAgeMin).toBe(30);
    e2(m.hasSignalLost).toBe(true);
    e2(m.anomalies.some(a => a.kind === 'open_timer_signal_lost')).toBe(true);
  });

  i2('auto_detected travel räknas som suggested, inte payable', () => {
    const m = build2({
      workdays: [{ started_at: '2026-05-04T08:00:00Z', ended_at: '2026-05-04T16:00:00Z' }],
      distributionRows: [{ id: 'r1', start: null, end: null, hours: 8, label: 'P', category: 'project' }],
      travelSuggestions: [
        { id: 'tv1', start: null, end: null, hours: 0.5, fromAddress: 'A', toAddress: 'B', autoDetected: true, sourceTag: 'gap_derived' },
      ],
      now: new Date('2026-05-04T17:00:00Z'),
    });
    e2(m.suggestedTravelMinutes).toBe(30);
    e2(m.approvedTravelMinutes).toBe(0);
    e2(m.payableMinutes).toBe(480);
    e2(m.distributedMinutes).toBe(480);
  });
});
