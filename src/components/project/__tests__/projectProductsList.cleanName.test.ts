import { describe, it, expect } from "vitest";
import { cleanName, isVisibleAccessory } from "../ProjectProductsList";

describe("cleanName", () => {
  it("behåller första bokstaven på namn som börjar med L", () => {
    expect(cleanName("Ljusslinga - Pris per lpm")).toBe("Ljusslinga - Pris per lpm");
    expect(cleanName("Lätt lastbil")).toBe("Lätt lastbil");
    expect(cleanName("Multiflex 6x9")).toBe("Multiflex 6x9");
  });

  it("strippar tillbehörsprefix L,", () => {
    expect(cleanName("L, Takduk vit")).toBe("Takduk vit");
  });

  it("strippar arrow- och dash-prefix", () => {
    expect(cleanName("↳ Vägg, transparent 4x4")).toBe("Vägg, transparent 4x4");
    expect(cleanName("└ P Ben")).toBe("P Ben");
    expect(cleanName("-- P Hatt")).toBe("P Hatt");
    expect(cleanName("  -- P Ben")).toBe("P Ben");
  });
});

describe("isVisibleAccessory", () => {
  it("visar ↳-tillbehör med parent", () => {
    expect(isVisibleAccessory({ name: "↳ Takduk vit 4x4", parent_product_id: "p1" })).toBe(true);
  });
  it("döljer -- paketkomponenter", () => {
    expect(isVisibleAccessory({ name: "  -- P Ben", parent_product_id: "p1" })).toBe(false);
    expect(isVisibleAccessory({ name: "-- P Hatt", parent_product_id: "p1" })).toBe(false);
  });
  it("inte tillbehör utan parent", () => {
    expect(isVisibleAccessory({ name: "Multiflex 6x9", parent_product_id: null })).toBe(false);
  });
});
