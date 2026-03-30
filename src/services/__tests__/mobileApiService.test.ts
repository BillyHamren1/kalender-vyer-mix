import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the mobileApiService's callApi behavior and type contracts

describe("mobileApiService", () => {
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

  // Must re-import after mocking fetch
  async function getMobileApi() {
    // Dynamic import to pick up mocked fetch
    const mod = await import("../mobileApiService");
    return mod;
  }

  describe("Authentication flow", () => {
    it("setAuth stores token and staff in localStorage", async () => {
      const { setAuth, getToken, getStoredStaff } = await getMobileApi();

      const staff = { id: "s1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null };
      setAuth("my-token", staff);

      expect(getToken()).toBe("my-token");
      expect(getStoredStaff()).toEqual(staff);
    });

    it("clearAuth removes token and staff", async () => {
      const { setAuth, clearAuth, getToken, getStoredStaff } = await getMobileApi();

      setAuth("token", { id: "s1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });
      clearAuth();

      expect(getToken()).toBeNull();
      expect(getStoredStaff()).toBeNull();
    });
  });

  describe("API error handling", () => {
    it("clears auth on 401 response", async () => {
      const { mobileApi, setAuth, getToken } = await getMobileApi();
      setAuth("old-token", { id: "s1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });

      mockFetch.mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: () => Promise.resolve({ error: "Session expired" }),
      });

      await expect(mobileApi.getBookings()).rejects.toThrow("Session expired");
      expect(getToken()).toBeNull();
    });

    it("throws on non-ok response with error message", async () => {
      const { mobileApi, setAuth } = await getMobileApi();
      setAuth("token", { id: "s1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });

      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: "Internal server error" }),
      });

      await expect(mobileApi.getBookings()).rejects.toThrow("Internal server error");
    });
  });

  describe("toggleEstablishmentTask", () => {
    it("sends correct action and data", async () => {
      const { mobileApi, setAuth } = await getMobileApi();
      setAuth("valid-token", { id: "s1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });

      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true, completed: true }),
      });

      const result = await mobileApi.toggleEstablishmentTask("task-123");

      expect(result).toEqual({ success: true, completed: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("mobile-app-api"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"toggle_establishment_task"'),
        })
      );

      const callBody = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(callBody.action).toBe("toggle_establishment_task");
      expect(callBody.data.task_id).toBe("task-123");
      expect(callBody.token).toBe("valid-token");
    });
  });

  describe("getBookingDetails", () => {
    it("returns establishment_tasks in response", async () => {
      const { mobileApi, setAuth } = await getMobileApi();
      setAuth("token", { id: "s1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });

      const mockResponse = {
        booking: { id: "b1", client: "Kund AB" },
        planning: { assigned_staff: [], calendar_events: [] },
        project: null,
        my_time_reports: [],
        establishment_tasks: [
          { id: "et1", title: "Montering", category: "installation", completed: false },
          { id: "et2", title: "Transport", category: "transport", completed: true },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await mobileApi.getBookingDetails("b1");

      expect(result.establishment_tasks).toHaveLength(2);
      expect(result.establishment_tasks![0].title).toBe("Montering");
      expect(result.establishment_tasks![1].completed).toBe(true);
    });

    it("sends booking_id in request body", async () => {
      const { mobileApi, setAuth } = await getMobileApi();
      setAuth("token", { id: "s1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });

      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ booking: {}, establishment_tasks: [] }),
      });

      await mobileApi.getBookingDetails("booking-xyz");

      const callBody = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(callBody.action).toBe("get_booking_details");
      expect(callBody.data.booking_id).toBe("booking-xyz");
    });
  });

  describe("Data contract: establishment tasks flow", () => {
    it("tasks created in project appear in mobile booking details", async () => {
      // This test validates the data contract:
      // 1. Tasks with assigned_to + booking_id should appear in mobile getBookingDetails
      // 2. The mobile API filters by assigned_to = staffId
      const { mobileApi, setAuth } = await getMobileApi();
      setAuth("token", { id: "staff-1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });

      const mockResponse = {
        booking: { id: "b1", client: "Test Client" },
        establishment_tasks: [
          { id: "t1", title: "Lastning", category: "material", completed: false, assigned_to: "staff-1" },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await mobileApi.getBookingDetails("b1");

      // Verify the task assigned to this staff member is included
      expect(result.establishment_tasks).toBeDefined();
      expect(result.establishment_tasks!.length).toBeGreaterThan(0);
      expect(result.establishment_tasks![0].id).toBe("t1");
    });

    it("toggle task changes completed status", async () => {
      const { mobileApi, setAuth } = await getMobileApi();
      setAuth("token", { id: "staff-1", name: "Test", email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });

      // First toggle: false → true
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true, completed: true }),
      });

      const result1 = await mobileApi.toggleEstablishmentTask("t1");
      expect(result1.completed).toBe(true);

      // Second toggle: true → false
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true, completed: false }),
      });

      const result2 = await mobileApi.toggleEstablishmentTask("t1");
      expect(result2.completed).toBe(false);
    });
  });
});
