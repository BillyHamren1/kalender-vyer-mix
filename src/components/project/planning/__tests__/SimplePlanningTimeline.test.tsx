import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SimplePlanningTimeline from "../SimplePlanningTimeline";
import type { EstablishmentTask } from "@/services/establishmentTaskService";

const baseTask: EstablishmentTask = {
  id: "task-1",
  booking_id: "b1",
  large_project_id: null,
  title: "Rigg",
  category: "installation",
  start_date: "2026-08-20",
  end_date: "2026-08-20",
  start_time: "08:00",
  end_time: "10:00",
  completed: false,
  sort_order: 0,
  notes: null,
  assigned_to: null,
  assigned_to_ids: [],
  source: "product",
  source_product_id: "p1",
  source_product_ids: ["p1", "p2", "p3"],
  status: "todo",
  readiness: "ready",
  priority: "medium",
  description: null,
  blockers: null,
  blocker_responsible: null,
  decision_needed: false,
  task_type: "crew",
  assigned_user_id: null,
  due_date: null,
  start_date_ts: null,
  linked_entity_type: "none",
  linked_entity_id: null,
};

const products = [
  { id: "p1", name: "F8 - 8x5/300", quantity: 1 },
  { id: "p2", name: "F8 Tak", quantity: 2 },
  { id: "p3", name: "F8 Vägg", quantity: 1 },
];

function renderTimeline(tasks: EstablishmentTask[]) {
  return render(
    <SimplePlanningTimeline
      tasks={tasks}
      staffPool={[]}
      products={products}
      onTaskClick={vi.fn()}
      onCreateMoment={vi.fn()}
      onPlanFromBooking={vi.fn()}
    />
  );
}

describe("SimplePlanningTimeline produktvisning", () => {
  it("visar huvudprodukten till höger om titeln med framträdande stil", () => {
    renderTimeline([baseTask]);

    const title = screen.getByText("Rigg");
    expect(title).toBeInTheDocument();

    const mainProduct = screen.getByText("F8 - 8x5/300");
    expect(mainProduct).toBeInTheDocument();

    // Huvudprodukten ska ligga i samma rad som titeln (närmaste flex-rad)
    const row = title.closest("div");
    expect(row).toContainElement(mainProduct);
  });

  it("visar övriga produkter på en separat rad under titeln", () => {
    renderTimeline([baseTask]);

    expect(screen.getByText("Övriga produkter:")).toBeInTheDocument();
    expect(screen.getByText(/F8 Tak/)).toBeInTheDocument();
    expect(screen.getByText(/F8 Vägg/)).toBeInTheDocument();
  });

  it("visar kvantitet på huvudprodukten när den är större än 1", () => {
    const task: EstablishmentTask = {
      ...baseTask,
      source_product_ids: ["p2"],
      source_product_id: "p2",
    };
    renderTimeline([task]);

    expect(screen.getByText("2 × F8 Tak")).toBeInTheDocument();
  });

  it("döljer 'Övriga produkter'-raden när det bara finns en produkt", () => {
    const task: EstablishmentTask = {
      ...baseTask,
      source_product_ids: ["p1"],
      source_product_id: "p1",
    };
    renderTimeline([task]);

    expect(screen.getByText("F8 - 8x5/300")).toBeInTheDocument();
    expect(screen.queryByText("Övriga produkter:")).not.toBeInTheDocument();
  });

  it("visar inte längre 'Från bokning'-badgen", () => {
    renderTimeline([baseTask]);
    expect(screen.queryByText("Från bokning")).not.toBeInTheDocument();
  });

  it("visar huvudprodukten utan truncate-klass så den nyttjar tillgänglig bredd", () => {
    renderTimeline([baseTask]);
    const product = screen.getByText("F8 - 8x5/300");
    expect(product).toBeInTheDocument();
    expect(product.className).not.toContain("truncate");
  });
});
