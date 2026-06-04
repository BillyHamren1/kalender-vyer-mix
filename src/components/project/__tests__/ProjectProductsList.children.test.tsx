import { describe, it, expect } from "vitest";
import { isVisibleAccessory, cleanName } from "../ProjectProductsList";

describe("ProjectProductsList — barnrader (paketmedlemmar + tillbehör)", () => {
  it("räknar `-- M Ben` (is_package_component=true, parent_product_id satt) som barn att visa", () => {
    const row = {
      name: "  -- M Ben",
      parent_product_id: "parent-1",
      parent_package_id: null,
      is_package_component: true,
    };
    expect(isVisibleAccessory(row)).toBe(true);
  });

  it("räknar `↳ M Takduk` med parent_product_id som barn att visa", () => {
    const row = {
      name: "  ↳ M Takduk 6 meter",
      parent_product_id: "parent-1",
      parent_package_id: null,
      is_package_component: false,
    };
    expect(isVisibleAccessory(row)).toBe(true);
  });

  it("räknar rad med endast parent_package_id som barn att visa", () => {
    const row = {
      name: "Något tillbehör",
      parent_product_id: null,
      parent_package_id: "pkg-1",
      is_package_component: false,
    };
    expect(isVisibleAccessory(row)).toBe(true);
  });

  it("räknar legacy rad med namn-prefix `L,` som barn", () => {
    const row = {
      name: "L, gammal rad utan FK",
      parent_product_id: null,
      parent_package_id: null,
      is_package_component: false,
    };
    expect(isVisibleAccessory(row)).toBe(true);
  });

  it("räknar `Multiflex 6x6` som icke-barn (huvudprodukt)", () => {
    const row = {
      name: "Multiflex 6x6",
      parent_product_id: null,
      parent_package_id: null,
      is_package_component: false,
    };
    expect(isVisibleAccessory(row)).toBe(false);
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
