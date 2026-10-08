/** Integrity only. Persisted admission must independently verify these bytes and Finance-own receipt. */
import {
  parseReconciliationJson,
  reconciliationRawHash,
  safeReconciliationText,
} from "./catering-reconciliation-contract.ts";
import { cateringReconciliationTimestampMicros } from "./catering-reconciliation-cursor.ts";
export const ORIGINAL_RECEIPT_PURPOSE =
  "operations-catering-original-receipt-read";
export const ORIGINAL_RECEIPT_REQUEST_SCHEMA =
  "operations-catering-original-receipt-request.v1";
export const ORIGINAL_RECEIPT_PROOF_SCHEMA =
  "operations-catering-original-receipt-proof.v1";
const encoder = new TextEncoder();
const invalid = (): never => {
  throw new Error("catering_original_receipt_integrity_invalid");
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const REQUEST_KEYS = [
  "schema_version",
  "operations_organization_id",
  "finance_organization_id",
  "source_stream_id",
  "cursor_id",
  "cursor_sha256",
];
const PROOF_KEYS = [
  "schema_version",
  "cursor_id",
  "cursor_sha256",
  "receipt",
  "issued_at",
  "expires_at",
];
export const ORIGINAL_RECEIPT_KEYS = [
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
function exact(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid();
  const o = v as Record<string, unknown>;
  if (
    Object.keys(o).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(o, k))
  ) return invalid();
  return o;
}
export interface OriginalReceiptRequest {
  schema_version: typeof ORIGINAL_RECEIPT_REQUEST_SCHEMA;
  operations_organization_id: string;
  finance_organization_id: string;
  source_stream_id: string;
  cursor_id: string;
  cursor_sha256: string;
}
export interface OriginalReceiptExpectedCursor {
  snapshot_id: string;
  publication_revision: number;
  snapshot_body_sha256: string;
  original_receipt_schema:
    | "operations-catering-receipt.v1"
    | "operations-catering-receipt.v2";
  expires_at: string;
}
export function parseOriginalReceiptRequest(
  raw: string,
): OriginalReceiptRequest {
  const o = exact(parseReconciliationJson(raw), REQUEST_KEYS);
  if (
    o["schema_version"] !== ORIGINAL_RECEIPT_REQUEST_SCHEMA ||
    !uuid(o["operations_organization_id"]) ||
    !uuid(o["finance_organization_id"]) || !uuid(o["cursor_id"]) ||
    !hash(o["cursor_sha256"]) || typeof o["source_stream_id"] !== "string"
  ) return invalid();
  const parts = o["source_stream_id"].split(":");
  if (
    parts.length !== 3 || parts[0] !== "catering" || !parts.slice(1).every(uuid)
  ) return invalid();
  return o as unknown as OriginalReceiptRequest;
}
export function originalReceiptSigningMessage(
  kind: "request" | "response",
  keyId: string,
  timestamp: string,
  nonce: string,
  raw: string,
  requestSha256?: string,
): string {
  if (
    !["request", "response"].includes(kind) || typeof keyId !== "string" ||
    !/^[A-Za-z0-9_-]{4,64}$/.test(keyId) || typeof timestamp !== "string" ||
    !/^[0-9]{10}$/.test(timestamp) || typeof nonce !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !safeReconciliationText(raw) ||
    encoder.encode(raw).length > 262144
  ) return invalid();
  if (kind === "request") {
    if (requestSha256 !== undefined) return invalid();
    parseOriginalReceiptRequest(raw);
    return [
      "POST",
      ORIGINAL_RECEIPT_PURPOSE,
      ORIGINAL_RECEIPT_REQUEST_SCHEMA,
      keyId,
      timestamp,
      nonce,
      raw,
    ].join("\n");
  }
  if (!hash(requestSha256)) return invalid();
  return [
    "RESPONSE",
    ORIGINAL_RECEIPT_PURPOSE,
    ORIGINAL_RECEIPT_PROOF_SCHEMA,
    keyId,
    timestamp,
    nonce,
    requestSha256,
    raw,
  ].join("\n");
}
export async function signOriginalReceiptProof(
  kind: "request" | "response",
  secret: string,
  keyId: string,
  timestamp: string,
  nonce: string,
  raw: string,
  requestSha256?: string,
): Promise<string> {
  if (!safeReconciliationText(secret) || encoder.encode(secret).length < 32) {
    return invalid();
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        originalReceiptSigningMessage(
          kind,
          keyId,
          timestamp,
          nonce,
          raw,
          requestSha256,
        ),
      ),
    ),
  );
  return (kind === "request"
    ? "original-receipt-request-v1="
    : "original-receipt-response-v1=") +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyOriginalReceiptProofSignature(
  secret: string,
  keyId: string,
  timestamp: string,
  nonce: string,
  requestRaw: string,
  responseRaw: string,
  signature: unknown,
  nowEpochSeconds: number,
): Promise<boolean> {
  if (
    !Number.isSafeInteger(nowEpochSeconds) || typeof timestamp !== "string" ||
    !/^[0-9]{10}$/.test(timestamp) ||
    Math.abs(nowEpochSeconds - Number(timestamp)) > 120 ||
    typeof signature !== "string"
  ) return false;
  try {
    parseOriginalReceiptRequest(requestRaw);
    const expected = await signOriginalReceiptProof(
      "response",
      secret,
      keyId,
      timestamp,
      nonce,
      responseRaw,
      await reconciliationRawHash(requestRaw),
    );
    if (signature.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}
/** The expected cursor and local receipt are not authority. SQL must use its own verified saved records. */
export function validateOriginalReceiptResponse(
  raw: string,
  request: OriginalReceiptRequest,
  expected: OriginalReceiptExpectedCursor,
  localSavedReceipt: unknown,
  nowMilliseconds: number,
): Record<string, unknown> {
  parseOriginalReceiptRequest(JSON.stringify(request));
  if (
    !Number.isSafeInteger(nowMilliseconds) || !uuid(expected.snapshot_id) ||
    !hash(expected.snapshot_body_sha256) ||
    !Number.isSafeInteger(expected.publication_revision) ||
    expected.publication_revision < 1 ||
    !["operations-catering-receipt.v1", "operations-catering-receipt.v2"]
      .includes(expected.original_receipt_schema)
  ) return invalid();
  const proof = exact(parseReconciliationJson(raw), PROOF_KEYS);
  if (
    proof["schema_version"] !== ORIGINAL_RECEIPT_PROOF_SCHEMA ||
    proof["cursor_id"] !== request.cursor_id ||
    proof["cursor_sha256"] !== request.cursor_sha256 ||
    proof["expires_at"] !== expected.expires_at
  ) return invalid();
  const issued = cateringReconciliationTimestampMicros(proof["issued_at"]),
    expiry = cateringReconciliationTimestampMicros(proof["expires_at"]),
    now = BigInt(nowMilliseconds) * 1000n;
  if (
    issued > now || now >= expiry || issued >= expiry ||
    expiry - issued > 60000000n
  ) return invalid();
  const receipt = exact(proof["receipt"], ORIGINAL_RECEIPT_KEYS),
    local = exact(localSavedReceipt, ORIGINAL_RECEIPT_KEYS);
  if (
    receipt["schema"] !== expected.original_receipt_schema ||
    !["accepted", "replayed"].includes(receipt["outcome"] as string) ||
    typeof receipt["outcome"] !== "string" || receipt["shadow_only"] !== true ||
    receipt["source_organization_id"] !== request.operations_organization_id ||
    receipt["destination_organization_id"] !==
      request.finance_organization_id ||
    receipt["source_stream_id"] !== request.source_stream_id ||
    !uuid(receipt["receipt_id"]) ||
    receipt["snapshot_receipt_id"] !== expected.snapshot_id ||
    receipt["request_body_sha256"] !== expected.snapshot_body_sha256 ||
    receipt["snapshot_fingerprint"] !== expected.snapshot_body_sha256
  ) return invalid();
  for (
    const k of [
      "requested_source_revision",
      "applied_source_revision",
      "current_source_revision",
    ]
  ) if (receipt[k] !== expected.publication_revision) return invalid();
  for (const k of ORIGINAL_RECEIPT_KEYS) {
    if (receipt[k] !== local[k]) return invalid();
  }
  return proof;
}
