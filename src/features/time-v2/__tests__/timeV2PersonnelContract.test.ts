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
  timeV2PersonnelCommandPath,
} from '@/features/time-v2/lib/personnelClient';

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
  it('uses the versioned personnel paths', () => {
    expect(timeV2PersonnelPath('personnelDirectory')).toBe('/api/time/v1/personnel-directory');
    expect(timeV2PersonnelPath('personnelDetail')).toBe('/api/time/v1/personnel-detail');
    expect(timeV2PersonnelCommandPath('issueActivation')).toBe('/api/time/v1/commands/issue-app-activation');
    expect(timeV2PersonnelCommandPath('suspendAppAccess')).toBe('/api/time/v1/commands/suspend-app-access');
    expect(timeV2PersonnelCommandPath('reactivateAppAccess')).toBe('/api/time/v1/commands/reactivate-app-access');
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

describe('Time V2 personnel client', () => {
  it('fails truthfully when unconfigured', async () => {
    await expect(fetchTimeV2PersonnelDirectory('org', { baseUrl: null })).rejects.toMatchObject({
      kind: 'not_configured',
    });
  });

  it('issues activation without email side effects and never returns a secret', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accepted: true,
          app_account_state: 'invited',
          activation_issued_at: '2026-09-01T10:00:00Z',
          activation_ticket: 'SECRET-TICKET',
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const res = await issueTimeV2AppActivation(
      { organizationId: 'org', personnelId: 'p-1', reissue: true },
      { baseUrl: 'https://time.test', fetchImpl },
    );
    expect(res.appAccountState).toBe('invited');
    expect(JSON.stringify(res)).not.toContain('SECRET-TICKET');

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ organization_id: 'org', personnel_id: 'p-1', reissue: true, send_email: false });
  });

  it('suspends and reactivates through the versioned command paths', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ accepted: true, app_account_state: 'suspended' }), { status: 200 });
    }) as unknown as typeof fetch;

    await suspendTimeV2AppAccess({ organizationId: 'org', personnelId: 'p-1' }, { baseUrl: 'https://time.test', fetchImpl });
    await reactivateTimeV2AppAccess({ organizationId: 'org', personnelId: 'p-1' }, { baseUrl: 'https://time.test', fetchImpl });
    expect(urls[0]).toContain('/api/time/v1/commands/suspend-app-access');
    expect(urls[1]).toContain('/api/time/v1/commands/reactivate-app-access');
  });
});
