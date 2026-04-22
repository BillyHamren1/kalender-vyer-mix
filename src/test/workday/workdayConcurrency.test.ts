/**
 * Workday concurrency contract — server idempotency expectations.
 *
 * Verifies the workdayApi client correctly serializes responses for:
 *   - duplicate start (server returns existing open workday, created=false)
 *   - end without active workday (server returns alreadyClosed=true)
 *   - back-dated start that updates the existing row
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  try {
    localStorage.setItem('eventflow-mobile-token', 'test-token');
  } catch {}
  (import.meta as any).env = { ...(import.meta as any).env, VITE_SUPABASE_URL: 'https://test.supabase.co' };
});

import { workdayApi } from '@/services/workdayApi';

function jsonOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as any);
}

describe('workday concurrency', () => {
  it('duplicate start returns existing workday (created=false)', async () => {
    fetchMock.mockReturnValueOnce(jsonOk({ workday: { id: 'w1', started_at: '2026-04-22T08:00:00Z' }, created: false }));
    const res = await workdayApi.start({ startedAtIso: '2026-04-22T09:00:00Z' });
    expect(res.created).toBe(false);
    expect(res.workday?.id).toBe('w1');
  });

  it('end with no open workday returns alreadyClosed=true', async () => {
    fetchMock.mockReturnValueOnce(jsonOk({ workday: null, alreadyClosed: true }));
    const res = await workdayApi.end();
    expect(res.alreadyClosed).toBe(true);
    expect(res.workday).toBeNull();
  });

  it('start with earlier startedAtIso indicates updated=true', async () => {
    fetchMock.mockReturnValueOnce(jsonOk({ workday: { id: 'w1', started_at: '2026-04-22T07:00:00Z' }, created: false, updated: true }));
    const res = await workdayApi.start({ startedAtIso: '2026-04-22T07:00:00Z' });
    expect(res.updated).toBe(true);
  });

  it('current returns null when no open workday', async () => {
    fetchMock.mockReturnValueOnce(jsonOk({ workday: null }));
    const res = await workdayApi.current();
    expect(res.workday).toBeNull();
  });

  it('throws when fetch returns non-OK with error body', async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Token expired' }) } as any)
    );
    await expect(workdayApi.current()).rejects.toThrow(/Token expired/);
  });
});
