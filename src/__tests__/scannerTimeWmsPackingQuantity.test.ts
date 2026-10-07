import { describe, expect, it } from "vitest";
import { mapTimeWmsProjectionForScanner } from "../../supabase/functions/_shared/scannerTimeWmsPacking";

const source = (fields: Record<string, unknown>) => ({
  reservationId: "reservation", reservationStatus: "confirmed", updatedAt: "2026-10-07T08:00:00.000Z",
  lines: [{ reservationLineId: "line", itemTypeId: "type", requiredQuantity: 10,
    packedQuantity: 7, manualPackedQuantity: 4, allocatedQuantity: 3,
    stockAvailableQuantity: null, ...fields }],
});

describe("manual and scanned packing evidence", () => {
  it("preserves manual and individual amounts separately and keeps unknown stock null", () => {
    const result = mapTimeWmsProjectionForScanner(source({}));
    expect(result.lines[0]).toMatchObject({ quantity_picked: 7, manual_packed_quantity: 4,
      allocated_quantity: 3, stock_available_quantity: null });
  });
  it("does not infer manual allowance from the aggregate packed amount on older owners", () => {
    const result = mapTimeWmsProjectionForScanner(source({ manualPackedQuantity: undefined,
      allocatedQuantity: undefined, stockAvailableQuantity: undefined }));
    expect(result.lines[0]).toMatchObject({ quantity_picked: 7, manual_packed_quantity: null,
      allocated_quantity: null, stock_available_quantity: null });
  });
  it("retains an explicit zero distinct from unknown", () => {
    expect(mapTimeWmsProjectionForScanner(source({ manualPackedQuantity: 0,
      stockAvailableQuantity: 0 })).lines[0]).toMatchObject({ manual_packed_quantity: 0,
      stock_available_quantity: 0 });
  });
});
