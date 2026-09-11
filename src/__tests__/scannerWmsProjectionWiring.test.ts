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

describe("scanner get_packing_items v2 wiring", () => {
  it("hämtar signerad projektion med kanoniskt Booking-ID", () => {
    expect(versioned).toMatch(/if \(requestsScannerContractV1\)/);
    expect(versioned).toMatch(
      /fetchScannerBundleProjection\(\s*packing\.booking_id/
    );
    expect(versioned).toMatch(
      /Deno\.env\.get\(["']EVENTFLOW_SCANNER_BUNDLE_SECRET["']\)/
    );
    expect(versioned).toMatch(
      /Deno\.env\.get\(["']BUNDLE_SUPABASE_FUNCTIONS_URL["']\)/
    );
    expect(versioned).not.toMatch(/PRICELIST_API_KEY|booking_number/);
    expect(versioned).toMatch(
      /contract_version: ["']scanner_packing_items_v2["']/
    );
  });

  it("bevarar reservation, komponent och artikeltyp som en exakt kanonisk ID-tupel", () => {
    expect(versioned).toMatch(/reservation_line_id: line\.reservationLineId/);
    expect(versioned).toMatch(
      /parent_reservation_line_id: line\.parentReservationLineId/
    );
    expect(versioned).toMatch(
      /package_component_id: line\.packageComponentId/
    );
    expect(versioned).toMatch(/inventory_type_id: line\.inventoryTypeId/);
    expect(versioned).toMatch(/allocated_instance_ids: line\.allocatedInstanceIds/);
  });

  it("förmedlar okänd WMS-status, returbevis och icke-monoton fingerprint", () => {
    expect(versioned).toMatch(/wms_snapshot:/);
    expect(versioned).toMatch(/wms_operational_status: projection\.operationalStatus/);
    expect(versioned).toMatch(/wms_return_state: projection\.returnState/);
    expect(versioned).toMatch(/wms_projection_blocked/);
    expect(versioned).not.toMatch(/active:\s*true|released:\s*true/);
  });

  it("tenant-scopear Planning-packningen före Bundle-anrop", () => {
    expect(versioned).toMatch(
      /\.eq\(["']organization_id["'], ORG_ID\)/
    );
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
