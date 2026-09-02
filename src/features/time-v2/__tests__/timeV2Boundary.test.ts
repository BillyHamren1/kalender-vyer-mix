/**
 * Binds Planning to the REAL Time boundary (`time-planning-adapter.v2`).
 * Payload fixtures below mirror Time's deployed schemas exactly.
 */
import { describe, it, expect, vi } from 'vitest';
import { callTimeBoundary, TIME_ADAPTER_VERSION, TIME_OPERATIONS, TIME_PROXY_FUNCTION } from '@/features/time-v2/lib/boundary';
import {
  mapDayDetail,
  mapPersonnelDetail,
  mapPersonnelDirectory,
  mapPreviewBundle,
  mapReviewQueue,
  mapStatusToOverview,
} from '@/features/time-v2/lib/v2Mappers';

const envelope = (operation: string, data: unknown) => ({
  data: {
    schema: 'time-planning-boundary-response.v1',
    adapterVersion: TIME_ADAPTER_VERSION,
    operation,
    generatedAt: '2026-09-02T10:00:00Z',
    data,
  },
  error: null,
});

describe('Time boundary transport', () => {
  it('calls the same-origin Planning proxy with a real adapter operation', async () => {
    const invoke = vi.fn(async () => envelope('days.queue', { schema: 'time-review-queue.v1' }));
    const res = await callTimeBoundary(TIME_OPERATIONS.daysQueue, {}, { invoke });
    expect(invoke).toHaveBeenCalledWith({ operation: 'days.queue' });
    expect(res.adapterVersion).toBe('time-planning-adapter.v2');
    expect(TIME_PROXY_FUNCTION).toBe('time-planning-proxy');
  });

  it('refuses an unexpected adapter version instead of rendering rows', async () => {
    const invoke = vi.fn(async () => ({ data: { adapterVersion: 'time-planning-adapter.v1', data: {} }, error: null }));
    await expect(callTimeBoundary(TIME_OPERATIONS.status, {}, { invoke })).rejects.toMatchObject({ kind: 'bad_payload' });
  });

  it('surfaces the server-side configuration gate truthfully', async () => {
    const invoke = vi.fn(async () => ({
      data: { schema: 'time-planning-boundary-error.v1', code: 'not_configured', error: 'Saknad servernyckel: TIME_ADAPTER_URL' },
      error: { context: { status: 503 } },
    }));
    await expect(callTimeBoundary(TIME_OPERATIONS.status, {}, { invoke })).rejects.toMatchObject({ kind: 'not_configured' });
  });

  it('maps 409 to a stale revision instead of retrying', async () => {
    const invoke = vi.fn(async () => ({ data: {}, error: { context: { status: 409 } } }));
    await expect(callTimeBoundary(TIME_OPERATIONS.attestPayroll, {}, { invoke })).rejects.toMatchObject({
      kind: 'stale_revision',
    });
  });
});

describe('Time v2 schema mappers', () => {
  it('maps time-review-queue.v1 groups without inventing rows', () => {
    const queue = mapReviewQueue({
      schema: 'time-review-queue.v1',
      generatedAt: '2026-09-02T10:00:00Z',
      counts: { needs_review: 1, correction: 1, approved: 0, missing: 0 },
      groups: {
        needs_review: [{ submissionId: 's1', workDate: '2026-09-01', workerId: 'w1', workerName: 'Anna', state: 'submitted', version: 2, payroll: { state: 'pending' }, project: { state: 'approved' } }],
        correction: [{ submissionId: 's2', workDate: '2026-09-01', workerName: 'Ove', state: 'correction_requested', version: 3, payroll: { state: 'pending' }, project: { state: 'pending' } }],
        approved: [],
        missing: [],
      },
    });
    expect(queue.rows).toHaveLength(2);
    expect(queue.rows[0]).toMatchObject({ submissionId: 's1', group: 'needs_review', payrollAttestable: true, projectAttestable: false, revision: 2 });
    expect(queue.rows[1].group).toBe('correction');
  });

  it('maps time-day-detail.v1 to the exact immutable snapshot', () => {
    const detail = mapDayDetail({
      schema: 'time-day-detail.v1',
      head: { submissionId: 's1', workDate: '2026-09-01', workerName: 'Anna', workerId: 'w1', state: 'resubmitted', version: 3, snapshotHash: 'abc', payroll: { state: 'pending' }, project: { state: 'approved' } },
      snapshot: { id: 'snap-1', createdAt: '2026-09-02T08:00:00Z', totals: { workMinutes: 410, travelMinutes: 45, breakMinutes: 30 }, blocks: [{ id: 'b1', kind: 'work', durationMinutes: 410, locked: true, target: { label: 'Projekt A', externalId: 'p-1' } }] },
      revisions: [{ event: 'submitted', at: '2026-09-01T18:00:00Z', version: 2 }, { event: 'correction_requested', at: '2026-09-01T19:00:00Z', version: 2, reason: 'Rast saknas' }],
      awaitingResubmission: false,
      isResubmission: true,
      evidence: { messages: [{ id: 'm1', at: '2026-09-01T10:00:00Z', jobLabel: 'Projekt A' }], media: [], scans: [] },
      attestable: { payroll: true, project: false },
    })!;
    expect(detail.revision).toBe(3);
    expect(detail.totals.workMinutes).toBe(410);
    expect(detail.targets[0]).toMatchObject({ targetName: 'Projekt A', minutes: 410 });
    expect(detail.decisions.map((d) => d.action)).toContain('correction_requested');
    expect(detail.attestability).toMatchObject({ payroll: true, project: false, projectAttested: true });
    expect(detail.evidence).toHaveLength(1);
  });

  it('maps publication-preview.v1 and never invents an amount', () => {
    const bundle = mapPreviewBundle(
      {
        schema: 'publication-preview.v1', marker: 'TEST/PREVIEW', kind: 'payroll', generatedAt: '2026-09-02T10:00:00Z',
        totals: { minutes: 455, lineCount: 2 },
        lines: [
          { id: 'payroll:snap-1:work', subjectId: 'w1', subjectLabel: 'Anna', category: 'work', quantity: { kind: 'time', minutes: 410 }, rate: { status: 'not_configured' } },
          { id: 'payroll:snap-1:travel', subjectId: 'w1', subjectLabel: 'Anna', category: 'travel', quantity: { kind: 'time', minutes: 45 }, rate: { status: 'not_configured' } },
        ],
        exceptions: [],
      },
      { schema: 'publication-preview.v1', marker: 'TEST/PREVIEW', kind: 'project_cost', totals: { minutes: 0 }, lines: [], exceptions: [{ label: 'Väntar attest' }] },
      's1', 3, 'abc',
    );
    expect(bundle.payroll.lines).toHaveLength(2);
    expect(bundle.payroll.totalMinutes).toBe(455);
    expect(bundle.payroll.lines[0].amount).toBeNull();
    expect(bundle.payroll.amountsAvailable).toBe(false);
    expect(bundle.project.blockedReason).toBe('Väntar attest');
    expect(bundle.isTestFixture).toBe(true);
    expect(bundle.previewOnly).toBe(true);
  });

  it('maps status + queue counts into the landing overview', () => {
    const o = mapStatusToOverview(
      { adapterVersion: 'time-planning-adapter.v2', generatedAt: '2026-09-02T10:00:00Z', reachable: true, personnelCount: 12 },
      { counts: { needs_review: 2, correction: 1, approved: 4, missing: 0 } },
    );
    expect(o.reviewQueue).toMatchObject({ submitted: 2, awaitingCorrection: 1, attested: 4, readyForAttest: 2 });
    expect(o.independentlyAttestable).toBe(true);
    expect(o.previewAvailable).toBe(true);
  });

  it('keeps HUB and personnel-app identities separate and exposes no secret', () => {
    const dir = mapPersonnelDirectory(
      [{ personnelId: 'p-1', displayName: 'Anna Test', sourceSystem: 'hub', accountState: 'active', appLoginEmail: 'anna@test.se', appRoles: ['time_worker'] }],
      '2026-09-02T10:00:00Z',
    );
    expect(dir.rows[0]).toMatchObject({ personnelId: 'p-1', personnelName: 'Anna Test' });
    expect(dir.rows[0].appAccount.state).toBe('active');
    expect(JSON.stringify(dir)).not.toMatch(/token|secret|password/i);

    const detail = mapPersonnelDetail(
      { person: { id: 'p-1', displayName: 'Anna Test', sourceSystem: 'hub', accountState: 'active' } },
      {
        schema: 'personnel-activation-support.v1', accountState: 'active', canUseApp: true,
        lastSuccessfulAppAccessAt: '2026-09-01T07:00:00Z', lastEvidenceSyncAt: '2026-09-01T16:00:00Z', lastSubmissionSyncAt: '2026-09-01T18:00:00Z',
        assignmentVisibility: { scope: 'personnel', state: 'visible', assignmentCount: 3, sourceLabel: 'Time work-context-kvitton', detail: '3 tilldelningar är synliga' },
      },
      'p-1',
    )!;
    expect(detail.visibleAssignments).toBe(3);
    expect(detail.lastAppAccessAt).toBe('2026-09-01T07:00:00Z');
    expect(detail.diagnostics.every((d) => d.ok)).toBe(true);
  });
});
