import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contract test: frontend äger ALDRIG batch-cursorn.
 *
 * `updateSyncState` accepterar inte längre `last_sync_timestamp` i sin
 * TypeScript-signatur, och även om en gammal call-site skulle skicka in
 * fältet vid runtime så tvättas det bort innan upsert. Cursorn (`sync_state.
 * last_sync_timestamp`) flyttas endast av servern efter en helt lyckad
 * batch (se `supabase/functions/_shared/syncBatch.ts`).
 */

const upsertSpy = vi.fn<(payload: any, opts: any) => any>(() => ({
  select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      })),
      upsert: (payload: any, opts: any) => {
        upsertSpy(payload, opts);
        return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
      },
    })),
  },
}));

beforeEach(() => {
  upsertSpy.mockClear();
});

describe('sync cursor is server-authoritative', () => {
  it('updateSyncState strips accidental last_sync_timestamp writes at runtime', async () => {
    const { updateSyncState } = await import('@/services/syncStateService');
    // Cast to any so we can smuggle in a legacy field that is no longer typed.
    await (updateSyncState as any)('booking_import', 'org-1', {
      last_sync_timestamp: '2026-07-29T00:00:00.000Z',
      last_sync_status: 'success',
    });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const payload = upsertSpy.mock.calls[0]![0] as any;
    expect(payload.last_sync_timestamp).toBeUndefined();
    expect(payload.last_sync_status).toBe('success');
    expect(payload.organization_id).toBe('org-1');
  });

  it('updateSyncState type surface does not accept last_sync_timestamp', async () => {
    // This is really a compile-time check; if the field ever comes back into
    // the type, the ts-expect-error below will fail this test at build time.
    const { updateSyncState } = await import('@/services/syncStateService');
    await updateSyncState('booking_import', 'org-1', {
      // @ts-expect-error last_sync_timestamp is intentionally not in the update surface
      last_sync_timestamp: 'x',
    });
  });
});
