/**
 * Kontrakt: login-anropet MÅSTE gå till den lilla edge-funktionen
 * mobile-app-auth, INTE till stora mobile-app-api. Annars förlorar vi
 * cold-start-vinsten på ~2 s vid mobil-login.
 *
 * Allt annat ska fortsatt gå till mobile-app-api.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('mobileApi login routing', () => {
  const origFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, token: 't', staff: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    (global as any).fetch = fetchMock;
    localStorage.clear();
  });

  afterEach(() => {
    (global as any).fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('login → mobile-app-auth (inte mobile-app-api)', async () => {
    const { mobileApi } = await import('@/services/mobileApiService');
    await mobileApi.login('user@example.com', 'pw');
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/functions\/v1\/mobile-app-auth$/);
    expect(url).not.toMatch(/mobile-app-api/);
  });

  it('me → mobile-app-api (oförändrat)', async () => {
    localStorage.setItem('eventflow-mobile-token', 'fake-token');
    const { mobileApi } = await import('@/services/mobileApiService');
    await mobileApi.me();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/functions\/v1\/mobile-app-api$/);
  });
});
