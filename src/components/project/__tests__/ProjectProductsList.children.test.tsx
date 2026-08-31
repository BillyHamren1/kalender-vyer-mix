import { describe, it, expect } from "vitest";
import { isVisibleAccessory, isPackageMemberRow, cleanName } from "../ProjectProductsList";

describe("ProjectProductsList — barnrader (tillbehör visas, paketkomponenter döljs)", () => {
  it("visar `↳ M Takduk` med parent_product_id", () => {
    expect(
      isVisibleAccessory({
        name: "  ↳ M Takduk 6 meter",
        parent_product_id: "parent-1",
        parent_package_id: null,
        is_package_component: false,
      })
    ).toBe(true);
  });

  it("visar legacy-rad med namn-prefix `L,`", () => {
    expect(
      isVisibleAccessory({
        name: "L, gammal rad utan FK",
        parent_product_id: null,
        parent_package_id: null,
        is_package_component: false,
      })
    ).toBe(true);
  });

  it("visar `└`-rad med parent_product_id", () => {
    expect(
      isVisibleAccessory({
        name: "└ M Vägg 4 meter",
        parent_product_id: "parent-1",
        parent_package_id: null,
        is_package_component: false,
      })
    ).toBe(true);
  });

  it("döljer paketkomponent `-- M Ben` (is_package_component=true)", () => {
    expect(
      isVisibleAccessory({
        name: "  -- M Ben",
        parent_product_id: "parent-1",
        parent_package_id: null,
        is_package_component: true,
      })
    ).toBe(false);
  });

  it("döljer rad med parent_package_id (paketmedlem)", () => {
    expect(
      isVisibleAccessory({
        name: "Någon paketdel",
        parent_product_id: null,
        parent_package_id: "pkg-1",
        is_package_component: false,
      })
    ).toBe(false);
  });

  it("döljer `--`-prefix även utan DB-flaggor", () => {
    expect(
      isVisibleAccessory({
        name: "-- P Hatt",
        parent_product_id: "parent-1",
        parent_package_id: null,
        is_package_component: false,
      })
    ).toBe(false);
  });

  it("räknar `Multiflex 6x6` som huvudprodukt (inte barn)", () => {
    expect(
      isVisibleAccessory({
        name: "Multiflex 6x6",
        parent_product_id: null,
        parent_package_id: null,
        is_package_component: false,
      })
    ).toBe(false);
  });

  it("isPackageMemberRow fångar alla paketmedlems-signaler", () => {
    expect(isPackageMemberRow({ name: "-- P Ben" })).toBe(true);
    expect(isPackageMemberRow({ name: "  -- M Mellanstag" })).toBe(true);
    expect(isPackageMemberRow({ name: "X", is_package_component: true })).toBe(true);
    expect(isPackageMemberRow({ name: "X", parent_package_id: "pkg-1" })).toBe(true);
    expect(isPackageMemberRow({ name: "↳ Takduk" })).toBe(false);
    expect(isPackageMemberRow({ name: "Multiflex 6x6" })).toBe(false);
  });

  it("cleanName strippar paketmedlems-prefix `--`", () => {
    expect(cleanName("  -- M Ben")).toBe("M Ben");
  });

  it("cleanName strippar tillbehörs-prefix `↳`", () => {
    expect(cleanName("  ↳ M Takduk 6 meter")).toBe("M Takduk 6 meter");
  });

  it("cleanName kapar INTE bokstaven L i 'Ljusslinga'", () => {
    expect(cleanName("Ljusslinga")).toBe("Ljusslinga");
  });
});
