// @vitest-environment node
/**
 * Kvittens-kontrakt för staff_assignments.
 *
 * En skrivning som inte går att läsa tillbaka (RLS/organisation, tyst avslag)
 * MÅSTE kasta fel så att UI kan rulla tillbaka istället för att visa ett namn
 * som försvinner vid nästa omladdning.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
  upsertError: null as any,
  verifyRow: { id: 'row-1' } as any,
  deleteError: null as any,
  remainingRows: [] as any[],
};

vi.mock('@/integrations/supabase/client', () => {
  const selectChain = () => {
    const chain: any = {
      eq: () => chain,
      maybeSingle: async () => ({ data: state.verifyRow, error: null }),
      limit: async () => ({ data: state.remainingRows, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: () => ({
        upsert: async () => ({ error: state.upsertError }),
        select: () => selectChain(),
        delete: () => {
          const chain: any = {
            eq: () => chain,
            then: (resolve: any) => resolve({ error: state.deleteError }),
          };
          return chain;
        },
      }),
    },
  };
});

vi.mock('@/services/time/timeWorkerSync', () => ({
  notifyTimeWorkerAssignments: vi.fn(),
}));

import { assignStaffToTeamCore, removeStaffAssignmentCore } from '../staffAssignmentCore';

const date = new Date(2026, 8, 17);

beforeEach(() => {
  state.upsertError = null;
  state.verifyRow = { id: 'row-1' };
  state.deleteError = null;
  state.remainingRows = [];
});

describe('assignStaffToTeamCore', () => {
  it('lyckas när raden går att läsa tillbaka', async () => {
    await expect(assignStaffToTeamCore('s1', 'team-2', date)).resolves.toBeUndefined();
  });

  it('kastar fel när raden inte syns efter skrivning', async () => {
    state.verifyRow = null;
    await expect(assignStaffToTeamCore('s1', 'team-2', date)).rejects.toThrow(/sparades inte/i);
  });
});

describe('removeStaffAssignmentCore', () => {
  it('lyckas när raden är borta', async () => {
    await expect(removeStaffAssignmentCore('s1', date, 'team-2')).resolves.toBeUndefined();
  });

  it('kastar fel när raden ligger kvar', async () => {
    state.remainingRows = [{ id: 'row-1' }];
    await expect(removeStaffAssignmentCore('s1', date, 'team-2')).rejects.toThrow(/kunde inte tas bort/i);
  });
});
