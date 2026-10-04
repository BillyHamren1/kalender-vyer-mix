/** Dedicated allocation-v2 bytes/purpose/receipt. No cost or forecast calculation. */
export interface CateringAllocationDeliveryScope {
  organization_id: string;
  source_stream_id: string;
  source_revision: number;
  destination_organization_id: string;
  body_sha256: string;
}
export interface CateringAllocationFinanceReceipt {
  schema: "operations-catering-receipt.v2";
  outcome: "accepted" | "replayed" | "stale";
  source_organization_id: string;
  source_stream_id: string;
  requested_source_revision: number;
  applied_source_revision: number;
  current_source_revision: number;
  request_body_sha256: string;
  snapshot_receipt_id: string;
  snapshot_fingerprint: string;
  receipt_id: string;
  destination_organization_id: string;
  shadow_only: true;
}
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const revision = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const fail = (): never => {
  throw new Error("invalid_catering_allocation_transport_proof");
};
export function cateringAllocationSignatureMessage(
  keyId: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return [
    "POST",
    "operations-catering-allocation-cost-receive",
    "operations-catering-delivery.v2",
    keyId,
    timestamp,
    nonce,
    rawBody,
  ].join("\n");
}
export async function createCateringAllocationSignature(
  input: {
    secret: string;
    keyId: string;
    timestamp: string;
    nonce: string;
    rawBody: string;
  },
): Promise<string> {
  const { secret, keyId, timestamp, nonce, rawBody } = input;
  if (
    typeof secret !== "string" ||
    new TextEncoder().encode(secret).length < 32 || typeof keyId !== "string" ||
    !/^[A-Za-z0-9_-]{4,64}$/.test(keyId) || typeof timestamp !== "string" ||
    !/^\d{10}$/.test(timestamp) || typeof nonce !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || typeof rawBody !== "string" ||
    new TextEncoder().encode(rawBody).length > 262144
  ) return fail();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      cateringAllocationSignatureMessage(keyId, timestamp, nonce, rawBody),
    ),
  );
  return "v2=" +
    Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
      .join("");
}
export function validateCateringAllocationReceipt(
  value: unknown,
  scope: CateringAllocationDeliveryScope,
): CateringAllocationFinanceReceipt {
  if (
    !uuid(scope.organization_id) || !uuid(scope.destination_organization_id) ||
    !revision(scope.source_revision) || !hash(scope.body_sha256) ||
    typeof scope.source_stream_id !== "string" ||
    !/^catering:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      .test(scope.source_stream_id)
  ) return fail();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail();
  }
  const x = value as Record<string, unknown>;
  const keys = [
    "schema",
    "outcome",
    "source_organization_id",
    "source_stream_id",
    "requested_source_revision",
    "applied_source_revision",
    "current_source_revision",
    "request_body_sha256",
    "snapshot_receipt_id",
    "snapshot_fingerprint",
    "receipt_id",
    "destination_organization_id",
    "shadow_only",
  ];
  if (
    Object.keys(x).length !== 13 || keys.some((k) => !Object.hasOwn(x, k)) ||
    x["schema"] !== "operations-catering-receipt.v2" ||
    x["shadow_only"] !== true ||
    x["source_organization_id"] !== scope.organization_id ||
    x["destination_organization_id"] !== scope.destination_organization_id ||
    x["source_stream_id"] !== scope.source_stream_id ||
    x["requested_source_revision"] !== scope.source_revision ||
    x["request_body_sha256"] !== scope.body_sha256 ||
    !uuid(x["snapshot_receipt_id"]) || !uuid(x["receipt_id"]) ||
    !hash(x["snapshot_fingerprint"]) ||
    !revision(x["applied_source_revision"]) ||
    !revision(x["current_source_revision"])
  ) return fail();
  if (x["outcome"] === "stale") {
    if (
      x["applied_source_revision"] !== x["current_source_revision"] ||
      x["current_source_revision"] <= scope.source_revision ||
      x["snapshot_fingerprint"] === scope.body_sha256
    ) return fail();
  } else if (x["outcome"] === "accepted" || x["outcome"] === "replayed") {
    if (
      x["applied_source_revision"] !== scope.source_revision ||
      x["current_source_revision"] < scope.source_revision ||
      (x["outcome"] === "accepted" &&
        x["current_source_revision"] !== scope.source_revision) ||
      x["snapshot_fingerprint"] !== scope.body_sha256
    ) return fail();
  } else return fail();
  return { ...x } as unknown as CateringAllocationFinanceReceipt;
}
