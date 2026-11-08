import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LiveBookingProductsList from './LiveBookingProductsList';

const mocks = vi.hoisted(() => ({ read: vi.fn(), members: vi.fn() }));
vi.mock('@/services/booking/liveBookingService', () => ({ fetchLiveBookingRead: mocks.read }));
vi.mock('@/services/booking/packageMembersService', () => ({ fetchWmsPackageRows: mocks.members }));
vi.mock('@/lib/booking/packageMembers', () => ({ buildPackageMembers: () => ({}) }));
vi.mock('@/components/booking/ProductsList', () => ({ ProductsList: ({ products }: any) => <div>{products.map((p: any) => p.name).join(',')}</div> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div /> }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><LiveBookingProductsList bookingId="booking" /></QueryClientProvider>);
}

describe('live Booking order presentation', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it('shows canonical cancellation neutrally without fetching WMS members', async () => {
    mocks.read.mockResolvedValue({ outcome: 'cancelled', booking_id: 'booking' });
    mount();
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Bokningen är avbokad i Sales.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.members).not.toHaveBeenCalled();
  });
  it.each(['404', 'Unauthorized', 'network unavailable'])('keeps %s as a visible read error', async (error) => {
    mocks.read.mockRejectedValue(new Error(error));
    mount();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Kunde inte läsa aktuella orderrader från Booking. Ingen äldre kopia visas.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(mocks.members).not.toHaveBeenCalled();
  });
  it('continues to render current Booking products for an available booking', async () => {
    mocks.read.mockResolvedValue({ outcome: 'available', booking: { products: [{ name: 'Current Sales row' }] } });
    mocks.members.mockResolvedValue([]);
    mount();
    expect(await screen.findByText('Current Sales row')).toBeTruthy();
    await waitFor(() => expect(mocks.members).toHaveBeenCalledWith('booking'));
  });
});
