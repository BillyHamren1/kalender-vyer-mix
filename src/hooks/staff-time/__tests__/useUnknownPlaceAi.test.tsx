/**
 * useUnknownPlaceAi — kontrakttester
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock supabase client
const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
    from: (...args: any[]) => fromMock(...args),
  },
}));

import { useUnknownPlaceAi } from "../useUnknownPlaceAi";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function mockPings(pings: Array<{ lat: number; lng: number; recorded_at: string }>) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lt: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: pings, error: null }),
  };
  fromMock.mockReturnValue(builder);
}

const STAFF = "staff-1";
const DATE = "2026-06-02";
const START = "2026-06-02T12:17:00.000Z";
const END = "2026-06-02T18:09:00.000Z";

describe("useUnknownPlaceAi", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    fromMock.mockReset();
  });

  it("idle när kind != unknown_place", async () => {
    mockPings([]);
    const { result } = renderHook(
      () =>
        useUnknownPlaceAi({
          staffId: STAFF,
          date: DATE,
          kind: "work",
          startIso: START,
          endIso: END,
        }),
      { wrapper: wrapper() },
    );
    expect(result.current.status).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("no_pings när det inte finns pings i fönstret", async () => {
    mockPings([]);
    const { result } = renderHook(
      () =>
        useUnknownPlaceAi({
          staffId: STAFF,
          date: DATE,
          kind: "unknown_place",
          startIso: START,
          endIso: END,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe("no_pings"));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("kallar analyze-unclear-segment med centroid + segment_id när pings finns", async () => {
    mockPings([
      { lat: 59.4914, lng: 17.8553, recorded_at: "2026-06-02T13:00:00.000Z" },
      { lat: 59.4915, lng: 17.8554, recorded_at: "2026-06-02T14:00:00.000Z" },
    ]);
    invokeMock.mockResolvedValue({
      data: {
        cached: false,
        result: {
          suggestedType: "other_place",
          confidence: 0.82,
          explanation: "Stationär nära FA Warehouse.",
          needsUserInput: false,
        },
      },
      error: null,
    });

    const { result } = renderHook(
      () =>
        useUnknownPlaceAi({
          staffId: STAFF,
          date: DATE,
          kind: "unknown_place",
          startIso: START,
          endIso: END,
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [fn, opts] = invokeMock.mock.calls[0];
    expect(fn).toBe("analyze-unclear-segment");
    expect(opts.body.staff_id).toBe(STAFF);
    expect(opts.body.segment.segment_id).toBe(`${STAFF}:${START}:${END}:unknown_place`);
    expect(opts.body.segment.kind).toBe("other_place");
    expect(opts.body.segment.ping_count).toBe(2);
    expect(opts.body.segment.center_lat).toBeCloseTo(59.49145, 4);
    expect(opts.body.segment.center_lng).toBeCloseTo(17.85535, 4);
    expect(result.current.confidence).toBe(0.82);
    expect(result.current.label).toContain("Stationär");
  });

  it("status=error vid edge-fel", async () => {
    mockPings([
      { lat: 59.5, lng: 17.8, recorded_at: "2026-06-02T13:00:00.000Z" },
    ]);
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const { result } = renderHook(
      () =>
        useUnknownPlaceAi({
          staffId: STAFF,
          date: DATE,
          kind: "unknown_place",
          startIso: START,
          endIso: END,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
