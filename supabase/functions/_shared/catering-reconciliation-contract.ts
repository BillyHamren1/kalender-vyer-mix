/** Encoding/integrity only. A valid proof is not database admission or Finance acceptance. */
export const RECONCILIATION_KEYS = {
  cursor: [
    "schema_version",
    "cursor_id",
    "operations_organization_id",
    "finance_organization_id",
    "source_stream_id",
    "snapshot_id",
    "publication_revision",
    "allocation_event_id",
    "allocation_revision",
    "snapshot_body_sha256",
  ],
  map: [
    "mapping_id",
    "mapping_revision",
    "source_project_id",
    "source_obligation_id",
    "destination_project_id",
    "currency",
  ],
  mapset: ["current_map_sha256", "retirement_map_sha256"],
  step: [
    "index",
    "publication_revision",
    "allocation_revision",
    "event_id",
    "event_fingerprint",
    "source_outbox_id",
    "source_observation_id",
    "source_mapping_id",
    "source_entry_version",
    "source_cost_fingerprint",
    "raw_entry_sha256",
    "raw_review_sha256",
    "delivery_body_sha256",
    "previous_body_sha256",
    "previous_publication_revision",
    "route_id",
    "route_revision",
    "key_id",
    "destination_capabilities_sha256",
  ],
  history: ["cursor_sha256", "step_count"],
  link: ["index", "previous_link_sha256", "step_sha256"],
  preview: [
    "schema_version",
    "organization_id",
    "destination_organization_id",
    "source_stream_id",
    "cursor_sha256",
    "history_root_sha256",
    "step_count",
    "latest_publication_revision",
    "latest_allocation_revision",
    "latest_event_id",
    "latest_observation_id",
    "latest_mapping_id",
    "latest_body_sha256",
    "route_id",
  ],
  permit: [
    "schema_version",
    "permit_id",
    "organization_id",
    "destination_organization_id",
    "source_stream_id",
    "actor_system_user_id",
    "idempotency_key",
    "reason",
    "created_at",
    "expires_at",
    "cursor_sha256",
    "preview_sha256",
    "history_root_sha256",
    "step_count",
    "expected_publication_revision",
    "expected_allocation_revision",
    "expected_event_id",
    "expected_observation_id",
    "expected_mapping_id",
    "route_id",
    "route_revision",
    "key_id",
  ],
} as const;
export type ReconciliationCommitment = keyof typeof RECONCILIATION_KEYS;
export type ReconciliationScalar = string | number | boolean | null;
export type ReconciliationFlat = Record<string, ReconciliationScalar>;
const encoder = new TextEncoder();
function fail(): never {
  throw new Error("catering_reconciliation_integrity_invalid");
}
export function safeReconciliationText(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("\0")) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
export function canonicalReconciliationFlat(
  kind: ReconciliationCommitment,
  input: unknown,
): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail();
  const object = input as Record<string, unknown>;
  if (typeof kind !== "string" || !Object.hasOwn(RECONCILIATION_KEYS, kind)) {
    fail();
  }
  const keys = RECONCILIATION_KEYS[kind];
  if (
    !keys || Object.keys(object).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(object, key))
  ) fail();
  return "{" + [...keys].sort().map((key) => {
    const value = object[key];
    if (
      !(value === null || typeof value === "boolean" ||
        safeReconciliationText(value) ||
        (typeof value === "number" && Number.isSafeInteger(value) &&
          !Object.is(value, -0)))
    ) fail();
    return JSON.stringify(key) + ":" + JSON.stringify(value);
  }).join(",") + "}";
}
export async function reconciliationRawHash(raw: string): Promise<string> {
  if (!safeReconciliationText(raw)) fail();
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(raw)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function reconciliationHash(
  kind: ReconciliationCommitment,
  input: unknown,
): Promise<string> {
  return reconciliationRawHash(
    "eventflow.catering.reconciliation." + kind + ".v1\n" +
      canonicalReconciliationFlat(kind, input),
  );
}
/** Reject duplicate keys BEFORE JSON.parse and forbid noncanonical new protocol numbers. */
export function parseReconciliationJson(
  raw: string,
  canonicalNumbers = true,
): unknown {
  if (!safeReconciliationText(raw) || encoder.encode(raw).length > 262144) {
    fail();
  }
  let offset = 0;
  const whitespace = () => {
    while (/[\x20\t\r\n]/.test(raw[offset] ?? "!")) offset++;
  };
  const string = (): string => {
    if (raw[offset++] !== '"') fail();
    const start = offset - 1;
    while (offset < raw.length) {
      const c = raw[offset++];
      if (c === '"') {
        let result: unknown;
        try {
          result = JSON.parse(raw.slice(start, offset));
        } catch {
          fail();
        }
        if (!safeReconciliationText(result)) fail();
        return result;
      }
      if (c === "\\") offset++;
    }
    return fail();
  };
  const value = (depth: number): void => {
    if (depth > 64) fail();
    whitespace();
    const c = raw[offset];
    if (c === '"') {
      string();
      return;
    }
    if (c === "{" || c === "[") {
      offset++;
      whitespace();
      const end = c === "{" ? "}" : "]";
      if (raw[offset] === end) {
        offset++;
        return;
      }
      const keys = new Set<string>();
      while (true) {
        if (c === "{") {
          whitespace();
          const key = string();
          if (keys.has(key)) fail();
          keys.add(key);
          whitespace();
          if (raw[offset++] !== ":") fail();
        }
        value(depth + 1);
        whitespace();
        if (raw[offset] === end) {
          offset++;
          return;
        }
        if (raw[offset++] !== ",") fail();
      }
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/
        .exec(raw.slice(offset))?.[0];
    if (!token) fail();
    if (/^-?[0-9]/.test(token) && !Number.isFinite(Number(token))) fail();
    if (
      canonicalNumbers && /^-?[0-9]/.test(token) &&
      (!/^-?(?:0|[1-9][0-9]*)$/.test(token) || token === "-0" ||
        !Number.isSafeInteger(Number(token)))
    ) fail();
    offset += token.length;
  };
  value(0);
  whitespace();
  if (offset !== raw.length) fail();
  try {
    return JSON.parse(raw);
  } catch {
    return fail();
  }
}
const CURSOR_PURPOSE = "operations-catering-backlog-cursor-read";
const RECEIVE_PURPOSE = "operations-catering-backlog-reconciliation-receive";
export type ReconciliationProofKind =
  | "cursor_request"
  | "cursor_response"
  | "delivery";
export function reconciliationSigningMessage(
  kind: ReconciliationProofKind,
  keyId: string,
  timestamp: string,
  nonce: string,
  raw: string,
): string {
  if (
    !["cursor_request", "cursor_response", "delivery"].includes(kind) ||
    typeof keyId !== "string" || typeof timestamp !== "string" ||
    typeof nonce !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(keyId) ||
    !/^[0-9]{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) ||
    !safeReconciliationText(raw) || encoder.encode(raw).length > 262144
  ) fail();
  const method = kind === "cursor_response" ? "RESPONSE" : "POST";
  const purpose = kind === "delivery" ? RECEIVE_PURPOSE : CURSOR_PURPOSE;
  const schema = kind === "delivery"
    ? "operations-catering-reconciliation-delivery.v1"
    : kind === "cursor_response"
    ? "operations-catering-reconciliation-cursor-proof.v1"
    : "operations-catering-reconciliation-cursor-request.v1";
  return [method, purpose, schema, keyId, timestamp, nonce, raw].join("\n");
}
export async function signReconciliationProof(
  kind: ReconciliationProofKind,
  secret: string,
  keyId: string,
  timestamp: string,
  nonce: string,
  raw: string,
): Promise<string> {
  if (!safeReconciliationText(secret) || encoder.encode(secret).length < 32) {
    fail();
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
        reconciliationSigningMessage(kind, keyId, timestamp, nonce, raw),
      ),
    ),
  );
  const prefix = kind === "delivery" ? "reconcile-v1=" : "cursor-v1=";
  return prefix +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyReconciliationProof(
  kind: ReconciliationProofKind,
  secret: string,
  keyId: string,
  timestamp: string,
  nonce: string,
  raw: string,
  signature: string,
  nowEpochSeconds: number,
): Promise<boolean> {
  if (
    !Number.isSafeInteger(nowEpochSeconds) || typeof timestamp !== "string" ||
    !/^[0-9]{10}$/.test(timestamp) ||
    Math.abs(nowEpochSeconds - Number(timestamp)) > 120 ||
    typeof signature !== "string"
  ) return false;
  try {
    const expected = await signReconciliationProof(
      kind,
      secret,
      keyId,
      timestamp,
      nonce,
      raw,
    );
    if (signature.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) {
      difference |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return difference === 0;
  } catch {
    return false;
  }
}
