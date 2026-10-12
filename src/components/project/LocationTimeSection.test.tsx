import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocationTimeSection } from './LocationTimeSection';

const fetchPeriod = vi.hoisted(() => vi.fn());
vi.mock('@/services/locationTimeService', () => ({ fetchLocationTimeEntriesForPeriod: fetchPeriod }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: async () => ({ data: [] }) }) } }));

function renderSection() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LocationTimeSection locationId="lager" /></QueryClientProvider>);
}

describe('warehouse location presence overview', () => {
  beforeEach(() => { fetchPeriod.mockReset(); });
  it('distinguishes zero completed minutes, ongoing entries and missing durations', async () => {
    fetchPeriod.mockResolvedValue([
      { id: 'closed', staff_id: 'staff', entered_at: '2026-10-12T08:00:00Z', exited_at: '2026-10-12T08:00:00Z', total_minutes: 0 },
      { id: 'active', staff_id: 'staff', entered_at: '2026-10-12T08:00:00Z', exited_at: null, total_minutes: 90 },
      { id: 'missing', staff_id: 'staff', entered_at: '2026-10-12T08:00:00Z', exited_at: '2026-10-12T09:00:00Z', total_minutes: null },
    ]);
    renderSection();
    expect(await screen.findByText('0 min')).toBeTruthy();
    expect(screen.getByText('Pågår')).toBeTruthy();
    expect(screen.getByText('Tid saknas')).toBeTruthy();
    expect(screen.getByText('0 tim')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('ofullständig');
  });
  it('refetches for explicit selected dates', async () => {
    fetchPeriod.mockResolvedValue([]);
    renderSection();
    await screen.findByText('Ingen tid registrerad ännu');
    fireEvent.change(screen.getByLabelText('Från datum'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Till datum'), { target: { value: '2026-01-31' } });
    await waitFor(() => expect(fetchPeriod).toHaveBeenLastCalledWith({ location_id: 'lager', date_from: '2026-01-01', date_to: '2026-01-31' }));
  });
  it('shows a read failure instead of a misleading zero total', async () => {
    fetchPeriod.mockRejectedValue(new Error('partial page'));
    renderSection();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('0 tim')).toBeNull();
  });
});
