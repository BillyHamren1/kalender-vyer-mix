import { describe, expect, it, vi } from "vitest";
import {
  fetchScannerBundleProjection,
  SCANNER_BUNDLE_PROJECTION_SCHEMA,
} from "../../supabase/functions/_shared/scannerBundleProjection";

const ORG = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const RESERVATION = "33333333-3333-4333-8333-333333333333";
const LINE = "44444444-4444-4444-8444-444444444444";
const TYPE = "55555555-5555-4555-8555-555555555555";
const COMPONENT = "66666666-6666-4666-8666-666666666666";

const response = {
  schema: SCANNER_BUNDLE_PROJECTION_SCHEMA,
  canonicalIdentity: { organizationId: ORG, bookingId: BOOKING, reservationId: RESERVATION },
  snapshot: { kind: "CONTENT_SHA256", fingerprint: "a".repeat(64), monotonic: false },
  operationalStatus: { rawReservationStatus: "confirmed", active: null, released: null },
  returnState: { authoritative: false, returnedQuantity: null },
  blockers: [{ code: "PACKAGE_COMPONENT_HAS_NO_RESERVATION_LINE_ID", entityId: COMPONENT }],
  lines: [{
    reservationLineId: LINE,
    packageId: "77777777-7777-4777-8777-777777777777",
    physicalLines: [{
      packageComponentId: COMPONENT,
      inventoryTypeId: TYPE,
      requiredQuantity: 2,
      packedQuantity: 1,
      returnedQuantity: null,
      allocatedInstanceIds: ["88888888-8888-4888-8888-888888888888"],
    }],
  }],
};

const deps = (fetchImpl: typeof fetch) => ({
  baseUrl: "https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1",
  secret: "scanner-bundle-secret-at-least-32-characters",
  organizationId: ORG,
  fetchImpl,
  now: () => 1_789_000_000_000,
  nonce: () => "nonce_scanner_projection_123456",
});

describe("Planning -> Bundle Scanner projection", () => {
  it("signerar det kanoniska Booking-ID:t och bevarar paketkomponentens blockerade identitet", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response), { status: 200 }));
    const result = await fetchScannerBundleProjection(BOOKING, deps(fetchImpl));
    expect(result).toMatchObject({ ok: true, reservationId: RESERVATION, bookingId: BOOKING });
    if (result.ok === false) throw new Error(result.error);
    expect(result.lines[0]).toMatchObject({
      reservationLineId: null,
      parentReservationLineId: LINE,
      packageComponentId: COMPONENT,
      inventoryTypeId: TYPE,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("eventflow-scanner-projection-v1");
    expect(JSON.parse(String(init?.body))).toEqual({
      schema: "eventflow-scanner-bundle-projection-request.v1",
      organizationId: ORG,
      bookingId: BOOKING,
    });
    expect((init?.headers as Record<string, string>)["x-scanner-signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it("avvisar korskopplat tenant-/Booking-svar och påhittad monoton revision", async () => {
    for (const invalid of [
      { ...response, canonicalIdentity: { ...response.canonicalIdentity, bookingId: RESERVATION } },
      { ...response, snapshot: { ...response.snapshot, monotonic: true } },
    ]) {
      const result = await fetchScannerBundleProjection(BOOKING, deps(async () =>
        new Response(JSON.stringify(invalid), { status: 200 })));
      expect(result).toMatchObject({ ok: false, code: "bundle_bad_response" });
    }
  });

  it("stoppar före nätverk när secret eller kanoniskt ID saknas", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchScannerBundleProjection("planning-local", deps(fetchImpl as typeof fetch)))
      .resolves.toMatchObject({ ok: false, code: "invalid_canonical_id" });
    await expect(fetchScannerBundleProjection(BOOKING, { ...deps(fetchImpl as typeof fetch), secret: "" }))
      .resolves.toMatchObject({ ok: false, code: "bundle_signing_unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
