import { describe, it, expect } from 'vitest';
import {
  buildProjectDailyStaffTimeOverview,
} from '../projectDailyStaffTimeOverview';

describe('projectDailyStaffTimeOverview — approved/unapproved split', () => {
  const day = '2026-06-02';
  const names = { 's-a': 'Anna', 's-b': 'Bo' };

  it('default approvalState=approved → räknas som attesterad (bakåtkomp)', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-a', source: 'bsa' }],
      submissions: [{ date: day, staff_id: 's-a', status: 'approved', submitted_at: null }],
      approvedRows: [{ date: day, staff_id: 's-a', minutes: 480, cost: 4800 }],
      staffNames: names,
    });
    const r = out[0].rows[0];
    expect(r.approvedMinutes).toBe(480);
    expect(r.unapprovedMinutes).toBe(0);
    expect(r.totalMinutes).toBe(480);
    expect(r.approvalState).toBe('approved');
    expect(out[0].totals.totalMinutes).toBe(480);
    expect(out[0].totals.hasUnapproved).toBe(false);
  });

  it('approvalState=unapproved bidrar bara till oattesterad-bucket', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-a', source: 'bsa' }],
      submissions: [{ date: day, staff_id: 's-a', status: 'submitted', submitted_at: null }],
      approvedRows: [
        { date: day, staff_id: 's-a', minutes: 420, cost: 4200, approvalState: 'unapproved' },
      ],
      staffNames: names,
    });
    const r = out[0].rows[0];
    expect(r.approvedMinutes).toBe(0);
    expect(r.unapprovedMinutes).toBe(420);
    expect(r.totalMinutes).toBe(420);
    expect(r.totalCost).toBe(4200);
    expect(r.approvalState).toBe('unapproved');
    expect(out[0].totals.totalMinutes).toBe(420);
    expect(out[0].totals.unapprovedMinutes).toBe(420);
    expect(out[0].totals.approvedMinutes).toBe(0);
    expect(out[0].totals.hasUnapproved).toBe(true);
  });

  it('mixar approved + unapproved på samma (dag, person)', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-a', source: 'bsa' }],
      submissions: [{ date: day, staff_id: 's-a', status: 'approved', submitted_at: null }],
      approvedRows: [
        { date: day, staff_id: 's-a', minutes: 300, cost: 3000, approvalState: 'approved' },
        { date: day, staff_id: 's-a', minutes: 120, cost: 1200, approvalState: 'unapproved' },
      ],
      staffNames: names,
    });
    const r = out[0].rows[0];
    expect(r.approvedMinutes).toBe(300);
    expect(r.unapprovedMinutes).toBe(120);
    expect(r.totalMinutes).toBe(420);
    expect(r.totalCost).toBe(4200);
    // Mixed → markeras som oattesterad i UI (det räcker med en oattesterad bit)
    expect(r.approvalState).toBe('unapproved');
    expect(out[0].totals.hasUnapproved).toBe(true);
  });

  it('staffCount räknar bara personer med registrerad tid', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [
        { date: day, staff_id: 's-a', source: 'bsa' },
        { date: day, staff_id: 's-b', source: 'bsa' },
      ],
      submissions: [
        { date: day, staff_id: 's-a', status: 'submitted', submitted_at: null },
      ],
      approvedRows: [
        { date: day, staff_id: 's-a', minutes: 480, cost: 4800, approvalState: 'unapproved' },
      ],
      staffNames: names,
    });
    expect(out[0].totals.staffCount).toBe(1); // bara Anna har rapporterat
    expect(out[0].totals.missing).toBe(1); // Bo saknas
  });

  it('hourlyRate och tider propageras till radens fält', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-a', source: 'bsa' }],
      submissions: [{ date: day, staff_id: 's-a', status: 'submitted', submitted_at: null }],
      approvedRows: [
        {
          date: day,
          staff_id: 's-a',
          minutes: 480,
          cost: 4800,
          approvalState: 'unapproved',
          hourlyRate: 600,
          rateSource: 'staff_members',
          startAt: '2026-06-02T06:00:00Z',
          endAt: '2026-06-02T14:00:00Z',
          submissionStatus: 'submitted',
        },
      ],
      staffNames: names,
    });
    const r = out[0].rows[0];
    expect(r.hourlyRate).toBe(600);
    expect(r.rateSource).toBe('staff_members');
    expect(r.startAt).toBe('2026-06-02T06:00:00Z');
    expect(r.endAt).toBe('2026-06-02T14:00:00Z');
    expect(r.submissionStatus).toBe('submitted');
  });
});
