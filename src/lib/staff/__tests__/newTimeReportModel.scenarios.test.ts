/**
 * Nya tidrapportmodellen — scenariotester
 * ─────────────────────────────────────────────────────────────────────
 *
 * Modell:
 *   - workday = total arbetstid / lönegrundande tid
 *   - time_reports = fördelning på projekt/plats inom workday
 *   - oallokerad tid = del av workday som inte är fördelad — INFO, ej blocker
 *
 * Detta testar BÅDE:
 *   - canonicalDayModel (staff-vyn: payable / distributed / undistributed)
 *   - adminTimeReviewEngine (admin-vyn: anomalies + canApprove gate)
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildCanonicalStaffDayModel } from '../canonicalDayModel';
import {
  evaluateAdminTimeReview,
  evaluateDayApprovability,
  type AdminTimeReviewInput,
} from '@/lib/admin/adminTimeReviewEngine';

const DAY = '2026-05-06';
const iso = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;
const wd = (start: string, end: string | null) => ({
  started_at: iso(start),
  ended_at: end ? iso(end) : null,
});

describe('Nya tidrapportmodellen — workday som dagens sanning', () => {
  it('1. Workday 08–16, projekttid 4h: payable=8h, distributed=4h, unallocated=4h, kan godkännas', () => {
    // ── canonicalDayModel ──
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: iso('08:00'), ended_at: iso('16:00') }],
      distributionRows: [
        { id: 'tr1', start: iso('08:00'), end: iso('12:00'), hours: 4, label: 'Projekt A', category: 'project' },
      ],
      now: new Date(iso('17:00')),
    });
    expect(m.workdayMinutes).toBe(8 * 60);
    expect(m.payableMinutes).toBe(8 * 60);
    expect(m.distributedMinutes).toBe(4 * 60);
    expect(m.undistributedMinutes).toBe(4 * 60);
    expect(m.overDistributedMinutes).toBe(0);
    // Oallokerat blockerar inte — bara info-anomali.
    expect(m.reviewRequired).toBe(false);
    const anom = m.anomalies.find((a) => a.kind === 'large_undistributed');
    expect(anom?.severity).toBe('info');

    // ── adminTimeReviewEngine ──
    const input: AdminTimeReviewInput = {
      workday: wd('08:00', '16:00'),
      workEntries: [{ id: 'tr1', start_time: iso('08:00'), end_time: iso('12:00'), hours_worked: 4 }],
      now: new Date(iso('17:00')),
    };
    const r = evaluateAdminTimeReview(input);
    expect(r.metrics.workdayMinutes).toBe(8 * 60);
    expect(r.metrics.reportedActivityMinutes).toBe(4 * 60);
    expect(r.metrics.unallocatedMinutes).toBe(4 * 60);
    expect(r.anomalies.find((a) => a.kind === 'unallocated_time')?.severity).toBe('info');
    const ap = evaluateDayApprovability(r, { workday: input.workday });
    expect(ap.canApprove).toBe(true);
    expect(ap.blockers).toHaveLength(0);
  });

  it('2. Workday 08–16, ingen projekttid: payable=8h, distributed=0, unallocated=8h, kan godkännas', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: iso('08:00'), ended_at: iso('16:00') }],
      distributionRows: [],
      now: new Date(iso('17:00')),
    });
    expect(m.payableMinutes).toBe(8 * 60);
    expect(m.distributedMinutes).toBe(0);
    expect(m.undistributedMinutes).toBe(8 * 60);
    expect(m.reviewRequired).toBe(false);

    const input: AdminTimeReviewInput = {
      workday: wd('08:00', '16:00'),
      workEntries: [],
      now: new Date(iso('17:00')),
    };
    const r = evaluateAdminTimeReview(input);
    const ap = evaluateDayApprovability(r, { workday: input.workday });
    expect(ap.canApprove).toBe(true);
  });

  it('3. Workday saknar slut → canApprove=false (workday_open)', () => {
    const input: AdminTimeReviewInput = {
      workday: wd('08:00', null),
      workEntries: [],
      now: new Date(iso('17:00')),
    };
    const r = evaluateAdminTimeReview(input);
    const ap = evaluateDayApprovability(r, { workday: input.workday });
    expect(ap.canApprove).toBe(false);
    expect(ap.blockers).toContain('workday_open');
  });

  it('4. Aktiv timer öppen → canApprove=false (open_timer)', () => {
    const input: AdminTimeReviewInput = {
      workday: wd('08:00', '16:00'),
      workEntries: [],
      openTimer: { startTime: iso('15:00') },
      now: new Date(iso('17:00')),
    };
    const r = evaluateAdminTimeReview(input);
    const ap = evaluateDayApprovability(r, {
      workday: input.workday,
      openTimer: input.openTimer,
    });
    expect(ap.canApprove).toBe(false);
    expect(ap.blockers).toContain('open_timer');
  });

  it('5. Projekt + restid > workday → överrapportering, kan inte godkännas direkt', () => {
    // canonicalDayModel: 8h workday men 10h fördelat (projekt) → over_distributed critical
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: iso('08:00'), ended_at: iso('16:00') }],
      distributionRows: [
        { id: 'tr1', start: iso('08:00'), end: iso('18:00'), hours: 10, label: 'Projekt A', category: 'project' },
      ],
      now: new Date(iso('19:00')),
    });
    expect(m.overDistributedMinutes).toBeGreaterThan(0);
    expect(m.status).toBe('over_reported');
    expect(m.reviewRequired).toBe(true);
    const overAnom = m.anomalies.find((a) => a.kind === 'over_distributed');
    expect(overAnom).toBeDefined();
    expect(overAnom!.severity === 'critical' || overAnom!.severity === 'warning').toBe(true);
  });

  it('6. Överlapp mellan time_reports → kräver review (anomaly + reviewRequired)', () => {
    const input: AdminTimeReviewInput = {
      workday: wd('08:00', '16:00'),
      workEntries: [
        { id: 'a', start_time: iso('09:00'), end_time: iso('12:00'), hours_worked: 3 },
        { id: 'b', start_time: iso('11:30'), end_time: iso('14:00'), hours_worked: 2.5 },
      ],
      now: new Date(iso('17:00')),
    };
    const r = evaluateAdminTimeReview(input);
    expect(r.metrics.overlapCount).toBe(1);
    const overlap = r.anomalies.find((a) => a.kind === 'overlap');
    expect(overlap).toBeDefined();
    expect(overlap!.severity).not.toBe('info');
  });

  it('7. Stor oallokerad tid skapar varken critical eller warning blocker', () => {
    // 9h workday, 30 min rapport → 8.5h oallokerat
    const input: AdminTimeReviewInput = {
      workday: wd('07:00', '16:00'),
      workEntries: [{ id: 'a', start_time: iso('07:00'), end_time: iso('07:30'), hours_worked: 0.5 }],
      now: new Date(iso('17:00')),
    };
    const r = evaluateAdminTimeReview(input);
    const ua = r.anomalies.find((a) => a.kind === 'unallocated_time');
    expect(ua).toBeDefined();
    expect(ua!.severity).toBe('info');
    // Inga critical eller warning anomalies *p.g.a.* oallokerat:
    const blockers = r.anomalies.filter(
      (a) => a.severity !== 'info' && a.kind === 'unallocated_time',
    );
    expect(blockers).toHaveLength(0);
    const ap = evaluateDayApprovability(r, { workday: input.workday });
    expect(ap.canApprove).toBe(true);

    // canonicalDayModel speglar samma — large_undistributed = info, ej blocker
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: iso('07:00'), ended_at: iso('16:00') }],
      distributionRows: [
        { id: 'a', start: iso('07:00'), end: iso('07:30'), hours: 0.5, label: 'Projekt', category: 'project' },
      ],
      now: new Date(iso('17:00')),
    });
    expect(m.anomalies.find((a) => a.kind === 'large_undistributed')?.severity).toBe('info');
    expect(m.reviewRequired).toBe(false);
  });
});
