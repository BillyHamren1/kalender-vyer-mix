import { describe, it, expect } from 'vitest';
import {
  filterQueueRows,
  formatMinutes,
  groupQueueRows,
  normalizeQueueRow,
  normalizeReviewQueueList,
  normalizeSubmissionDetail,
  TIME_V2_QUEUE_GROUPS,
} from '@/features/time-v2/lib/contract';

const rawRow = (over: Record<string, unknown> = {}) => ({
  submission_id: 's1',
  group: 'needs_review',
  state: 'submitted',
  date: '2026-09-01',
  personnel_id: 'p1',
  personnel_name: 'Anna Test',
  project_id: 'pr1',
  project_name: 'Projekt A',
  total_minutes: 485,
  travel_minutes: 45,
  break_minutes: 30,
  revision: 2,
  submitted_at: '2026-09-01T17:00:00Z',
  payroll_attestable: true,
  project_attestable: false,
  is_test_fixture: true,
  ...over,
});

describe('Time V2 review queue contract', () => {
  it('normalises rows from snake_case contract fields', () => {
    const row = normalizeQueueRow(rawRow())!;
    expect(row.submissionId).toBe('s1');
    expect(row.group).toBe('needs_review');
    expect(row.personnelName).toBe('Anna Test');
    expect(row.totalMinutes).toBe(485);
    expect(row.payrollAttestable).toBe(true);
    expect(row.projectAttestable).toBe(false);
    expect(row.isTestFixture).toBe(true);
  });

  it('drops rows without a stable id or date instead of fabricating them', () => {
    expect(normalizeQueueRow({ personnel_name: 'X' })).toBeNull();
    const q = normalizeReviewQueueList({ rows: [rawRow(), { personnel_name: 'X' }] });
    expect(q.rows).toHaveLength(1);
  });

  it('maps unknown group values into "missing" rather than inventing a group', () => {
    expect(normalizeQueueRow(rawRow({ group: 'weird' }))!.group).toBe('missing');
  });

  it('exposes exactly the four contract groups', () => {
    expect([...TIME_V2_QUEUE_GROUPS]).toEqual(['needs_review', 'correction', 'approved', 'missing']);
    const grouped = groupQueueRows([normalizeQueueRow(rawRow())!]);
    expect(Object.keys(grouped)).toHaveLength(4);
    expect(grouped.needs_review).toHaveLength(1);
  });

  it('filters on contract fields only (date, personnel, project, group, text)', () => {
    const rows = [
      normalizeQueueRow(rawRow())!,
      normalizeQueueRow(rawRow({ submission_id: 's2', date: '2026-09-05', personnel_id: 'p2', personnel_name: 'Bo', project_id: 'pr2', project_name: 'Projekt B', group: 'approved' }))!,
    ];
    expect(filterQueueRows(rows, { from: '2026-09-03' }).map((r) => r.submissionId)).toEqual(['s2']);
    expect(filterQueueRows(rows, { to: '2026-09-02' }).map((r) => r.submissionId)).toEqual(['s1']);
    expect(filterQueueRows(rows, { personnelId: 'p2' }).map((r) => r.submissionId)).toEqual(['s2']);
    expect(filterQueueRows(rows, { projectId: 'pr1' }).map((r) => r.submissionId)).toEqual(['s1']);
    expect(filterQueueRows(rows, { group: 'approved' }).map((r) => r.submissionId)).toEqual(['s2']);
    expect(filterQueueRows(rows, { query: 'anna' }).map((r) => r.submissionId)).toEqual(['s1']);
    expect(filterQueueRows(rows, { group: 'all' })).toHaveLength(2);
  });

  it('marks stale queue payloads', () => {
    expect(normalizeReviewQueueList({ rows: [], stale: true }).stale).toBe(true);
  });
});

describe('Time V2 submission detail contract', () => {
  const rawDetail = {
    submission_id: 's1',
    date: '2026-09-01',
    personnel_name: 'Anna Test',
    state: 'submitted',
    group: 'needs_review',
    revision: 3,
    snapshot_version: 'sha-abc',
    submitted_at: '2026-09-01T17:00:00Z',
    totals: { total_minutes: 485, work_minutes: 410, travel_minutes: 45, break_minutes: 30 },
    targets: [{ target_id: 'pr1', target_name: 'Projekt A', minutes: 410 }],
    segments: [{ id: 'seg1', kind: 'work', label: 'Arbete', starts_at: '08:00', ends_at: '12:00', minutes: 240, locked: true }],
    decisions: [{ id: 'd1', action: 'submitted', at: '2026-09-01T17:00:00Z', actor: 'Anna', revision: 1 }],
    evidence: [{ id: 'e1', kind: 'scan', label: 'Scan 123', at: '2026-09-01T09:00:00Z', reference: 'time://scan/123' }],
    correction: { requested: true, requested_at: '2026-09-02T08:00:00Z', reason: 'Saknad rast' },
    attestability: { payroll: true, project: false, blocked_reason: 'Projektmål saknas' },
    is_test_fixture: true,
  };

  it('renders the exact immutable snapshot fields', () => {
    const d = normalizeSubmissionDetail(rawDetail)!;
    expect(d.immutable).toBe(true);
    expect(d.snapshotVersion).toBe('sha-abc');
    expect(d.revision).toBe(3);
    expect(d.totals.workMinutes).toBe(410);
    expect(d.segments[0].locked).toBe(true);
    expect(d.decisions[0].action).toBe('submitted');
    expect(d.evidence[0].reference).toBe('time://scan/123');
    expect(d.correction.requested).toBe(true);
    expect(d.correction.resubmittedAt).toBeNull();
    expect(d.attestability).toEqual({ payroll: true, project: false, payrollAttested: false, projectAttested: false, blockedReason: 'Projektmål saknas' });
    expect(d.isTestFixture).toBe(true);
  });

  it('returns null for payloads without a submission identity', () => {
    expect(normalizeSubmissionDetail({ date: '2026-09-01' })).toBeNull();
    expect(normalizeSubmissionDetail(null)).toBeNull();
  });

  it('never invents segments, targets, decisions or evidence', () => {
    const d = normalizeSubmissionDetail({ submission_id: 's', date: '2026-09-01' })!;
    expect(d.segments).toEqual([]);
    expect(d.targets).toEqual([]);
    expect(d.decisions).toEqual([]);
    expect(d.evidence).toEqual([]);
    expect(d.totals.totalMinutes).toBe(0);
  });

  it('formats minutes without re-deriving time', () => {
    expect(formatMinutes(485)).toBe('8 h 05 min');
    expect(formatMinutes(0)).toBe('0 h 00 min');
  });
});
