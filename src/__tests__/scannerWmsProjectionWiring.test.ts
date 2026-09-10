import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/scanner-api/index.ts", "utf8");
const getItems = source.slice(
  Math.max(
    source.indexOf("case 'get_packing_items'"),
    source.indexOf('case "get_packing_items"')
  ),
  source.indexOf("case 'repair_packing_items'")
);
const versioned = getItems.slice(0, getItems.indexOf("// Validation only"));

describe("scanner get_packing_items v1 wiring", () => {
  it("hämtar versionerade rader direkt från Bundle/WMS", () => {
    expect(versioned).toMatch(/if \(requestsScannerContractV1\)/);
    expect(versioned).toMatch(
      /fetchScannerWmsPackingProjection\(\s*bookingNumber/
    );
    expect(versioned).toMatch(/Deno\.env\.get\(["']PRICELIST_API_KEY["']\)/);
    expect(versioned).toMatch(
      /contract_version: ["']scanner_packing_items_v1["']/
    );
    expect(versioned).toMatch(/reservation_line_id: line\.reservationLineId/);
    expect(versioned).toMatch(/inventory_type_id: line\.inventoryTypeId/);
  });

  it("tenant-scopear både packning och bokning före WMS-anrop", () => {
    const scopes =
      versioned.match(/\.eq\(["']organization_id["'], ORG_ID\)/g) ?? [];
    expect(scopes.length).toBeGreaterThanOrEqual(2);
  });

  it("versionerad läsning muterar aldrig Planning och använder inga lokala rader", () => {
    expect(versioned).not.toMatch(/from\('packing_list_items'\)/);
    expect(versioned).not.toMatch(/from\('booking_products'\)/);
    expect(versioned).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it("legacy-läsningen finns kvar efter den isolerade versionerade returen", () => {
    const legacy = getItems.slice(getItems.indexOf("// Validation only"));
    expect(legacy).toMatch(/from\('packing_list_items'\)/);
    expect(legacy).toMatch(/booking_products/);
  });
});
