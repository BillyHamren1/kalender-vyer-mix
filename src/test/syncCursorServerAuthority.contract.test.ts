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
  it('updateSyncState strips forbidden server-owned fields at runtime', async () => {
    const { updateSyncState } = await import('@/services/syncStateService');
    // Cast to any so we can smuggle in legacy fields that are no longer typed.
    await (updateSyncState as any)('booking_import', 'org-1', {
      last_sync_timestamp: '2026-07-29T00:00:00.000Z',
      last_sync_status: 'success',
      last_sync_mode: 'incremental',
      metadata: { client_note: 'x' },
    });
    // Upsert körs eftersom metadata är satt — men payload får ALDRIG innehålla
    // last_sync_timestamp/status/mode.
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const payload = upsertSpy.mock.calls[0]![0] as any;
    expect(payload.last_sync_timestamp).toBeUndefined();
    expect(payload.last_sync_status).toBeUndefined();
    expect(payload.last_sync_mode).toBeUndefined();
    expect(payload.metadata).toEqual({ client_note: 'x' });
    expect(payload.organization_id).toBe('org-1');
  });

  it('updateSyncState becomes a no-op when nothing frontend-writable is provided', async () => {
    const { updateSyncState } = await import('@/services/syncStateService');
    await (updateSyncState as any)('booking_import', 'org-1', {
      last_sync_timestamp: '2026-07-29T00:00:00.000Z',
      last_sync_status: 'success',
    });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('updateSyncState type surface does not accept server-owned fields', async () => {
    // This is really a compile-time check.
    const { updateSyncState } = await import('@/services/syncStateService');
    await updateSyncState('booking_import', 'org-1', {
      // @ts-expect-error last_sync_timestamp is intentionally not in the update surface
      last_sync_timestamp: 'x',
    });
    await updateSyncState('booking_import', 'org-1', {
      // @ts-expect-error last_sync_status is intentionally not in the update surface
      last_sync_status: 'success',
    });
    await updateSyncState('booking_import', 'org-1', {
      // @ts-expect-error last_sync_mode is intentionally not in the update surface
      last_sync_mode: 'incremental',
    });
  });
});
