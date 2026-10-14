import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WarehouseJobSheet, { type WarehouseJobTarget } from './WarehouseJobSheet';

const mocks = vi.hoisted(() => ({
  request: vi.fn(), save: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ organizationId: 'org-1' }) }));
vi.mock('@/services/warehouseCalendarService', () => ({ updateWarehouseCalendarEvent: mocks.save }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/warehouse-ops/QuickAssignStaffPopover', () => ({ default: ({ warehouseEventId }: { warehouseEventId: string }) => <div data-testid="staff-event">{warehouseEventId}</div> }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      order: () => chain,
      neq: (field: string, value: unknown) => { filters[`neq_${field}`] = value; return chain; },
      eq: (field: string, value: unknown) => { filters[field] = value; return chain; },
      is: (field: string, value: unknown) => { filters[field] = value; return chain; },
      in: (field: string, value: unknown) => { filters[field] = value; return chain; },
      single: () => Promise.resolve(mocks.request(table, filters)),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.request(table, filters)).then(resolve),
    };
    return chain;
  } },
}));
const event = (id = 'event-1') => ({ id, title: id === 'event-1' ? 'Packa tält' : 'Packa stolar', start_time: id === 'event-1' ? '2026-10-14T06:00:00Z' : '2026-10-15T10:00:00Z', end_time: id === 'event-1' ? '2026-10-14T08:00:00Z' : '2026-10-15T12:00:00Z', booking_id: null, warehouse_project_id: null });
let clients: QueryClient[] = [];
function mount(target: WarehouseJobTarget = { warehouseEventId: 'event-1' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client);
  const onSaved = vi.fn();
  const view = (next: WarehouseJobTarget) => <QueryClientProvider client={client}><MemoryRouter><WarehouseJobSheet target={next} open onOpenChange={vi.fn()} onSaved={onSaved} /></MemoryRouter></QueryClientProvider>;
  const rendered = render(view(target));
  return { ...rendered, onSaved, changeTarget: (next: WarehouseJobTarget) => rendered.rerender(view(next)) };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.save.mockResolvedValue(undefined);
  mocks.request.mockImplementation((table: string, filters: Record<string, unknown>) => ({ data: table === 'warehouse_calendar_events' ? event(String(filters.id)) : [], error: null }));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients = []; });

describe('warehouse shared job details', () => {
  it('surfaces failed reads and retries without offering writes', async () => {
    mocks.request.mockResolvedValue({ data: null, error: new Error('Offline') }); mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Kunde inte hämta jobbet');
    expect(screen.queryByRole('button', { name: 'Spara tid' })).not.toBeInTheDocument();
    mocks.request.mockImplementation((table: string) => ({ data: table === 'warehouse_calendar_events' ? event() : [], error: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }));
    expect(await screen.findByLabelText('Start')).toHaveValue('2026-10-14T08:00');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('reads in the current organization and saves Stockholm wall time as UTC', async () => {
    const { onSaved } = mount();
    expect(await screen.findByLabelText('Start')).toHaveValue('2026-10-14T08:00');
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-10-14T09:30' } });
    fireEvent.change(screen.getByLabelText('Slut'), { target: { value: '2026-10-14T11:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tid' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('event-1', { start_time: '2026-10-14T07:30:00.000Z', end_time: '2026-10-14T09:30:00.000Z' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    for (const [, filters] of mocks.request.mock.calls) expect(filters.organization_id).toBe('org-1');
  });
  it.each([
    ['2026-10-14T10:00', '2026-10-14T09:00'],
    ['2026-03-29T02:30', '2026-03-29T04:00'],
    ['2026-10-25T02:30', '2026-10-25T04:00'],
  ])('does not write invalid or ambiguous time %s', async (start, end) => {
    mount(); await screen.findByLabelText('Start');
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: start } });
    fireEvent.change(screen.getByLabelText('Slut'), { target: { value: end } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tid' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });
  it('does not rewrite unchanged timestamps or discard seconds on untouched endpoints', async () => {
    mocks.request.mockImplementation((table: string) => ({ data: table === 'warehouse_calendar_events' ? { ...event(), start_time: '2026-10-14T06:00:45Z' } : [], error: null }));
    mount(); await screen.findByLabelText('Start');
    expect(screen.getByRole('button', { name: 'Spara tid' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Slut'), { target: { value: '2026-10-14T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tid' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('event-1', { start_time: '2026-10-14T06:00:45Z', end_time: '2026-10-14T09:00:00.000Z' }));
  });
  it('selects a booking work phase and does not carry that selection into another target', async () => {
    mocks.request.mockImplementation((table: string, filters: Record<string, unknown>) => ({
      data: table === 'warehouse_calendar_events'
        ? filters.id ? event(String(filters.id)) : [{ ...event(), event_type: 'packing' }]
        : [], error: null,
    }));
    const { changeTarget } = mount({ bookingId: 'booking-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Packning · 2026-10-14 08:00' }));
    expect(await screen.findByLabelText('Start')).toHaveValue('2026-10-14T08:00');
    expect(screen.getByTestId('staff-event')).toHaveTextContent('event-1');
    changeTarget({ warehouseEventId: 'event-2' });
    await waitFor(() => expect(screen.getByLabelText('Start')).toHaveValue('2026-10-15T12:00'));
    expect(screen.getByTestId('staff-event')).toHaveTextContent('event-2');
  });
  it('discards edited times when opening a different event', async () => {
    const { changeTarget } = mount(); await screen.findByLabelText('Start');
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-10-14T05:00' } });
    changeTarget({ warehouseEventId: 'event-2' });
    await waitFor(() => expect(screen.getByLabelText('Start')).toHaveValue('2026-10-15T12:00'));
    expect(screen.getByTestId('staff-event')).toHaveTextContent('event-2');
    fireEvent.change(screen.getByLabelText('Slut'), { target: { value: '2026-10-15T15:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tid' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('event-2', { start_time: '2026-10-15T10:00:00Z', end_time: '2026-10-15T13:00:00.000Z' }));
  });
});
