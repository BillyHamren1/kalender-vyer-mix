import { describe, it, expect } from 'vitest';
import {
  computeAssignmentTimeStatus,
  AtsInput,
} from '@/lib/staff/assignmentTimeStatus';

const baseTarget = { bookingId: 'b1' };

const makeInput = (over: Partial<AtsInput> = {}): AtsInput => ({
  target: baseTarget,
  workday: null,
  lteRows: [],
  timeReports: [],
  workdayFlags: [],
  ...over,
});

describe('computeAssignmentTimeStatus', () => {
  it('returns not_started when nothing exists', () => {
    expect(computeAssignmentTimeStatus(makeInput()).status).toBe('not_started');
  });

  it('on_site when workday started + LTE present', () => {
    const r = computeAssignmentTimeStatus(makeInput({
      workday: { started_at: '2026-05-05T07:00:00Z', ended_at: null },
      lteRows: [{
        id: 'l1', booking_id: 'b1', large_project_id: null,
        entered_at: '2026-05-05T07:30:00Z', exited_at: '2026-05-05T08:30:00Z',
        total_minutes: 60,
      }],
    }));
    expect(r.status).toBe('on_site');
    expect(r.actualMinutes).toBe(60);
  });

  it('timer_running when active LTE on target', () => {
    const r = computeAssignmentTimeStatus(makeInput({
      workday: { started_at: '2026-05-05T07:00:00Z', ended_at: null },
      lteRows: [{
        id: 'l1', booking_id: 'b1', large_project_id: null,
        entered_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        exited_at: null, total_minutes: null, source: 'manual',
      }],
    }));
    expect(r.status).toBe('timer_running');
    expect(r.hasActiveTimer).toBe(true);
  });

  it('auto_started when active LTE source=geofence', () => {
    const r = computeAssignmentTimeStatus(makeInput({
      workday: { started_at: 'x', ended_at: null },
      lteRows: [{
        id: 'l1', booking_id: 'b1', large_project_id: null,
        entered_at: new Date().toISOString(), exited_at: null,
        total_minutes: null, source: 'geofence',
      }],
    }));
    expect(r.status).toBe('auto_started');
    expect(r.autoStarted).toBe(true);
  });

  it('missing_workday when LTE/TR exists but no workday', () => {
    const r = computeAssignmentTimeStatus(makeInput({
      timeReports: [{
        id: 't1', booking_id: 'b1', large_project_id: null,
        hours_worked: 4, approved: false, is_subdivision: false,
        start_time: null, end_time: null,
      }],
    }));
    expect(r.status).toBe('missing_workday');
  });

  it('done when approved time_report exists', () => {
    const r = computeAssignmentTimeStatus(makeInput({
      workday: { started_at: 'x', ended_at: 'y' },
      timeReports: [{
        id: 't1', booking_id: 'b1', large_project_id: null,
        hours_worked: 8, approved: true, is_subdivision: false,
        start_time: null, end_time: null,
      }],
    }));
    expect(r.status).toBe('done');
    expect(r.actualMinutes).toBe(480);
  });

  it('needs_review beats other statuses', () => {
    const r = computeAssignmentTimeStatus(makeInput({
      workday: { started_at: 'x', ended_at: null, review_status: 'needs_review' },
      lteRows: [{
        id: 'l1', booking_id: 'b1', large_project_id: null,
        entered_at: new Date().toISOString(), exited_at: null,
        total_minutes: null,
      }],
    }));
    expect(r.status).toBe('needs_review');
    expect(r.reviewReasons).toContain('workday_review');
  });

  it('ignores rows on other targets', () => {
    const r = computeAssignmentTimeStatus(makeInput({
      target: { bookingId: 'b1' },
      workday: { started_at: 'x', ended_at: null },
      lteRows: [{
        id: 'l1', booking_id: 'b2', large_project_id: null,
        entered_at: new Date().toISOString(), exited_at: null,
        total_minutes: null,
      }],
    }));
    expect(r.status).toBe('not_started');
  });

  it('matches large_project_id when set', () => {
    const r = computeAssignmentTimeStatus(makeInput({
      target: { largeProjectId: 'lp1' },
      workday: { started_at: 'x', ended_at: null },
      lteRows: [{
        id: 'l1', booking_id: null, large_project_id: 'lp1',
        entered_at: new Date().toISOString(), exited_at: null,
        total_minutes: null,
      }],
    }));
    expect(r.status).toBe('timer_running');
  });
});
