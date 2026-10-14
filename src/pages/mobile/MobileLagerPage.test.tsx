import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import MobileLagerPage from './MobileLagerPage';
import type { LagerAssignmentItem } from '@/hooks/useLagerAssignments';

const mocks = vi.hoisted(() => ({
  assignments: [] as LagerAssignmentItem[], error: null as unknown, refresh: vi.fn(), complete: vi.fn(), toastError: vi.fn(),
}));
vi.mock('@/hooks/useLagerAssignments', () => ({ useLagerAssignments: () => ({ assignments: mocks.assignments, loading: false, error: mocks.error, refresh: mocks.refresh }) }));
vi.mock('@/services/mobileApiService', () => ({ mobileApi: { completeLagerTask: mocks.complete } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function mount(url = '/m/lager?date=2026-10-14') { render(<MemoryRouter initialEntries={[url]}><MobileLagerPage /><Location /></MemoryRouter>); }
const task = (overrides: Partial<LagerAssignmentItem> = {}): LagerAssignmentItem => ({
  id: 'assignment-1', type: 'internal_task', title: 'Städa lagret', description: 'Ställ tillbaka verktygen', date: '2026-10-14', start_time: null, end_time: null, status: 'planned', action: 'complete_task', packing_id: null, packlist_id: null, booking_id: null, booking_number: null, delivery_address: null, customer_name: null, project_task_id: null, warehouse_event_id: 'event-1', source: 'warehouse_calendar_events', metadata: null, ...overrides,
});
beforeEach(() => { mocks.assignments = []; mocks.error = null; vi.clearAllMocks(); });
afterEach(cleanup);
describe('worker warehouse day', () => {
  it('keeps scanner access available without any personal assignments', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Öppna skannern' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/m/tools/scanner');
  });
  it('navigates dates and safely renders malformed date links', () => {
    mount('/m/lager?date=invalid');
    expect((screen.getByLabelText('Arbetsdag') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.change(screen.getByLabelText('Arbetsdag'), { target: { value: '2026-10-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nästa dag' }));
    expect(screen.getByTestId('location')).toHaveTextContent('date=2026-10-15');
  });
  it('shows actionable load error instead of a false empty schedule', () => {
    mocks.error = new Error('offline'); mount();
    expect(screen.getByRole('alert')).toHaveTextContent('Kunde inte hämta');
    expect(screen.queryByText('Inget planerat lagerarbete')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Försök igen')); expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('opens internal task instructions without pretending unlinked tasks can complete', () => {
    mocks.assignments = [task()]; mount();
    expect(screen.queryByRole('button', { name: 'Markera klar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Visa uppgift' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Ställ tillbaka verktygen');
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('does not route inventory tasks into outgoing packing', () => {
    mocks.assignments = [task({ type: 'inventory', action: 'open_inventory' })]; mount();
    fireEvent.click(screen.getByRole('button', { name: 'Visa uppgift' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/m/lager');
  });
  it.each([
    ['open_scanner', 'Starta packning', 'out'],
    ['open_return_scanner', 'Starta retur', 'in'],
  ] as const)('opens the assigned scanner target for %s', (action, label, mode) => {
    mocks.assignments = [task({ type: 'packing', action, packing_id: 'packing-1' })]; mount();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/m/tools/scanner?packingId=packing-1&mode=${mode}`);
  });
  it('keeps completed work collapsed initially', () => {
    mocks.assignments = [task({ status: 'done' })]; mount();
    expect(screen.getByText('Klart (1)').closest('details')).not.toHaveAttribute('open');
  });
  it('surfaces a rejected completion without success refresh', async () => {
    mocks.assignments = [task({ project_task_id: 'task-1' })]; mocks.complete.mockResolvedValue({ success: false }); mount();
    fireEvent.click(screen.getByRole('button', { name: 'Markera klar' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
