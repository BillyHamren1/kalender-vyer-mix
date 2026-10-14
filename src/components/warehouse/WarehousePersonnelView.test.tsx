import React from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ error: false, refetch: vi.fn() }));
vi.mock('@/hooks/useWarehousePersonnelWeek', () => ({ useWarehousePersonnelWeek: () => ({ isLoading: false, isError: state.error, refetch: state.refetch, data: { unstaffed: [], rows: [{ staffId: 'a', staffName: 'Alex', staffColor: null, jobs: [{ assignmentId: 'assignment', warehouseEventId: 'internal', packingId: null, bookingId: null, bookingNumber: null, title: 'Städa lagret', customerName: null, deliveryAddress: null, activityType: 'internal_task', status: 'planned', date: '2026-10-14', startTime: '08:00', endTime: '10:00' }] }] } }) }));
vi.mock('@/components/warehouse/WarehouseJobSheet', () => ({ default: ({ target }: {target: {title: string} | null}) => target ? <div role="dialog">{target.title}</div> : null }));
vi.mock('@/components/warehouse-ops/QuickAssignStaffPopover', () => ({ default: () => null }));
import WarehousePersonnelView from './WarehousePersonnelView';
beforeEach(() => {state.error = false; state.refetch.mockReset();});
afterEach(cleanup);
describe('personnel plan', () => {
  it('starts with an accessible list and opens internal work in the shared detail sheet', () => {
    render(<WarehousePersonnelView currentDate={new Date('2026-10-14T12:00:00')} viewMode="day" />);
    expect(screen.getByText(/2 h planerat/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Städa lagret/}));
    expect(screen.getByRole('dialog')).toHaveTextContent('Städa lagret');
  });
  it('does not present a read failure as an empty plan', () => {
    state.error = true;
    render(<WarehousePersonnelView currentDate={new Date('2026-10-14T12:00:00')} viewMode="day" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Kunde inte läsa');
    fireEvent.click(screen.getByRole('button', {name: 'Försök igen'}));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
