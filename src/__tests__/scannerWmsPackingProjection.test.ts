import { describe, expect, it } from "vitest";
import type { WmsCallDeps } from "../../supabase/functions/_shared/wmsPackingList";
import { fetchScannerWmsPackingProjection } from "../../supabase/functions/_shared/scannerWmsPackingProjection";

function fakeFetch(
  packingBody: unknown,
  packingStatus = 200
): typeof fetch {
  return (async () => {
    const body = packingBody;
    const status = packingStatus;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as typeof fetch;
}

const deps = (fetchImpl: typeof fetch): WmsCallDeps => ({
  apiKey: "server-only-key",
  organizationId: "org-1",
  bookingId: "booking-1",
  hmacSecret: "test-secret-at-least-16-characters",
  actor: { organizationId: "org-1", personnelId: "user-1", label: "Testare" },
  deviceId: "planning-web:user-1",
  projectionUrl: "https://wms.invalid/outbound/projection",
  fetchImpl,
});

const reservation = {
  data: { reservation: { id: "res-1", status: "confirmed" } },
};

describe("fetchScannerWmsPackingProjection", () => {
  it("bevarar Bundle-ID:n och fysiska kvantiteter exakt", async () => {
    const result = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(
        fakeFetch({
          bookingId: "booking-1", reservationId: "res-1", revision: 1,
          lines: [
            {
              reservationLineId: "rl-1", kind: "line", parentLineId: null,
              itemTypeId: "it-1", label: "Lampa", requiredQuantity: 4,
              packedQuantity: 2,
            },
          ],
        })
      )
    );

    expect(result).toEqual({
      ok: true,
      reservationId: "res-1",
      code: null,
      lines: [
        {
          identityKind: "reservation_line_item_type",
          physicalKind: "direct_item",
          reservationLineId: "rl-1",
          inventoryTypeId: "it-1",
          displayName: "Lampa",
          quantityReserved: 4,
          quantityPicked: 2,
          quantityReturned: null,
          parentReservationLineId: null,
          source: "bundle_wms",
        },
      ],
    });
  });

  it("skickar signerad tenant- och actor-bunden POST endast server-till-server", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push({ url: String(url), init });
      const body = {
              bookingId: "booking-1", reservationId: "res-1", revision: 1,
              lines: [
                {
                  reservationLineId: "rl-1", kind: "line", parentLineId: null,
                  itemTypeId: "it-1", label: "Lampa", requiredQuantity: 1,
                  packedQuantity: 0,
                },
              ],
            };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
      } as Response;
    }) as typeof fetch;

    await fetchScannerWmsPackingProjection("B-100", deps(fetchImpl));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://wms.invalid/outbound/projection");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-time-timestamp": expect.any(String),
      "x-time-nonce": expect.any(String),
      "x-time-signature": expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      schema: "time-wms-outbound-projection-request.v1",
      bookingId: "booking-1",
      bookingNumber: "B-100",
      reservationId: null,
      deviceId: "planning-web:user-1",
      actor: { organizationId: "org-1", personnelId: "user-1", label: "Testare" },
    });
  });

  it("blockerar hela svaret när reservations-ID ändras mellan läsningarna", async () => {
    const result = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(fakeFetch({ bookingId: "booking-1", reservationId: "res-2", revision: 1, lines: [] }))
    );
    expect(result).toMatchObject({
      ok: false,
      reservationId: "res-2",
      code: "wms_bad_response",
      lines: [],
    });
  });

  it("bevarar paketkomponenter som kanoniska reservationsrad/artikeltyp-tupler", async () => {
    const result = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(
        fakeFetch({
          bookingId: "booking-1", reservationId: "res-1", revision: 1,
          lines: [
            {
              reservationLineId: "rl-package", kind: "group", parentLineId: null,
              label: "Paket", requiredQuantity: 3, packedQuantity: 1,
            },
            {
              reservationLineId: "rl-component", kind: "line", parentLineId: "rl-package",
              itemTypeId: "it-component", label: "Paketdel", requiredQuantity: 3,
              packedQuantity: 1,
            },
          ],
        })
      )
    );
    expect(result).toEqual({
      ok: true,
      reservationId: "res-1",
      code: null,
      lines: [
        {
          identityKind: "reservation_line_item_type",
          physicalKind: "package_component",
          reservationLineId: "rl-package",
          inventoryTypeId: "it-component",
          displayName: "Paketdel",
          quantityReserved: 3,
          quantityPicked: 1,
          quantityReturned: null,
          parentReservationLineId: null,
          source: "bundle_wms",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("rl-package::it-component");
  });

  it("blockerar dubbla paketkomponenttupler", async () => {
    const result = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(
        fakeFetch({
          bookingId: "booking-1", reservationId: "res-1", revision: 1,
          lines: [
            {
              reservationLineId: "rl-package", kind: "group", parentLineId: null,
              label: "Paket", requiredQuantity: 1, packedQuantity: 0,
            },
            {
              reservationLineId: "rl-component-1", kind: "line", parentLineId: "rl-package",
              itemTypeId: "it-1", label: "Del", requiredQuantity: 1, packedQuantity: 0,
            },
            {
              reservationLineId: "rl-component-2", kind: "line", parentLineId: "rl-package",
              itemTypeId: "it-1", label: "Del", requiredQuantity: 1, packedQuantity: 0,
            },
          ],
        })
      )
    );
    expect(result).toMatchObject({
      ok: false,
      code: "wms_duplicate_physical_identity",
      lines: [],
    });
  });

  it("blockerar dubbletter och ofullständig WMS-identitet", async () => {
    const duplicate = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(
        fakeFetch({
          bookingId: "booking-1", reservationId: "res-1", revision: 1,
          lines: [
            { reservationLineId: "rl-1", kind: "line", parentLineId: null, itemTypeId: "it-1", label: "A", requiredQuantity: 1, packedQuantity: 0 },
            { reservationLineId: "rl-1", kind: "line", parentLineId: null, itemTypeId: "it-2", label: "B", requiredQuantity: 1, packedQuantity: 0 },
          ],
        })
      )
    );
    expect(duplicate).toMatchObject({
      ok: false,
      code: "wms_duplicate_line_id",
      lines: [],
    });

    const missingType = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(
        fakeFetch({
          bookingId: "booking-1", reservationId: "res-1", revision: 1,
          lines: [{ reservationLineId: "rl-1", kind: "line", parentLineId: null, itemTypeId: null, label: "A", requiredQuantity: 1, packedQuantity: 0 }],
        })
      )
    );
    expect(missingType).toMatchObject({
      ok: false,
      code: "wms_incomplete_line_identity",
      lines: [],
    });
  });

  it("blockerar ogiltiga eller överpackade kvantiteter", async () => {
    for (const line of [
      { required_qty: 1.5, packed_count: 0 },
      { required_qty: 1, packed_count: -1 },
      { required_qty: 1, packed_count: 2 },
    ]) {
      const result = await fetchScannerWmsPackingProjection(
        "B-100",
        deps(
          fakeFetch({
            bookingId: "booking-1", reservationId: "res-1", revision: 1,
            lines: [
              {
                reservationLineId: "rl-1", kind: "line", parentLineId: null,
                itemTypeId: "it-1", label: "A",
                requiredQuantity: line.required_qty,
                packedQuantity: line.packed_count,
              },
            ],
          })
        )
      );
      expect(result).toMatchObject({
        ok: false,
        code: "wms_invalid_quantity",
        lines: [],
      });
    }
  });
});
