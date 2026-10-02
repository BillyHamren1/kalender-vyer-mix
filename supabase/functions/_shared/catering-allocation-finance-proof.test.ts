import { describe, expect, it } from "vitest";
import {
  type CateringAllocationDeliveryScope,
  cateringAllocationSignatureMessage,
  createCateringAllocationSignature,
  validateCateringAllocationReceipt,
} from "./catering-allocation-finance-proof.ts";
const id = (n: number) =>
  `96000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope: CateringAllocationDeliveryScope = {
  organization_id: id(1),
  source_stream_id: `catering:${id(3)}:${id(5)}`,
  source_revision: 3,
  destination_organization_id: id(30),
  body_sha256: "a".repeat(64),
};
function receipt() {
  return {
    schema: "operations-catering-receipt.v2",
    outcome: "accepted",
    source_organization_id: scope.organization_id,
    source_stream_id: scope.source_stream_id,
    requested_source_revision: 3,
    applied_source_revision: 3,
    current_source_revision: 3,
    request_body_sha256: scope.body_sha256,
    snapshot_receipt_id: id(43),
    snapshot_fingerprint: scope.body_sha256,
    receipt_id: id(44),
    destination_organization_id: scope.destination_organization_id,
    shadow_only: true,
  };
}
describe("dedicated native allocation-v2 proof", () => {
  it("binds a distinct route/purpose and exact original raw bytes", async () => {
    const input = {
      secret: "isolated-only-allocation-hmac-at-least32",
      keyId: "allocation-v2-key",
      timestamp: "1790899200",
      nonce: "allocation-fixture-nonce1",
      rawBody: '{"a":"å"}',
    };
    const signature = await createCateringAllocationSignature(input);
    expect(signature).toMatch(/^v2=[0-9a-f]{64}$/);
    expect(
      cateringAllocationSignatureMessage(
        input.keyId,
        input.timestamp,
        input.nonce,
        input.rawBody,
      ).split("\n").slice(0, 3),
    ).toEqual([
      "POST",
      "operations-catering-allocation-cost-receive",
      "operations-catering-delivery.v2",
    ]);
    expect(
      await createCateringAllocationSignature({
        ...input,
        rawBody: '{ "a":"å"}',
      }),
    ).not.toBe(signature);
    expect(
      await createCateringAllocationSignature({
        ...input,
        keyId: "different-v2-key",
      }),
    ).not.toBe(signature);
  });
  it("rejects wrong proof types and oversized UTF8 rather than character counts", async () => {
    const input = {
      secret: "isolated-only-allocation-hmac-at-least32",
      keyId: "allocation-v2-key",
      timestamp: "1790899200",
      nonce: "allocation-fixture-nonce1",
      rawBody: "{}",
    };
    for (
      const change of [
        { secret: "short" },
        { keyId: [input.keyId] },
        { timestamp: 1790899200 },
        { nonce: [input.nonce] },
        { rawBody: "å".repeat(131073) },
      ]
    ) {
      await expect(
        createCateringAllocationSignature(
          { ...input, ...change } as typeof input,
        ),
      ).rejects.toThrow();
    }
  });
  it("accepts exact13 accepted and historical replay binding to original request hash", () => {
    expect(validateCateringAllocationReceipt(receipt(), scope)).toEqual(
      receipt(),
    );
    expect(
      validateCateringAllocationReceipt({
        ...receipt(),
        outcome: "replayed",
        current_source_revision: 5,
      }, scope).applied_source_revision,
    ).toBe(3);
  });
  it("requires stale to identify the actual newer snapshot rather than original body", () => {
    expect(
      validateCateringAllocationReceipt({
        ...receipt(),
        outcome: "stale",
        applied_source_revision: 5,
        current_source_revision: 5,
        snapshot_fingerprint: "b".repeat(64),
      }, scope).current_source_revision,
    ).toBe(5);
    expect(() =>
      validateCateringAllocationReceipt({
        ...receipt(),
        outcome: "stale",
        applied_source_revision: 5,
        current_source_revision: 5,
      }, scope)
    ).toThrow();
  });
  it("rejects unknown fields, native-org substitution, coercion and missing request-body binding", () => {
    for (
      const change of [
        { extra: true },
        { schema: "operations-catering-receipt.v1" },
        { source_organization_id: id(3) },
        { destination_organization_id: id(99) },
        { snapshot_receipt_id: [id(43)] },
        { requested_source_revision: "3" },
        { request_body_sha256: "b".repeat(64) },
        { shadow_only: "true" },
        { applied_source_revision: null },
        { outcome: null },
        { snapshot_fingerprint: "b".repeat(64) },
      ]
    ) {
      expect(() =>
        validateCateringAllocationReceipt({ ...receipt(), ...change }, scope)
      ).toThrow();
    }
  });
});
