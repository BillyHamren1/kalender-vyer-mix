import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const findMock = vi.fn();
const addMock = vi.fn();
const toastErr = vi.fn();
vi.mock('@/lib/largeProject/largeProjectMembers', async (orig) => ({
  ...(await orig<any>()),
  findActiveLargeProjectForBooking: (...a: any[]) => findMock(...a),
}));
vi.mock('@/services/largeProjectService', () => ({
  fetchLargeProjects: async () => [{ id: 'p1', name: 'Mässan', bookingCount: 2, start_date: null }],
  addBookingToLargeProject: (...a: any[]) => addMock(...a),
  createLargeProjectFromBooking: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastErr(m), success: vi.fn() } }));

import { BookingLargeProjectButton } from '../BookingLargeProjectButton';

const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><BookingLargeProjectButton bookingId="b1" bookingClient="Kund AB" /></MemoryRouter>
  </QueryClientProvider>,
);

describe('BookingLargeProjectButton', () => {
  beforeEach(() => { findMock.mockReset(); addMock.mockReset(); toastErr.mockReset(); });

  it('visar projektet om bokningen redan ingår', async () => {
    findMock.mockResolvedValue({ id: 'p9', name: 'Gala' });
    wrap();
    expect(await screen.findByText(/Stort projekt: Gala/)).toBeTruthy();
  });

  it('kopplar till befintligt projekt som grundbokning', async () => {
    findMock.mockResolvedValue(null);
    addMock.mockResolvedValue({});
    wrap();
    fireEvent.click(await screen.findByText('Koppla till stort projekt'));
    fireEvent.click(await screen.findByText('Mässan'));
    fireEvent.click(screen.getByLabelText('Markera som grundbokning'));
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
    await waitFor(() => expect(addMock).toHaveBeenCalledWith('p1', 'b1', undefined, { makePrimary: true }));
  });

  it('visar tydligt fel när RPC vägrar (org-mismatch)', async () => {
    findMock.mockResolvedValue(null);
    addMock.mockRejectedValue(new Error('Kunde inte koppla bokningen till projektet: ORGANIZATION_MISMATCH'));
    wrap();
    fireEvent.click(await screen.findByText('Koppla till stort projekt'));
    fireEvent.click(await screen.findByText('Mässan'));
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith(expect.stringMatching(/olika organisationer/)));
  });
});
