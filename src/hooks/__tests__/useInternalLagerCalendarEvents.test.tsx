import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useInternalLagerCalendarEvents } from '../useInternalLagerCalendarEvents';

let lagerEnabled = true;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'organizations') {
        return {
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { internal_lager_enabled: lagerEnabled }, error: null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => Promise.resolve({
            data: [{
              id: 'proj-1',
              name: 'Lager',
              is_internal: true,
              booking_id: 'b-uuid-that-ends-in-d0179463',
              bookings: { id: 'b-uuid-that-ends-in-d0179463', booking_number: null },
            }],
            error: null,
          }),
        }),
      };
    },
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useInternalLagerCalendarEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lagerEnabled = true;
  });

  it('genererar ett event per dag i veckan utan booking_id', async () => {
    const { result } = renderHook(
      () => useInternalLagerCalendarEvents(new Date('2026-05-20'), 'weekly'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.internalLagerEvents.length).toBe(7));
    const ev = result.current.internalLagerEvents[0];
    expect(ev.title).toBe('Lager');
    expect(ev.resourceId).toBe('warehouse');
    // Kritiskt: ingen bookingId → CustomEvent visar inte "#xxxxxxxx"
    expect((ev as any).bookingId).toBeUndefined();
    expect(ev.extendedProps?.hideBookingNumber).toBe(true);
  });

  it('täcker hela månaden (+padding) i monthly-vyn', async () => {
    const { result } = renderHook(
      () => useInternalLagerCalendarEvents(new Date('2026-06-15'), 'monthly'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.internalLagerEvents.length).toBeGreaterThan(28));
    const dates = result.current.internalLagerEvents.map(e => String(e.start).slice(0, 10));
    // Förra månadsskifte (slutet av maj) ska finnas eftersom v22 spänner över
    expect(dates.some(d => d.startsWith('2026-06'))).toBe(true);
    expect(dates.some(d => d.startsWith('2026-07'))).toBe(true);
  });

  it('visar INGA Lager-event när organisationens flagga är av', async () => {
    lagerEnabled = false;
    const { result } = renderHook(
      () => useInternalLagerCalendarEvents(new Date('2026-06-15'), 'monthly'),
      { wrapper },
    );
    // Vänta in flagg-queryn och verifiera att det förblir tomt.
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.internalLagerEvents).toHaveLength(0);
  });
});
