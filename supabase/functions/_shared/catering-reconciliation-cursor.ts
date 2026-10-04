/** Signed Finance observation integrity. Database admission must independently verify/cache bytes. */
import {
  parseReconciliationJson,
  reconciliationHash,
  verifyReconciliationProof,
} from "./catering-reconciliation-contract.ts";
export interface CateringReconciliationCursorScope {
  operations_organization_id: string;
  finance_organization_id: string;
  source_stream_id: string;
}
export interface CateringReconciliationCursorProof {
  cursor: {
    schema_version: "operations-catering-reconciliation-cursor.v1";
    cursor_id: string;
    operations_organization_id: string;
    finance_organization_id: string;
    source_stream_id: string;
    snapshot_id: string;
    publication_revision: number;
    allocation_event_id: string | null;
    allocation_revision: number;
    snapshot_body_sha256: string;
  };
  cursor_sha256: string;
  issued_at: string;
  expires_at: string;
}
const invalid = (): never => {
  throw new Error("catering_reconciliation_cursor_invalid");
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid();
  return v as Record<string, unknown>;
}
export function cateringReconciliationTimestampMicros(v: unknown): bigint {
  if (
    typeof v !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(
      v,
    )
  ) return invalid();
  const millis = Date.parse(v);
  if (
    !Number.isFinite(millis) ||
    new Date(millis).toISOString() !== v.slice(0, 23) + "Z"
  ) return invalid();
  return BigInt(millis) * 1000n + BigInt(v.slice(23, 26));
}
export async function validateCateringReconciliationCursorProof(
  raw: string,
  scope: CateringReconciliationCursorScope,
  nowMilliseconds: number,
): Promise<CateringReconciliationCursorProof> {
  if (
    !uuid(scope.operations_organization_id) ||
    !uuid(scope.finance_organization_id) ||
    typeof scope.source_stream_id !== "string" ||
    !/^catering:[0-9a-f-]{36}:[0-9a-f-]{36}$/.test(scope.source_stream_id) ||
    !scope.source_stream_id.split(":").slice(1).every(uuid) ||
    !Number.isSafeInteger(nowMilliseconds)
  ) return invalid();
  const p = object(parseReconciliationJson(raw));
  if (
    Object.keys(p).length !== 4 ||
    !["cursor", "cursor_sha256", "issued_at", "expires_at"].every((k) =>
      Object.hasOwn(p, k)
    ) || !hash(p["cursor_sha256"])
  ) return invalid();
  const c = object(p["cursor"]);
  // Exact ten-field shape and canonical scalar grammar enforced by the domain-specific commitment helper.
  const expected = await reconciliationHash("cursor", c);
  if (
    expected !== p["cursor_sha256"] ||
    c["schema_version"] !== "operations-catering-reconciliation-cursor.v1" ||
    !uuid(c["cursor_id"]) || !uuid(c["snapshot_id"]) ||
    !hash(c["snapshot_body_sha256"]) ||
    c["operations_organization_id"] !== scope.operations_organization_id ||
    c["finance_organization_id"] !== scope.finance_organization_id ||
    c["source_stream_id"] !== scope.source_stream_id ||
    typeof c["publication_revision"] !== "number" ||
    !Number.isSafeInteger(c["publication_revision"]) ||
    c["publication_revision"] < 1 ||
    typeof c["allocation_revision"] !== "number" ||
    !Number.isSafeInteger(c["allocation_revision"]) ||
    c["allocation_revision"] < 0 ||
    (c["allocation_revision"] === 0
      ? c["allocation_event_id"] !== null
      : !uuid(c["allocation_event_id"]))
  ) return invalid();
  const issued = cateringReconciliationTimestampMicros(p["issued_at"]),
    expires = cateringReconciliationTimestampMicros(p["expires_at"]);
  const now = BigInt(nowMilliseconds) * 1000n;
  if (expires - issued !== 60_000_000n || now < issued || now >= expires) {
    return invalid();
  }
  return p as unknown as CateringReconciliationCursorProof;
}
export async function verifySignedCateringReconciliationCursor(input: {
  raw: string;
  secret: string;
  keyId: string;
  timestamp: string;
  requestNonce: string;
  signature: string;
  scope: CateringReconciliationCursorScope;
  nowMilliseconds: number;
}): Promise<CateringReconciliationCursorProof> {
  if (
    !(await verifyReconciliationProof(
      "cursor_response",
      input.secret,
      input.keyId,
      input.timestamp,
      input.requestNonce,
      input.raw,
      input.signature,
      Math.floor(input.nowMilliseconds / 1000),
    ))
  ) return invalid();
  return validateCateringReconciliationCursorProof(
    input.raw,
    input.scope,
    input.nowMilliseconds,
  );
}
