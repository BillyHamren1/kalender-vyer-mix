import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const invokeMock = vi.fn();
const removeChannelMock = vi.fn();
const channelMock = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    channel: () => channelMock,
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  },
}));

import { useDayTimeline } from "@/hooks/admin/useDayTimeline";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useDayTimeline", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    removeChannelMock.mockReset();
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
  });

  it("calls compute with force=true when refresh() is invoked", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { events: [{ id: "e1" }], suggestions: [], snapshot: { cached: true } },
      error: null,
    });
    invokeMock.mockResolvedValueOnce({
      data: { events: [{ id: "e2" }], suggestions: [], snapshot: { cached: false } },
      error: null,
    });

    const { result } = renderHook(
      () => useDayTimeline({ staffId: "staff-1", date: "2026-04-29" }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(invokeMock).toHaveBeenNthCalledWith(1, "day-timeline-engine", {
      body: { action: "get", staff_id: "staff-1", date: "2026-04-29" },
    });

    await act(async () => { await result.current.refresh(); });

    const lastCall = invokeMock.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("day-timeline-engine");
    expect(lastCall[1]).toEqual({
      body: { action: "compute", staff_id: "staff-1", date: "2026-04-29", force: true },
    });
  });
});
