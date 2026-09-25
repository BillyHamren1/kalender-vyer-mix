import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/services/jobService', () => ({ fetchJobs: async () => [] }), );
vi.mock('@/services/projectService', () => ({ fetchProjects: async () => [] }));
vi.mock('@/services/largeProjectService', () => ({
  fetchLargeProjects: async () => [
    { id: 'lp1', name: 'Mässan 2026', status: 'planning', start_date: ['2026-10-01'], location: 'Älvsjö', bookingCount: 2,
      bookings: [{ bookings: { booking_number: '2512-7' } }, { bookings: { booking_number: '2601-44' } }] },
    { id: 'lp2', name: 'Gala', status: 'planning', start_date: ['2026-11-01'], location: 'Solna', bookingCount: 1,
      bookings: [{ bookings: { booking_number: '2605-3' } }] },
  ],
}));

import DashboardAllProjects from '../DashboardAllProjects';

const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><DashboardAllProjects /></MemoryRouter>
  </QueryClientProvider>,
);

describe('Projektlistan – sök på gamla bokningsnummer', () => {
  it('exakt och delvis bokningsnummer hittar rätt stort projekt, en gång', async () => {
    wrap();
    expect(await screen.findByText('Mässan 2026')).toBeTruthy();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '2601-44' } });
    expect(screen.getAllByText('Mässan 2026')).toHaveLength(1);
    expect(screen.queryByText('Gala')).toBeNull();
    fireEvent.change(input, { target: { value: '2512' } });
    expect(screen.getAllByText('Mässan 2026')).toHaveLength(1);
    expect(screen.queryByText('Gala')).toBeNull();
    fireEvent.change(input, { target: { value: '2605-3' } });
    expect(screen.getByText('Gala')).toBeTruthy();
    expect(screen.queryByText('Mässan 2026')).toBeNull();
  });
});
