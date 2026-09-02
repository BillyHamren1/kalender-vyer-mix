import { describe, it, expect, vi } from 'vitest';
import {
  describeActivation,
  normalizePersonnelDetail,
  normalizePersonnelDirectory,
  normalizePersonnelRow,
  timeV2PersonnelPath,
} from '@/features/time-v2/lib/contract';
import {
  fetchTimeV2PersonnelDirectory,
  issueTimeV2AppActivation,
  reactivateTimeV2AppAccess,
  suspendTimeV2AppAccess,
  TIME_V2_PERSONNEL_COMMANDS,
} from '@/features/time-v2/lib/personnelClient';
import { TIME_ADAPTER_VERSION } from '@/features/time-v2/lib/boundary';

const raw = {
  personnel_id: 'p-1',
  personnel_name: 'Anna Test',
  hub_account: { present: true, state: 'active' },
  app_account: {
    state: 'invited',
    activation_issued_at: '2026-09-01T08:00:00Z',
    activation_expires_at: '2026-09-02T08:00:00Z',
    // Time must never leak a ticket into Planning models.
    activation_ticket: 'SECRET-TICKET',
  },
  last_app_access_at: '2026-08-31T18:00:00Z',
  last_evidence_sync_at: '2026-08-31T18:05:00Z',
  last_submission_sync_at: '2026-08-31T18:06:00Z',
  visible_assignments: 3,
  is_test_fixture: true,
};

describe('Time V2 personnel contract', () => {
  it("uses Time's deployed personnel operations", () => {
    expect(TIME_V2_PERSONNEL_COMMANDS).toEqual({
      issueActivation: 'activation.issue',
      reissueActivation: 'activation.reissue',
      setAppAccess: 'personnel.setAppAccess',
    });
    expect(timeV2PersonnelPath('personnelDirectory')).toBe('/api/time/v1/personnel-directory');
  });

  it('normalises a personnel row and keeps HUB and app identity separate', () => {
    const row = normalizePersonnelRow(raw)!;
    expect(row.personnelName).toBe('Anna Test');
    expect(row.hubAccount).toEqual({ present: true, state: 'active' });
    expect(row.appAccount.state).toBe('invited');
    expect(JSON.stringify(row)).not.toContain('SECRET-TICKET');
    expect(row.visibleAssignments).toBe(3);
    expect(row.isTestFixture).toBe(true);
  });

  it('drops rows without an id and never fabricates data', () => {
    expect(normalizePersonnelRow({ personnel_name: 'x' })).toBeNull();
    const dir = normalizePersonnelDirectory({ rows: [raw, { bad: true }], generated_at: '2026-09-01T09:00:00Z' });
    expect(dir.rows).toHaveLength(1);
    expect(dir.generatedAt).toBe('2026-09-01T09:00:00Z');
    expect(normalizePersonnelDirectory(null).rows).toEqual([]);
  });

  it('normalises detail assignments and diagnostics', () => {
    const detail = normalizePersonnelDetail({
      ...raw,
      assignments: [
        { assignment_id: 'a1', label: 'Projekt A', date: '2026-09-02', visible_in_app: true },
        { label: 'ogiltig' },
      ],
      diagnostics: [{ id: 'geo', label: 'Geofence', ok: false, detail: 'Saknar koordinater' }],
    })!;
    expect(detail.assignments).toHaveLength(1);
    expect(detail.assignments[0].visibleInApp).toBe(true);
    expect(detail.diagnostics[0].ok).toBe(false);
  });

  it('describes activation status truthfully including expiry', () => {
    const row = normalizePersonnelRow(raw)!;
    expect(describeActivation(row, new Date('2026-09-01T09:00:00Z'))).toMatch(/ej använd/);
    expect(describeActivation(row, new Date('2026-09-03T09:00:00Z'))).toMatch(/utgången/);
    expect(describeActivation({ ...row, appAccount: { ...row.appAccount, state: 'suspended' } })).toMatch(/spärrad/);
  });
});

describe('Time V2 personnel client (real boundary)', () => {
  const env = (operation: unknown, data: unknown) => ({
    data: { adapterVersion: TIME_ADAPTER_VERSION, operation, generatedAt: '2026-09-02T10:00:00Z', data },
    error: null,
  });

  it('fails truthfully when the Time boundary is unconfigured server-side', async () => {
    const invoke = vi.fn(async () => ({
      data: { code: 'not_configured', error: 'Saknad servernyckel: TIME_ADAPTER_SYSTEM_TOKEN' },
      error: { context: { status: 503 } },
    }));
    await expect(fetchTimeV2PersonnelDirectory('org', { invoke })).rejects.toMatchObject({ kind: 'not_configured' });
  });

  it('issues activation without email side effects and never returns a secret', async () => {
    const invoke = vi.fn(async (body: Record<string, unknown>) =>
      env(body.operation, {
        accepted: true,
        accountState: 'invited',
        ticket: { issuedAt: '2026-09-01T10:00:00Z', expiresAt: '2026-09-01T11:00:00Z' },
        oneTimeSecret: 'SECRET-TICKET',
      }));

    const res = await issueTimeV2AppActivation({ organizationId: 'org', personnelId: 'p-1', reissue: true }, { invoke });
    expect(res.appAccountState).toBe('invited');
    expect(res.activationExpiresAt).toBe('2026-09-01T11:00:00Z');
    expect(JSON.stringify(res)).not.toContain('SECRET-TICKET');

    const sent = invoke.mock.calls[0][0] as Record<string, unknown>;
    // Time's activation.issue runs with deliver=false; Planning adds no channel of its own.
    expect(sent).toMatchObject({ operation: 'activation.reissue', personnelId: 'p-1', channel: 'one_time_claim' });
  });

  it('suspends and reactivates through personnel.setAppAccess', async () => {
    const invoke = vi.fn(async (body: Record<string, unknown>) => env(body.operation, { accepted: true, accountState: 'suspended' }));
    await suspendTimeV2AppAccess({ organizationId: 'org', personnelId: 'p-1' }, { invoke });
    await reactivateTimeV2AppAccess({ organizationId: 'org', personnelId: 'p-1' }, { invoke });
    const calls = invoke.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls[0]).toMatchObject({ operation: 'personnel.setAppAccess', state: 'suspended', roles: ['time_worker'] });
    expect(calls[1]).toMatchObject({ operation: 'personnel.setAppAccess', state: 'active' });
  });
});
