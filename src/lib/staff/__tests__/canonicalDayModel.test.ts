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
    expect(m.reviewRequired).toBe(true);
    expect(m.anomalies.find(a => a.kind === 'large_undistributed')).toBeTruthy();
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
    expect(m.distributedMinutes).toBe(10 * 60);
    expect(m.overDistributedMinutes).toBe(2 * 60);
    expect(m.status).toBe('over_reported');
  });

  it('travel_time_logs räknas inte i distributed förrän approved', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: '2026-05-04T09:00:00+02:00', ended_at: '2026-05-04T17:00:00+02:00' }],
      distributionRows: [],
      travelSuggestions: [
        { id: 'tv1', start: null, end: null, hours: 1, fromAddress: 'A', toAddress: 'B' },
        { id: 'tv2', start: null, end: null, hours: 0.5, fromAddress: 'B', toAddress: 'C', approved: true },
      ],
      now: NOW,
    });
    expect(m.distributedMinutes).toBe(0);
    expect(m.suggestedTravelMinutes).toBe(60);
    expect(m.approvedTravelMinutes).toBe(30);
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
