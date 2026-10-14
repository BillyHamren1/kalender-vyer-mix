import React from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  assignedLoading: false, assignedError: false, sameDayWindow: true,
  currentQuery: null as null | (() => Promise<unknown>),
  from: vi.fn(), invalidate: vi.fn().mockResolvedValue(undefined),
  assign: vi.fn(), remove: vi.fn(), refetch: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/warehouse/warehouseTime', () => ({ warehouseDateOf: (value: string) => value?.slice(0, 10), warehouseTimeOf: (value: string) => value?.slice(11, 16) }));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ organizationId: 'org' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from } }));
vi.mock('@/services/warehouseAssignmentsSync', () => ({ assignStaffToWarehouseEvent: state.assign, removeStaffFromWarehouseEvent: state.remove, assignStaffToPacking: state.assign, removeStaffFromPacking: state.remove }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ui/popover', () => ({ Popover: ({ children }: {children: React.ReactNode}) => <div>{children}</div>, PopoverTrigger: ({children}: {children: React.ReactNode}) => <div>{children}</div>, PopoverContent: ({children}: {children: React.ReactNode}) => <div>{children}</div> }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
  useQuery: ({ queryKey, queryFn }: {queryKey: string[]; queryFn: () => Promise<unknown>}) => {
    if (queryKey[0].endsWith('-staff')) return { data: [{ id: 'a', name: 'Alex', is_active: true, tags: ['Lager'] }, { id: 'b', name: 'Alex', is_active: true, tags: ['Lager'] }], refetch: state.refetch };
    if (queryKey[0].endsWith('-current')) {
      state.currentQuery = queryFn;
      return {data: [{ staffId: 'a', assignmentId: 'assignment-a' }], isFetching: state.assignedLoading, isError: state.assignedError, refetch: state.refetch };
    }
    return {data: {date: '2026-10-14', availability: [], jobs: [], start: '08:00', end: '10:00', sameDayWindow: state.sameDayWindow}, refetch: state.refetch};
  },
}));
import QuickAssignStaffPopover from '../QuickAssignStaffPopover';
const setup = () => render(<QuickAssignStaffPopover warehouseEventId="event" assignedNames={['Alex']} label="Bemanna" muted />);
beforeEach(() => { state.assignedLoading = false; state.assignedError = false; state.sameDayWindow = true; state.invalidate.mockClear(); state.assign.mockReset().mockResolvedValue({ok: true}); state.remove.mockReset().mockResolvedValue({ok: true}); });
afterEach(cleanup);
describe('safe warehouse assignment', () => {
  it('uses IDs for two people with the same name and adds the unassigned person', async () => {
    setup();
    const people = screen.getAllByRole('button', {name: /Alex/});
    expect(people[0]).toHaveAttribute('aria-pressed', 'true');
    expect(people[1]).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(people[1]);
    await waitFor(() => expect(state.assign).toHaveBeenCalledWith({staffId: 'b', warehouseEventId: 'event'}));
    expect(state.remove).not.toHaveBeenCalled();
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({queryKey: ['warehouse-job-detail']}));
  });
  it('does not expose stale toggles while current assignments are loading or failed', () => {
    state.assignedLoading = true;
    const view = setup();
    expect(screen.queryByRole('button', {name: /Alex/})).not.toBeInTheDocument();
    state.assignedLoading = false; state.assignedError = true;
    view.rerender(<QuickAssignStaffPopover warehouseEventId="event" assignedNames={[]} label="Bemanna" muted />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Alex/})).not.toBeInTheDocument();
  });
  it('reads only directly assigned packing crew, leaving event crew to event-level removal', async () => {
    const rows = [{id: 'direct', staff_id: 'a', organization_id: 'org', packing_id: 'packing', warehouse_event_id: null}, {id: 'linked', staff_id: 'b', organization_id: 'org', packing_id: 'packing', warehouse_event_id: 'event'}];
    let selected = rows;
    const chain = {
      select: () => chain,
      eq: (key: keyof typeof rows[number], value: string) => { selected = selected.filter(row => row[key] === value); return chain; },
      is: (key: keyof typeof rows[number], value: null) => { selected = selected.filter(row => row[key] === value); return chain; },
      then: (resolve: (value: unknown) => void) => resolve({data: selected, error: null}),
    };
    state.from.mockReturnValue(chain);
    render(<QuickAssignStaffPopover packingId="packing" assignedNames={[]} label="Bemanna" muted />);
    expect(await state.currentQuery!()).toEqual([{assignmentId: 'direct', staffId: 'a'}]);
  });
  it('does not imply conflict-free availability when a job spans multiple days', () => {
    state.sameDayWindow = false;
    setup();
    expect(screen.getAllByText(/Tidskonflikter kan inte bedömas/)).toHaveLength(2);
    expect(screen.queryByText(/Inga andra lagerjobb/)).not.toBeInTheDocument();
  });
  it('locks all personnel until the mutation and assignment refresh have settled', async () => {
    let finish!: (result: {ok: boolean}) => void;
    state.assign.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    setup();
    const people = screen.getAllByRole('button', {name: /Alex/});
    fireEvent.click(people[1]);
    expect(people[0]).toBeDisabled(); expect(people[1]).toBeDisabled();
    fireEvent.click(people[0]);
    expect(state.remove).not.toHaveBeenCalled();
    finish({ok: true});
    await waitFor(() => expect(people[0]).not.toBeDisabled());
  });
});
