import React from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ error: false, untimed: false, overlap: false, refetch: vi.fn() }));
vi.mock('@/hooks/useWarehousePersonnelWeek', () => ({ useWarehousePersonnelWeek: () => ({ isLoading: false, isError: state.error, refetch: state.refetch, data: { unstaffed: state.overlap ? Array.from({length: 6}, (_, index) => ({ assignmentId: null, warehouseEventId: `extra-${index}`, packingId: null, bookingId: null, bookingNumber: null, title: `Packning ${index}`, customerName: null, deliveryAddress: null, activityType: 'packing', status: 'planned', date: '2026-10-14', startTime: '08:00', endTime: '10:00' })) : [], rows: [{ staffId: 'a', staffName: 'Alex', staffColor: null, jobs: [{ assignmentId: 'assignment', warehouseEventId: 'internal', packingId: null, bookingId: null, bookingNumber: null, title: 'Städa lagret', customerName: null, deliveryAddress: null, activityType: 'internal_task', status: 'planned', date: '2026-10-14', startTime: state.untimed ? null : '08:00', endTime: state.untimed ? null : '10:00' }] }] } }) }));
vi.mock('@/components/warehouse/WarehouseJobSheet', () => ({ default: ({ target }: {target: {title: string} | null}) => target ? <div role="dialog">{target.title}</div> : null }));
vi.mock('@/components/warehouse-ops/QuickAssignStaffPopover', () => ({ default: () => null }));
import WarehousePersonnelView from './WarehousePersonnelView';
beforeEach(() => {state.error = false; state.untimed = false; state.overlap = false; state.refetch.mockReset();});
afterEach(cleanup);
describe('personnel plan', () => {
  it('starts with an accessible list and opens internal work in the shared detail sheet', () => {
    render(<WarehousePersonnelView currentDate={new Date('2026-10-14T12:00:00')} viewMode="day" />);
    expect(screen.getByText(/2 h planerat/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Städa lagret/}));
    expect(screen.getByRole('dialog')).toHaveTextContent('Städa lagret');
  });
  it('starts the timeline near the work and preserves the full day without an empty untimed strip', () => {
    const { rerender } = render(<WarehousePersonnelView currentDate={new Date('2026-10-14T12:00:00')} viewMode="day" />);
    fireEvent.click(screen.getByRole('button', {name: 'Tidsöversikt'}));
    const timeline = screen.getByTestId('personnel-day-timeline');
    expect(timeline.scrollTop).toBe(420);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByText('23:00')).toBeInTheDocument();
    expect(screen.queryByText('Utan tid')).not.toBeInTheDocument();
    timeline.scrollTop = 800;
    rerender(<WarehousePersonnelView currentDate={new Date('2026-10-14T12:00:00')} viewMode="day" />);
    expect(timeline.scrollTop).toBe(800);
    fireEvent.click(screen.getByRole('button', {name: 'Lista'}));
    expect(timeline.isConnected).toBe(false);
  });
  it('keeps people compact when many unstaffed jobs overlap and keeps every job reachable', () => {
    state.overlap = true;
    render(<WarehousePersonnelView currentDate={new Date('2026-10-14T12:00:00')} viewMode="day" />);
    fireEvent.click(screen.getByRole('button', {name: 'Tidsöversikt'}));
    const timeline = screen.getByTestId('personnel-day-timeline');
    expect((timeline.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe('64px 264px repeat(1, 264px)');
    for (let index = 0; index < 6; index++) expect(screen.getByRole('button', {name: new RegExp(`Packning ${index} 08:00`)})).toBeInTheDocument();
    expect(screen.queryByText('Tidskonflikt')).not.toBeInTheDocument();
    const column = screen.getByLabelText('Överlappande jobb, bläddra i sidled för att se alla');
    column.scrollBy = vi.fn();
    fireEvent.click(screen.getByRole('button', {name: 'Visa fler jobb för obemannat'}));
    expect(column.scrollBy).toHaveBeenCalledWith({left: 264, behavior: 'smooth'});
  });
  it('keeps genuinely untimed jobs visible before the timed grid', () => {
    state.untimed = true;
    render(<WarehousePersonnelView currentDate={new Date('2026-10-14T12:00:00')} viewMode="day" />);
    fireEvent.click(screen.getByRole('button', {name: 'Tidsöversikt'}));
    expect(screen.getByText('Utan tid')).toBeInTheDocument();
    expect(screen.getByTestId('personnel-day-timeline').scrollTop).toBe(0);
    expect(screen.getByRole('button', {name: /Städa lagret/})).toBeInTheDocument();
  });
  it('does not present a read failure as an empty plan', () => {
    state.error = true;
    render(<WarehousePersonnelView currentDate={new Date('2026-10-14T12:00:00')} viewMode="day" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Kunde inte läsa');
    fireEvent.click(screen.getByRole('button', {name: 'Försök igen'}));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
