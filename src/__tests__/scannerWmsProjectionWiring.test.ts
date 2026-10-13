import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapTimeWmsProjectionForScanner } from "../../supabase/functions/_shared/scannerTimeWmsPacking";

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
  it("hämtar signerad Time-WMS-projektion med Booking-ID och verifierad aktör", () => {
    expect(versioned).toMatch(/if \(requestsScannerContractV1\)/);
    expect(versioned).toMatch(/fetchTimeWmsProjection\(\s*buildTimeWmsProjectionRequest\(/);
    expect(versioned).toContain("bookingId: packing.booking_id, bookingNumber");
    expect(versioned).toContain("organizationId: ORG_ID, personnelId: auth.staffId, label: auth.staffName");
    expect(versioned).toContain('Deno.env.get("PLANNING_WMS_HMAC_SECRET")');
    expect(versioned).not.toMatch(/PRICELIST_API_KEY|fetchScannerBundleProjection/);
    expect(versioned).toContain('contract_version: "scanner_packing_items_v2"');
    expect(versioned).toContain('if (!bookingNumber) return fail("planning_booking_number_missing", 404)');
    expect(versioned).toContain("if (!wms.ok) return fail(wms.code, 503)");
  });

  it("bevarar reservation, komponent och artikeltyp genom den aktiva mappningen", () => {
    expect(versioned).toContain("mapTimeWmsProjectionForScanner(wms.body)");
    expect(versioned).toContain("blockers: p.blockers, lines: p.lines");
    const result = mapTimeWmsProjectionForScanner({
      reservationId: "reservation", reservationStatus: "confirmed", revision: 7,
      lines: [{ reservationLineId: "line", parentLineId: "parent",
        packageComponentId: "component", packageId: "package", itemTypeId: "type",
        requiredQuantity: 5, packedQuantity: 2, isPackable: false }],
    });
    expect(result.blockers).toEqual([]);
    expect(result.lines).toEqual([expect.objectContaining({
      reservation_id: "reservation", reservation_line_id: "line",
      parent_reservation_line_id: "parent", package_component_id: "component",
      package_id: "package", inventory_type_id: "type", is_packable: false,
      quantity_reserved: 5, quantity_picked: 2,
    })]);
  });

  it("förmedlar ägarens status och revision utan påhittade returbevis", () => {
    expect(versioned).toContain("wms_reservation_status: p.reservationStatus");
    expect(versioned).toContain("wms_reservation_revision: p.reservationRevision");
    expect(versioned).toContain("wms_reservation_updated_at: p.reservationUpdatedAt");
    expect(versioned).toContain('p.blockers.length > 0 ? "wms_projection_blocked" : null');
    expect(versioned).not.toMatch(/active:\s*true|released:\s*true/);
    const result = mapTimeWmsProjectionForScanner({ reservationId: "reservation",
      lines: [{ reservationLineId: "line", itemTypeId: "type" }] });
    expect(result.reservationStatus).toBeNull();
    expect(result.reservationRevision).toBeNull();
    expect(result.blockers).toEqual([
      { code: "wms_reservation_status_unknown", entity_id: "reservation" },
      { code: "wms_reservation_version_unknown", entity_id: "reservation" },
    ]);
    expect(result.lines[0].quantity_returned).toBeNull();
  });

  it("spärrar ofullständig och duplicerad identitet utan att dubblera antal", () => {
    const result = mapTimeWmsProjectionForScanner({ reservationId: "reservation",
      reservationStatus: "confirmed", revision: 1,
      lines: [{ itemTypeId: "missing-line" },
        { reservationLineId: "line", itemTypeId: "type", requiredQuantity: 2 },
        { reservationLineId: "line", itemTypeId: "type", requiredQuantity: 2 }],
    });
    expect(result.blockers).toEqual([
      { code: "wms_incomplete_line_identity", entity_id: null },
      { code: "wms_duplicate_line_id", entity_id: "line" },
    ]);
    expect(result.lines).toHaveLength(1);
  });

  it("tenant-scopear Planning-packningen före WMS-anrop", () => {
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
