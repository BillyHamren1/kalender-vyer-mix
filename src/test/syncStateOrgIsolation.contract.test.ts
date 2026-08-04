import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contract test: sync_state läses och skrivs alltid per-organisation.
 *
 * Bakgrund: den gamla globala UNIQUE(sync_type)-nyckeln lät alla
 * organisationer skriva över varandras sync-cursor. Efter migrationen
 * `sync_state_org_sync_type_key` filtreras alla queries på (organization_id,
 * sync_type) och upserts använder onConflict='organization_id,sync_type'.
 */

const eqSpy = vi.fn<(col: string, val: unknown) => void>();
const maybeSingleSpy = vi.fn(async () => ({ data: null, error: null }));
const upsertSpy = vi.fn<(payload: any, opts: any) => any>(() => ({
  select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
}));


vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: (col: string, val: any) => {
          eqSpy(col, val);
          return {
            eq: (col2: string, val2: any) => {
              eqSpy(col2, val2);
              return { maybeSingle: maybeSingleSpy };
            },
          };
        },
      })),
      upsert: (payload: any, opts: any) => {
        upsertSpy(payload, opts);
        return {
          select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        };
      },
    })),
  },
}));

beforeEach(() => {
  eqSpy.mockClear();
  maybeSingleSpy.mockClear();
  upsertSpy.mockClear();
});

describe('syncStateService per-organization isolation', () => {
  it('getSyncState returns null and does not touch DB when organizationId missing', async () => {
    const { getSyncState } = await import('@/services/syncStateService');
    const result = await getSyncState('booking_import', null);
    expect(result).toBeNull();
    expect(eqSpy).not.toHaveBeenCalled();
  });

  it('getSyncState filters by both sync_type AND organization_id', async () => {
    const { getSyncState } = await import('@/services/syncStateService');
    await getSyncState('booking_import', 'org-42');
    expect(eqSpy).toHaveBeenCalledWith('sync_type', 'booking_import');
    expect(eqSpy).toHaveBeenCalledWith('organization_id', 'org-42');
  });

  it('updateSyncState never touches the database (server-owned sync_state)', async () => {
    const { updateSyncState } = await import('@/services/syncStateService');
    const result = await (updateSyncState as any)('booking_import', 'org-42', {
      metadata: { client_note: 'x' },
    });
    expect(result).toBeNull();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('updateSyncState is a no-op when organizationId is missing', async () => {
    const { updateSyncState } = await import('@/services/syncStateService');
    const result = await (updateSyncState as any)('booking_import', undefined, {
      metadata: { client_note: 'x' },
    });
    expect(result).toBeNull();
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
