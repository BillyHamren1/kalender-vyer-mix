import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contract test: frontend äger ALDRIG sync_state.
 *
 * `updateSyncState` är en ren no-op — varken cursor (`last_sync_timestamp`),
 * status, mode eller metadata får skrivas från klienten. Cursorn flyttas
 * endast av servern efter en helt lyckad batch (`finalize_sync_batch`).
 */

const upsertSpy = vi.fn();

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
      update: (payload: any) => {
        upsertSpy(payload, null);
        return { eq: () => ({ eq: async () => ({ data: null, error: null }) }) };
      },
    })),
  },
}));

beforeEach(() => {
  upsertSpy.mockClear();
});

describe('sync_state is server-authoritative', () => {
  it('updateSyncState never writes to the database', async () => {
    const { updateSyncState } = await import('@/services/syncStateService');
    await (updateSyncState as any)('booking_import', 'org-1', {
      last_sync_timestamp: '2026-07-29T00:00:00.000Z',
      last_sync_status: 'success',
      last_sync_mode: 'incremental',
      metadata: { client_note: 'x' },
    });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('updateSyncState always resolves to null', async () => {
    const { updateSyncState } = await import('@/services/syncStateService');
    const res = await (updateSyncState as any)('booking_import', 'org-1', {});
    expect(res).toBeNull();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('importService contains no sync_state writes', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/services/importService.ts', 'utf8');
    expect(src).not.toContain('updateSyncState');
    expect(src).not.toContain("from('sync_state')");
  });
});
