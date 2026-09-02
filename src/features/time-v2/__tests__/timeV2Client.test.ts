import { describe, it, expect } from 'vitest';
import {
  buildTimeV2Url,
  describeFreshness,
  normalizeOverview,
  TIME_V2_CONTRACT_VERSION,
  timeV2EndpointPath,
} from '@/features/time-v2/lib/contract';
import { fetchTimeV2Overview, getTimeV2BaseUrl, TimeV2ClientError } from '@/features/time-v2/lib/client';

const BASE = 'https://new-dawn-initiatives.lovable.app';

describe('Time V2 read-only contract client', () => {
  it('builds versioned endpoint URLs', () => {
    expect(timeV2EndpointPath('reviewQueue')).toBe(`/api/time/${TIME_V2_CONTRACT_VERSION}/review-queue`);
    expect(buildTimeV2Url(`${BASE}/`, 'sourceStatus', { organization_id: 'org-1' })).toBe(
      `${BASE}/api/time/v1/source-status?organization_id=org-1`,
    );
  });

  it('fails truthfully when the source is not configured', async () => {
    await expect(fetchTimeV2Overview('org-1', { baseUrl: null })).rejects.toMatchObject({ kind: 'not_configured' });
    expect(getTimeV2BaseUrl({})).toBeNull();
  });

  it('surfaces unreachable and http errors instead of fabricating rows', async () => {
    await expect(
      fetchTimeV2Overview('org-1', { baseUrl: BASE, fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: 'unreachable' });

    await expect(
      fetchTimeV2Overview('org-1', {
        baseUrl: BASE,
        fetchImpl: (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TimeV2ClientError);
  });

  it('issues a GET-only request with the contract version header', async () => {
    let seen: RequestInit | undefined;
    await fetchTimeV2Overview('org-1', {
      baseUrl: BASE,
      fetchImpl: (async (_u: string, init: RequestInit) => {
        seen = init;
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(seen?.method).toBe('GET');
    expect((seen?.headers as Record<string, string>)['X-EventFlow-Contract-Version']).toBe(TIME_V2_CONTRACT_VERSION);
  });

  it('normalizes both snake_case and camelCase payloads without inventing data', () => {
    const o = normalizeOverview({
      source: { contract_version: 'v1', generated_at: '2026-09-02T10:00:00Z', staging: true, healthy: true },
      personnel: { total_personnel: 12, with_active_app_account: 9 },
      review_queue: { submitted: 3, awaiting_correction: 1, readyForAttest: 2 },
      independently_attestable: true,
    });
    expect(o.personnel.totalPersonnel).toBe(12);
    expect(o.personnel.blocked).toBe(0);
    expect(o.reviewQueue.readyForAttest).toBe(2);
    expect(o.independentlyAttestable).toBe(true);
    expect(o.previewAvailable).toBe(false);
    expect(normalizeOverview({}).reviewQueue.submitted).toBe(0);
  });

  it('never guesses freshness', () => {
    expect(describeFreshness(null)).toBe('Okänd färskhet');
    expect(describeFreshness('not-a-date')).toBe('Okänd färskhet');
    expect(describeFreshness('2026-09-02T09:00:00Z', new Date('2026-09-02T11:00:00Z'))).toBe('Uppdaterad för 2 h sedan');
  });
});
