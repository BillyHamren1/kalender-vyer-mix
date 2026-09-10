import { describe, expect, it } from "vitest";
import type { WmsCallDeps } from "../../supabase/functions/_shared/wmsPackingList";
import { fetchScannerWmsPackingProjection } from "../../supabase/functions/_shared/scannerWmsPackingProjection";

function fakeFetch(
  reservationBody: unknown,
  packingBody: unknown,
  packingStatus = 200
): typeof fetch {
  return (async (url: string | URL | Request) => {
    const isPacking = String(url).includes("/get-packing-list?");
    const body = isPacking ? packingBody : reservationBody;
    const status = isPacking ? packingStatus : 200;
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
  baseUrl: "https://wms.invalid/functions/v1",
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
        fakeFetch(reservation, {
          reservation: { id: "res-1" },
          lines: [
            {
              line_id: "rl-1",
              type: "item_type",
              item_type_id: "it-1",
              name: "Lampa",
              required_qty: 4,
              packed_count: 2,
              parent_line_id: null,
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

  it("skickar tenant och servernyckel endast server-till-server", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push({ url: String(url), init });
      const body =
        calls.length === 1
          ? reservation
          : {
              reservation: { id: "res-1" },
              lines: [
                {
                  line_id: "rl-1",
                  type: "item_type",
                  item_type_id: "it-1",
                  required_qty: 1,
                  packed_count: 0,
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
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.init?.headers).toMatchObject({
        Authorization: "Bearer server-only-key",
        "x-organization-id": "org-1",
      });
    }
  });

  it("blockerar hela svaret när reservations-ID ändras mellan läsningarna", async () => {
    const result = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(fakeFetch(reservation, { reservation: { id: "res-2" }, lines: [] }))
    );
    expect(result).toMatchObject({
      ok: false,
      reservationId: "res-1",
      code: "wms_reservation_mismatch",
      lines: [],
    });
  });

  it("blockerar paketkomponenter som saknar egna kanoniska reservationsrad-ID:n", async () => {
    const result = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(
        fakeFetch(reservation, {
          reservation: { id: "res-1" },
          lines: [
            {
              line_id: "rl-package",
              type: "package",
              package_id: "pkg-1",
              required_qty: 3,
              packed_count: 0,
              components: [{ item_type_id: "it-component", required_qty: 3 }],
            },
          ],
        })
      )
    );
    expect(result).toMatchObject({
      ok: false,
      code: "wms_package_component_identity_missing",
      lines: [],
    });
    expect(JSON.stringify(result)).not.toContain("rl-package::it-component");
  });

  it("blockerar dubbletter och ofullständig WMS-identitet", async () => {
    const duplicate = await fetchScannerWmsPackingProjection(
      "B-100",
      deps(
        fakeFetch(reservation, {
          reservation: { id: "res-1" },
          lines: [
            { line_id: "rl-1", type: "item_type", item_type_id: "it-1" },
            { line_id: "rl-1", type: "item_type", item_type_id: "it-2" },
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
        fakeFetch(reservation, {
          reservation: { id: "res-1" },
          lines: [{ line_id: "rl-1", type: "item_type", item_type_id: null }],
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
          fakeFetch(reservation, {
            reservation: { id: "res-1" },
            lines: [
              {
                line_id: "rl-1",
                type: "item_type",
                item_type_id: "it-1",
                ...line,
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
