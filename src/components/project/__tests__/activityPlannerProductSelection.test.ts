import { describe, expect, it } from "vitest";
import { resolveProductSelection } from "../ActivityPlannerSheet";
import type { BookingProduct } from "@/services/establishmentPlanningService";

const products = [
  { id: "chair", name: "Stol", quantity: 4 },
  { id: "table", name: "Bord", quantity: 2 },
  { id: "roof", name: "Tak", quantity: 1, parentProductId: "chair" },
] as BookingProduct[];

describe("resolveProductSelection", () => {
  it("sparar en markerad hel produkt med bokningens antal", () => {
    expect(resolveProductSelection(new Set(["chair"]), products)).toEqual({
      productIds: ["chair"],
      productQuantities: { chair: 4 },
    });
  });

  it("slår ihop markerade delenheter till riktigt produkt-id", () => {
    expect(resolveProductSelection(new Set(["table__unit_1", "table__unit_2"]), products)).toEqual({
      productIds: ["table"],
      productQuantities: { table: 2 },
    });
  });

  it("behåller flera markerade produkter i samma aktivitet", () => {
    expect(resolveProductSelection(new Set(["chair", "table__unit_1"]), products)).toEqual({
      productIds: ["chair", "table"],
      productQuantities: { chair: 4, table: 1 },
    });
  });

  it("tar inte med ett tillbehör när endast huvudprodukten är markerad", () => {
    expect(resolveProductSelection(new Set(["chair"]), products)).toEqual({
      productIds: ["chair"],
      productQuantities: { chair: 4 },
    });
  });

  it("tar med tillbehöret först när även det är markerat", () => {
    expect(resolveProductSelection(new Set(["chair", "roof"]), products)).toEqual({
      productIds: ["chair", "roof"],
      productQuantities: { chair: 4, roof: 1 },
    });
  });
});