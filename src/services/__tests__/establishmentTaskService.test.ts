import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

const createChain = () => {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return chain;
};

let mockChain: ReturnType<typeof createChain>;

vi.mock("@/integrations/supabase/client", () => {
  mockChain = createChain();
  return {
    supabase: {
      from: vi.fn(() => mockChain),
    },
  };
});

import {
  fetchEstablishmentTasks,
  fetchEstablishmentTasksByProject,
  createEstablishmentTask,
  updateEstablishmentTask,
  deleteEstablishmentTask,
} from "../establishmentTaskService";
import { supabase } from "@/integrations/supabase/client";

describe("establishmentTaskService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain = createChain();
    (supabase.from as any).mockReturnValue(mockChain);
  });

  describe("fetchEstablishmentTasks", () => {
    it("queries by booking_id and orders by sort_order", async () => {
      const tasks = [{ id: "t1", title: "Test", category: "installation" }];
      mockChain.order.mockReturnValue(Promise.resolve({ data: tasks, error: null }));

      const result = await fetchEstablishmentTasks("booking-123");

      expect(supabase.from).toHaveBeenCalledWith("establishment_tasks");
      expect(mockChain.select).toHaveBeenCalled();
      expect(mockChain.eq).toHaveBeenCalledWith("booking_id", "booking-123");
      expect(mockChain.order).toHaveBeenCalledWith("sort_order", { ascending: true });
      expect(result).toEqual(tasks);
    });

    it("throws on supabase error", async () => {
      mockChain.order.mockReturnValue(Promise.resolve({ data: null, error: new Error("DB error") }));

      await expect(fetchEstablishmentTasks("booking-123")).rejects.toThrow("DB error");
    });

    it("returns empty array when no tasks exist", async () => {
      mockChain.order.mockReturnValue(Promise.resolve({ data: [], error: null }));

      const result = await fetchEstablishmentTasks("booking-123");
      expect(result).toEqual([]);
    });
  });

  describe("fetchEstablishmentTasksByProject", () => {
    it("queries by large_project_id", async () => {
      mockChain.order.mockReturnValue(Promise.resolve({ data: [], error: null }));

      await fetchEstablishmentTasksByProject("proj-456");

      expect(supabase.from).toHaveBeenCalledWith("establishment_tasks");
      expect(mockChain.eq).toHaveBeenCalledWith("large_project_id", "proj-456");
    });
  });

  describe("createEstablishmentTask", () => {
    it("inserts task with correct defaults", async () => {
      const newTask = { id: "t1", title: "Ny uppgift", category: "transport", start_date: "2025-06-01", end_date: "2025-06-01" };
      mockChain.single.mockReturnValue(Promise.resolve({ data: newTask, error: null }));

      const result = await createEstablishmentTask({
        booking_id: "b1",
        title: "Ny uppgift",
        category: "transport",
        start_date: "2025-06-01",
        end_date: "2025-06-01",
      });

      expect(mockChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          booking_id: "b1",
          large_project_id: null,
          title: "Ny uppgift",
          category: "transport",
          sort_order: 0,
          source: "manual",
          source_product_id: null,
          notes: null,
          assigned_to: null,
        })
      );
      expect(result).toEqual(newTask);
    });

    it("passes assigned_to when provided", async () => {
      mockChain.single.mockReturnValue(Promise.resolve({ data: { id: "t2" }, error: null }));

      await createEstablishmentTask({
        large_project_id: "proj-1",
        title: "Med personal",
        category: "installation",
        start_date: "2025-06-01",
        end_date: "2025-06-02",
        assigned_to: "staff-abc",
      });

      expect(mockChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          booking_id: null,
          large_project_id: "proj-1",
          assigned_to: "staff-abc",
        })
      );
    });
  });

  describe("updateEstablishmentTask", () => {
    it("updates with partial fields", async () => {
      mockChain.eq.mockReturnValue(Promise.resolve({ error: null }));

      await updateEstablishmentTask("t1", { completed: true, notes: "Klart" });

      expect(mockChain.update).toHaveBeenCalledWith({ completed: true, notes: "Klart" });
      expect(mockChain.eq).toHaveBeenCalledWith("id", "t1");
    });
  });

  describe("deleteEstablishmentTask", () => {
    it("deletes by id", async () => {
      mockChain.eq.mockReturnValue(Promise.resolve({ error: null }));

      await deleteEstablishmentTask("t1");

      expect(mockChain.delete).toHaveBeenCalled();
      expect(mockChain.eq).toHaveBeenCalledWith("id", "t1");
    });
  });
});
