import { describe, it, expect } from 'vitest';
import {
  buildProjectDailyStaffTimeOverview,
  statusLabel,
} from '../projectDailyStaffTimeOverview';

describe('buildProjectDailyStaffTimeOverview — status rules', () => {
  const day = '2026-05-26';
  const staffNames = { 's-anna': 'Anna', 's-bo': 'Bo', 's-cia': 'Cia', 's-dan': 'Dan' };

  it('assigned + no submission → missing', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-anna', source: 'bsa' }],
      submissions: [],
      approvedRows: [],
      staffNames,
    });
    expect(out).toHaveLength(1);
    expect(out[0].rows).toHaveLength(1);
    expect(out[0].rows[0].status).toBe('missing');
    expect(out[0].totals.missing).toBe(1);
  });

  it('assigned + submitted (no cost line) → submitted', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-bo', source: 'bsa' }],
      submissions: [{ date: day, staff_id: 's-bo', status: 'submitted', submitted_at: null }],
      approvedRows: [],
      staffNames,
    });
    expect(out[0].rows[0].status).toBe('submitted');
    expect(out[0].totals.submitted).toBe(1);
  });

  it('assigned + approved cost line → approved', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-cia', source: 'bsa' }],
      submissions: [{ date: day, staff_id: 's-cia', status: 'approved', submitted_at: null }],
      approvedRows: [{ date: day, staff_id: 's-cia', minutes: 360, cost: 3600 }],
      staffNames,
    });
    expect(out[0].rows[0].status).toBe('approved');
    expect(out[0].rows[0].approvedMinutes).toBe(360);
    expect(out[0].rows[0].approvedCost).toBe(3600);
    expect(out[0].totals.approved).toBe(1);
    expect(out[0].totals.approvedMinutes).toBe(360);
  });

  it('NOT assigned + approved cost line → extra_approved', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [],
      submissions: [{ date: day, staff_id: 's-dan', status: 'approved', submitted_at: null }],
      approvedRows: [{ date: day, staff_id: 's-dan', minutes: 60, cost: 600 }],
      staffNames,
    });
    expect(out[0].rows[0].status).toBe('extra_approved');
    expect(out[0].rows[0].assigned).toBe(false);
    expect(out[0].totals.extra).toBe(1);
    expect(out[0].totals.assigned).toBe(0);
  });

  it('approved cost line wins over submitted-only state', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-anna', source: 'bsa' }],
      submissions: [{ date: day, staff_id: 's-anna', status: 'payroll_approved', submitted_at: null }],
      approvedRows: [{ date: day, staff_id: 's-anna', minutes: 480, cost: 4800 }],
      staffNames,
    });
    expect(out[0].rows[0].status).toBe('approved');
  });

  it('multiple approved rows for same (date,staff) summeras', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-anna', source: 'bsa' }],
      submissions: [],
      approvedRows: [
        { date: day, staff_id: 's-anna', minutes: 120, cost: 1200 },
        { date: day, staff_id: 's-anna', minutes: 180, cost: 1800 },
      ],
      staffNames,
    });
    expect(out[0].rows[0].approvedMinutes).toBe(300);
    expect(out[0].rows[0].approvedCost).toBe(3000);
    expect(out[0].rows[0].status).toBe('approved');
  });

  it('draft submission räknas inte som inskickad', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [{ date: day, staff_id: 's-bo', source: 'bsa' }],
      submissions: [{ date: day, staff_id: 's-bo', status: 'draft', submitted_at: null }],
      approvedRows: [],
      staffNames,
    });
    expect(out[0].rows[0].status).toBe('missing');
    expect(out[0].rows[0].hasSubmission).toBe(false);
  });

  it('flera dagar sorteras ASC och rader sorteras på namn', () => {
    const out = buildProjectDailyStaffTimeOverview({
      assignedDays: [
        { date: '2026-05-27', staff_id: 's-anna', source: 'bsa' },
        { date: '2026-05-26', staff_id: 's-cia', source: 'bsa' },
        { date: '2026-05-26', staff_id: 's-bo', source: 'bsa' },
      ],
      submissions: [],
      approvedRows: [],
      staffNames,
    });
    expect(out.map((d) => d.date)).toEqual(['2026-05-26', '2026-05-27']);
    expect(out[0].rows.map((r) => r.staff_name)).toEqual(['Bo', 'Cia']);
  });

  it('statusLabel ger svenska etiketter', () => {
    expect(statusLabel('approved')).toBe('Godkänd');
    expect(statusLabel('submitted')).toBe('Inskickad');
    expect(statusLabel('missing')).toBe('Saknas');
    expect(statusLabel('extra_approved')).toBe('Extra rapporterad');
    expect(statusLabel('extra_submitted')).toBe('Extra (inskickad)');
  });
});
