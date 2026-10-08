import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Auth + token storage + 401 lifecycle for mobileApiService.

describe("mobileApiService — auth lifecycle", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  async function getMobileApi() {
    return await import("../mobileApiService");
  }

  const fakeStaff = {
    id: "s1",
    name: "Test",
    email: null,
    phone: null,
    role: null,
    department: null,
    hourly_rate: null,
    overtime_rate: null,
  };

  it("setAuth stores token + staff and getters return them", async () => {
    const { setAuth, getToken, getStoredStaff } = await getMobileApi();
    setAuth("my-token", fakeStaff);
    expect(getToken()).toBe("my-token");
    expect(getStoredStaff()).toEqual(fakeStaff);
  });

  it("clearAuth wipes token + staff", async () => {
    const { setAuth, clearAuth, getToken, getStoredStaff } = await getMobileApi();
    setAuth("token", fakeStaff);
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getStoredStaff()).toBeNull();
  });

  it("clears auth when API returns 401", async () => {
    const { mobileApi, setAuth, getToken } = await getMobileApi();
    setAuth("old-token", fakeStaff);

    mockFetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: { get: () => null },
      json: () => Promise.resolve({ error: "Session expired" }),
    });

    await expect(mobileApi.getBookings()).rejects.toThrow("Session expired");
    expect(getToken()).toBeNull();
  });

  it("propagates server error message on non-2xx", async () => {
    const { mobileApi, setAuth } = await getMobileApi();
    setAuth("token", fakeStaff);

    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      headers: { get: () => null },
      json: () => Promise.resolve({ error: "Internal server error" }),
    });

    await expect(mobileApi.getBookings()).rejects.toThrow("Internal server error");
  });

  it("sends token in body on every authenticated call", async () => {
    const { mobileApi, setAuth } = await getMobileApi();
    setAuth("valid-token", fakeStaff);

    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: () => Promise.resolve({ bookings: [] }),
    });

    await mobileApi.getBookings();
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    expect(body.token).toBe("valid-token");
    expect(body.action).toBe("get_bookings");
  });
});
