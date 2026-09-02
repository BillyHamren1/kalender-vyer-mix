import { describe, it, expect, vi } from 'vitest';
import { describeFreshness, normalizeOverview } from '@/features/time-v2/lib/contract';
import {
  fetchTimeV2Overview,
  fetchTimeV2ReviewQueue,
  getTimeV2BaseUrl,
  TimeV2ClientError,
} from '@/features/time-v2/lib/client';
import { TIME_ADAPTER_VERSION } from '@/features/time-v2/lib/boundary';

const env = (operation: string, data: unknown) => ({
  data: { adapterVersion: TIME_ADAPTER_VERSION, operation, generatedAt: '2026-09-02T10:00:00Z', data },
  error: null,
});

const server = (byOperation: Record<string, unknown>) =>
  vi.fn(async (body: Record<string, unknown>) => env(String(body.operation), byOperation[String(body.operation)] ?? {}));

describe('Time V2 read-only client (real boundary)', () => {
  it('reads through Planning\'s same-origin proxy, never a Time URL in the browser', () => {
    expect(getTimeV2BaseUrl()).toBe('same-origin:time-planning-proxy');
  });

  it('fails truthfully when the server-side Time configuration is missing', async () => {
    const invoke = vi.fn(async () => ({
      data: { code: 'not_configured', error: 'Saknad servernyckel: TIME_ADAPTER_URL' },
      error: { context: { status: 503 } },
    }));
    await expect(fetchTimeV2Overview('org-1', { invoke })).rejects.toMatchObject({ kind: 'not_configured' });
  });

  it('surfaces unreachable errors instead of fabricating rows', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); });
    const err = await fetchTimeV2Overview('org-1', { invoke }).catch((e) => e);
    expect(err).toBeInstanceOf(TimeV2ClientError);
    expect(err.kind).toBe('unreachable');
  });

  it('uses the exact deployed operations for overview and queue', async () => {
    const invoke = server({
      status: { reachable: true, personnelCount: 4 },
      'days.queue': { counts: { needs_review: 1, correction: 0, approved: 2, missing: 0 }, groups: { needs_review: [], correction: [], approved: [], missing: [] } },
      'personnel.accounts': [{ personnelId: 'p1', displayName: 'Anna', accountState: 'active' }],
    });
    const overview = await fetchTimeV2Overview('org-1', { invoke });
    const ops = invoke.mock.calls.map((c) => (c[0] as Record<string, unknown>).operation);
    expect(ops.sort()).toEqual(['days.queue', 'personnel.accounts', 'status']);
    expect(overview.personnel.withActiveAppAccount).toBe(1);
    expect(overview.reviewQueue.attested).toBe(2);
  });

  it('filters the queue on contract fields only', async () => {
    const invoke = server({
      'days.queue': {
        counts: { needs_review: 2, correction: 0, approved: 0, missing: 0 },
        groups: {
          needs_review: [
            { submissionId: 's1', workDate: '2026-09-01', workerId: 'w1', workerName: 'Anna', state: 'submitted', version: 1, payroll: { state: 'pending' }, project: { state: 'pending' } },
            { submissionId: 's2', workDate: '2026-09-05', workerId: 'w2', workerName: 'Ove', state: 'submitted', version: 1, payroll: { state: 'pending' }, project: { state: 'pending' } },
          ],
          correction: [], approved: [], missing: [],
        },
      },
    });
    const queue = await fetchTimeV2ReviewQueue('org-1', { from: '2026-09-01', to: '2026-09-02' }, { invoke });
    expect(queue.rows.map((r) => r.submissionId)).toEqual(['s1']);
  });

  it('normalizes both snake_case and camelCase payloads without inventing data', () => {
    const o = normalizeOverview({
      source: { contract_version: 'v1', generated_at: '2026-09-02T10:00:00Z', staging: true, healthy: true },
      personnel: { total_personnel: 12, with_active_app_account: 9 },
      review_queue: { submitted: 3, awaiting_correction: 1, readyForAttest: 2 },
      independently_attestable: true,
    });
    expect(o.personnel.totalPersonnel).toBe(12);
    expect(o.reviewQueue.readyForAttest).toBe(2);
    expect(normalizeOverview({}).reviewQueue.submitted).toBe(0);
  });

  it('never guesses freshness', () => {
    expect(describeFreshness(null)).toBe('Okänd färskhet');
    expect(describeFreshness('not-a-date')).toBe('Okänd färskhet');
    expect(describeFreshness('2026-09-02T09:00:00Z', new Date('2026-09-02T11:00:00Z'))).toBe('Uppdaterad för 2 h sedan');
  });
});
