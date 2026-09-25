import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { matchesBookingSearch } from '@/lib/booking/bookingSearch';

// Fixtures: två bokningar som båda ingår i samma stora projekt, med interna
// UUID skilda från sina gamla bokningsnummer.
const fixtures = [
  { id: 'uuid-aaa', bookingNumber: '2512-7', client: 'Kund Alfa', viewed: true, status: 'CONFIRMED', largeProjectId: 'lp1' },
  { id: 'uuid-bbb', bookingNumber: '2601-44', client: 'Kund Beta', viewed: true, status: 'CONFIRMED', largeProjectId: 'lp1' },
];
vi.mock('@/services/bookingService', () => ({
  fetchBookings: async () => fixtures,
  markBookingAsViewed: vi.fn(),
  fetchUpcomingBookings: async () => [],
  fetchConfirmedBookings: async () => [],
}));
vi.mock('@/services/booking/bookingChangeService', () => ({
  fetchRecentBookingChanges: async () => [],
  getFieldChangeType: () => null,
}));
vi.mock('@/services/importService', () => ({ importBookings: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import BookingList from '../BookingList';

const BookingDetail = () => <div>BOKNINGSDETALJ {useParams().id}</div>;

describe('Bokningslistan – gamla bokningsnummer i stort projekt', () => {
  it('matchesBookingSearch matchar bokningsnummer, id och kund', () => {
    expect(matchesBookingSearch(fixtures[0], '2512-7')).toBe(true);
    expect(matchesBookingSearch(fixtures[0], '2512')).toBe(true);
    expect(matchesBookingSearch(fixtures[0], 'alfa')).toBe(true);
    expect(matchesBookingSearch(fixtures[0], '2601')).toBe(false);
    expect(matchesBookingSearch(fixtures[0], '  ')).toBe(false);
  });

  it('sök på gammalt nummer hittar just den bokningen och öppnar dess ursprungliga UUID', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/booking-list']}>
          <Routes>
            <Route path="/booking-list" element={<BookingList />} />
            <Route path="/booking/:id" element={<BookingDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = await screen.findByPlaceholderText('Search bookings...');
    fireEvent.change(input, { target: { value: '2601-44' } });
    const cell = await screen.findByText('2601-44');
    expect(screen.queryByText('2512-7')).toBeNull();
    fireEvent.click(cell);
    expect(await screen.findByText('BOKNINGSDETALJ uuid-bbb')).toBeTruthy();
  });
});
