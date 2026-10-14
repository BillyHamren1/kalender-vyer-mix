import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectTransport } from './useProjectTransport';

const mocks = vi.hoisted(() => ({
  channels: new Map<string, any>(),
  invalidateQueries: vi.fn(),
  removeChannel: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  channel: (name: string) => {
    if (mocks.channels.has(name)) return mocks.channels.get(name);
    const channel = {
      subscribed: false,
      handler: null as null | (() => void),
      filter: null as any,
      on(_event: string, filter: unknown, handler: () => void) {
        if (this.subscribed) throw new Error('cannot add callbacks after subscribe');
        this.filter = filter;
        this.handler = handler;
        return this;
      },
      subscribe() { this.subscribed = true; return this; },
    };
    mocks.channels.set(name, channel);
    return channel;
  },
  // Keep the channel until asynchronous cleanup finishes, as the real client can.
  removeChannel: mocks.removeChannel,
} }));

describe('transport realtime ownership', () => {
  beforeEach(() => { mocks.channels.clear(); vi.clearAllMocks(); });
  it('supports page and widget consumers for the same booking during StrictMode remounts', () => {
    const page = renderHook(() => useProjectTransport('booking-a'), { wrapper: StrictMode });
    const widget = renderHook(() => useProjectTransport('booking-a'), { wrapper: StrictMode });
    expect(mocks.channels.size).toBe(4);
    for (const channel of mocks.channels.values()) {
      expect(channel.filter.filter).toBe('booking_id=eq.booking-a');
    }
    const active = [...mocks.channels.values()].at(-1)!;
    active.handler();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project-transport-assignments', 'booking-a'] });
    page.unmount();
    widget.unmount();
    expect(mocks.removeChannel).toHaveBeenCalledTimes(4);
    expect(new Set(mocks.removeChannel.mock.calls.map(([channel]) => channel)).size).toBe(4);
  });
  it('does not subscribe without a booking', () => {
    renderHook(() => useProjectTransport(null));
    expect(mocks.channels.size).toBe(0);
  });
});
