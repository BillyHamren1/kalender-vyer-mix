import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';

const addMock = vi.fn();
const createMock = vi.fn();
const toastErr = vi.fn();
vi.mock('@/services/largeProjectService', () => ({
  fetchLargeProjects: async () => [{ id: 'p1', name: 'Mässan', bookingCount: 2, start_date: null }],
  addBookingToLargeProject: (...a: any[]) => addMock(...a),
  createLargeProjectFromBooking: (...a: any[]) => createMock(...a),
}));
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastErr(m), success: vi.fn() } }));

import { AddToLargeProjectDialog } from '../AddToLargeProjectDialog';

const ProjectPage = () => <div>PROJEKTSIDA {useParams().id}</div>;
const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/booking/b1']}>
      <Routes>
        <Route path="/booking/:id" element={<AddToLargeProjectDialog open onOpenChange={() => {}} bookingId="b1" />} />
        <Route path="/large-project/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

describe('AddToLargeProjectDialog – flöde', () => {
  beforeEach(() => { addMock.mockReset(); createMock.mockReset(); toastErr.mockReset(); });

  it('skapar nytt projekt från bokningen och öppnar projektet', async () => {
    createMock.mockResolvedValue({ project: { id: 'pNew' } });
    wrap();
    fireEvent.click(await screen.findByText('Skapa nytt'));
    fireEvent.change(screen.getByLabelText('Projektnamn *'), { target: { value: 'Gala 2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
    await waitFor(() => expect(createMock).toHaveBeenCalledWith('b1', { name: 'Gala 2026' }));
    expect(addMock).not.toHaveBeenCalled();
    expect(await screen.findByText('PROJEKTSIDA pNew')).toBeTruthy();
  });

  it('kopplar utan grundbokning som standard', async () => {
    addMock.mockResolvedValue({});
    wrap();
    fireEvent.click(await screen.findByText('Mässan'));
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
    await waitFor(() => expect(addMock).toHaveBeenCalledWith('p1', 'b1', undefined, { makePrimary: false }));
    expect(await screen.findByText('PROJEKTSIDA p1')).toBeTruthy();
  });

  it.each([
    [{ message: 'BOOKING_IN_OTHER_PROJECT: x' }, /annat aktivt stort projekt/],
    [{ message: 'PROJECT_NOT_FOUND' }, /finns inte längre eller är raderat/],
    [{ message: 'BOOKING_NOT_FOUND' }, /hittades inte/],
    [{ code: '42501', message: 'permission denied for table' }, /saknar behörighet/],
    [{ message: 'ORGANIZATION_MISMATCH' }, /olika organisationer/],
  ])('visar begripligt fel %#', async (err, re) => {
    addMock.mockRejectedValue(err);
    wrap();
    fireEvent.click(await screen.findByText('Mässan'));
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith(expect.stringMatching(re)));
    expect(screen.queryByText(/PROJEKTSIDA/)).toBeNull();
  });
});
