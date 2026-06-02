import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocka supabase-klienten innan vi importerar eventService
vi.mock('@/integrations/supabase/client', () => {
  const auth = {
    getSession: vi.fn().mockResolvedValue({
      data: { session: { user: { id: 'test-user-1234' } } },
      error: null,
    }),
  };

  // Bygger en kedja som aldrig resolvar — simulerar hängande PostgREST-request
  const makeHangingQuery = () => {
    const chain: any = new Promise(() => { /* aldrig */ });
    chain.select = () => chain;
    chain.neq = () => chain;
    chain.gte = () => chain;
    chain.lte = () => chain;
    chain.order = () => chain;
    chain.range = () => chain;
    chain.or = () => chain;
    chain.is = () => chain;
    chain.in = () => chain;
    chain.eq = () => chain;
    return chain;
  };

  return {
    supabase: {
      auth,
      from: vi.fn(() => makeHangingQuery()),
    },
  };
});

import { fetchCalendarEvents } from '../eventService';

describe('fetchCalendarEvents – hängskydd', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('kastar timeout-fel istället för att hänga oändligt när PostgREST aldrig svarar', async () => {
    const promise = fetchCalendarEvents();
    // primary timeout är 15s — vi kör 16s framåt
    await vi.advanceTimersByTimeAsync(16_000);
    await expect(promise).rejects.toThrow(/Timeout/);
  }, 20_000);
});
