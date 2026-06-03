import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// -- Mock supabase client BEFORE importing the hook --
type Call = { table: string; method: string; args: any[] };
const calls: Call[] = [];

vi.mock('@/integrations/supabase/client', () => {
  function makeBuilder(table: string) {
    const builder: any = {
      _filters: [] as Array<{ kind: 'eq' | 'in'; col: string; val: any }>,
      select: vi.fn((cols: string) => {
        calls.push({ table, method: 'select', args: [cols] });
        return builder;
      }),
      order: vi.fn(() => builder),
      eq: vi.fn((col: string, val: any) => {
        builder._filters.push({ kind: 'eq', col, val });
        calls.push({ table, method: 'eq', args: [col, val] });
        return Promise.resolve({ data: [], error: null }).then((r) =>
          Object.assign(builder, r)
        ) && { data: [], error: null };
      }),
      in: vi.fn((col: string, vals: any[]) => {
        builder._filters.push({ kind: 'in', col, val: vals });
        calls.push({ table, method: 'in', args: [col, vals] });
        return { data: [], error: null };
      }),
      insert: vi.fn(() => Promise.resolve({ data: [], error: null })),
      delete: vi.fn(() => builder),
      update: vi.fn(() => builder),
      then: undefined,
    };
    return builder;
  }

  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      channel: () => ({
        on: () => ({ subscribe: () => ({}) }),
      }),
      removeChannel: () => undefined,
    },
  };
});

import { useTeamVehiclesPrefetch } from '@/hooks/useTeamVehiclesForDay';

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useTeamVehiclesPrefetch', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('gör exakt EN batch-query (.in) för N datum istället för N separata queries', async () => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(2026, 5, 10);
      d.setDate(d.getDate() + i);
      return d;
    });

    renderHook(() => useTeamVehiclesPrefetch(days), { wrapper: wrap() });

    await waitFor(() => {
      const tvaCalls = calls.filter((c) => c.table === 'team_vehicle_assignments');
      expect(tvaCalls.some((c) => c.method === 'in')).toBe(true);
    });

    const tvaCalls = calls.filter((c) => c.table === 'team_vehicle_assignments');
    const inCalls = tvaCalls.filter((c) => c.method === 'in');
    const eqDateCalls = tvaCalls.filter(
      (c) => c.method === 'eq' && c.args[0] === 'date'
    );

    expect(inCalls.length).toBe(1);
    // Batchen ska INTE ha N separata .eq('date', …)-queries
    expect(eqDateCalls.length).toBe(0);
    expect(inCalls[0].args[0]).toBe('date');
    expect((inCalls[0].args[1] as string[]).length).toBe(14);
  });
});
