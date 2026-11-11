import React, { createContext } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/App', () => ({ CalendarContext: createContext<any>({}) }));
vi.mock('@/services/eventService', () => ({
  fetchCalendarEvents: vi.fn(async () => []),
  fetchAllPages: vi.fn(),
  resolveCalendarWindow: ({ anchorDate }: { anchorDate: Date }) => ({
    windowFrom: new Date(anchorDate.getTime() - 45 * 86400000).toISOString(),
    windowTo: new Date(anchorDate.getTime() + 60 * 86400000).toISOString(),
  }),
}));
vi.mock('@/services/eventTitleFixService', () => ({ fixAllEventTitles: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
import { CalendarContext } from '@/App';
import { fetchCalendarEvents } from '@/services/eventService';
import { useRealTimeCalendarEvents } from '../useRealTimeCalendarEvents';

describe('calendar restoration after project navigation', () => {
  it.each(['2026-10-13T12:00:00Z', null, 'invalid', new Date(NaN)])(
    'restores a usable date from %s and supports further navigation', async (saved) => {
      const setLastViewedDate = vi.fn();
      const wrapper = ({ children }: React.PropsWithChildren) => (
        <CalendarContext.Provider value={{ lastViewedDate: saved, setLastViewedDate } as any}>
          {children}
        </CalendarContext.Provider>
      );
      const { result, unmount } = renderHook(() => useRealTimeCalendarEvents(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(Number.isFinite(result.current.currentDate.getTime())).toBe(true);
      if (saved === '2026-10-13T12:00:00Z') {
        expect(result.current.currentDate.toISOString()).toBe(saved.replace('Z', '.000Z'));
      }
      act(() => result.current.handleDatesSet({ start: '2027-01-20T12:00:00Z' }));
      expect(result.current.currentDate.toISOString()).toBe('2027-01-20T12:00:00.000Z');
      expect(setLastViewedDate).toHaveBeenCalledWith(new Date('2027-01-20T12:00:00Z'));
      const previous = result.current.currentDate;
      act(() => result.current.handleDatesSet({ start: null }));
      expect(result.current.currentDate).toBe(previous);
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      unmount();
    },
  );
});

 describe('month navigation read coverage', () => {
  it('reloads before the next month extends beyond the loaded window', async () => {
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <CalendarContext.Provider value={{ lastViewedDate: '2026-11-01T12:00:00Z', setLastViewedDate: vi.fn() } as any}>{children}</CalendarContext.Provider>
    );
    const { result, unmount } = renderHook(() => useRealTimeCalendarEvents(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    vi.mocked(fetchCalendarEvents).mockClear();
    act(() => result.current.handleDatesSet({ start: '2026-12-01T12:00:00Z' }));
    await waitFor(() => expect(fetchCalendarEvents).toHaveBeenCalledWith(expect.objectContaining({ anchorDate: new Date('2026-12-01T12:00:00Z') })));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    unmount();
  });
});
