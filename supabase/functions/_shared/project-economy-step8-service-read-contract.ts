/**
 * Versioned, purpose-bound contract for Finance -> Operations Step 8 reads.
 *
 * This module deliberately contains no key material and performs no authorization.
 * Finance signs the request; the Operations database verifies it and signs the
 * response. The Edge function only validates and preserves canonical bytes.
 */
export const STEP8_SERVICE_READ_ROUTE =
  "/functions/v1/project-economy-step8-service-read";
export const STEP8_SERVICE_READ_PROTOCOL =
  "eventflow-project-economy-step8-read.v1";
export const STEP8_REQUEST_SCHEMA =
  "eventflow.finance.operations-project-economy-read-request.v1";
export const STEP8_RESPONSE_SCHEMA =
  "eventflow.operations.project-economy-read-response.v1";
export const STEP8_REQUEST_ISSUER = "eventflow-finance";
export const STEP8_REQUEST_AUDIENCE =
  "eventflow-operations-project-economy-step8";
export const STEP8_RESPONSE_ISSUER = "eventflow-operations";
export const STEP8_RESPONSE_AUDIENCE =
  "eventflow-finance-project-economy-step8";
export const STEP8_REQUEST_MAX_BYTES = 4 * 1024;
export const STEP8_PAYLOAD_MAX_BYTES = 256 * 1024;
export const STEP8_RESPONSE_MAX_BYTES = 300 * 1024;
// PostgREST JSON-escapes rawBody once. Twice the signed response bound plus
// narrow envelope overhead is sufficient; larger responses are amplification.
export const STEP8_BACKEND_ENVELOPE_MAX_BYTES = 700 * 1024;
export const STEP8_MAX_TTL_SECONDS = 60;
export const STEP8_MAX_CLOCK_LEAD_SECONDS = 5;
export const STEP8_MAX_AUTH_AGE_SECONDS = 60;

const encoder = new TextEncoder();
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const KEY_ID = /^[A-Za-z0-9_-]{4,64}$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE = /^hmac-sha256=[0-9a-f]{64}$/;

export const STEP8_REQUEST_KEYS = [
  "actorSubjectHash",
  "audience",
  "authCheckedAt",
  "destinationOrganizationId",
  "destinationProjectId",
  "expiresAt",
  "issuedAt",
  "issuer",
  "mappingBasis",
  "nonce",
  "operation",
  "requestId",
  "schemaVersion",
  "shadowOnly",
  "sourceCount",
  "sourceOrganizationId",
  "sourceProjectId",
  "sourceSetFingerprint",
] as const;

export interface Step8ServiceReadRequest {
  actorSubjectHash: string;
  audience: typeof STEP8_REQUEST_AUDIENCE;
  authCheckedAt: number;
  destinationOrganizationId: string;
  destinationProjectId: string;
  expiresAt: number;
  issuedAt: number;
  issuer: typeof STEP8_REQUEST_ISSUER;
  mappingBasis: "finance_local_current_component_map";
  nonce: string;
  operation: "read";
  requestId: string;
  schemaVersion: typeof STEP8_REQUEST_SCHEMA;
  shadowOnly: true;
  sourceCount: number;
  sourceOrganizationId: string;
  sourceProjectId: string;
  sourceSetFingerprint: string;
}

export interface Step8RequestHeaders {
  method: "POST";
  route: typeof STEP8_SERVICE_READ_ROUTE;
  protocol: typeof STEP8_SERVICE_READ_PROTOCOL;
  issuer: typeof STEP8_REQUEST_ISSUER;
  audience: typeof STEP8_REQUEST_AUDIENCE;
  requestKeyId: string;
  requestKeyVersion: number;
  requestId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  bodySha256: string;
  actorSubjectHash: string;
  authCheckedAt: number;
  signature: string;
}

export interface Step8ServiceReadResponse {
  audience: typeof STEP8_RESPONSE_AUDIENCE;
  destinationOrganizationId: string;
  destinationProjectId: string;
  expiresAt: number;
  issuedAt: number;
  issuer: typeof STEP8_RESPONSE_ISSUER;
  nonce: string;
  outcome: "available" | "unavailable";
  payload: Record<string, unknown> | null;
  payloadSha256: string | null;
  requestBodySha256: string;
  requestId: string;
  requestNonceSha256: string;
  schemaVersion: typeof STEP8_RESPONSE_SCHEMA;
  shadowOnly: true;
  sourceOrganizationId: string;
  sourceProjectId: string;
  sourceSetFingerprint: string;
}

export const STEP8_RESPONSE_KEYS = [
  "audience",
  "destinationOrganizationId",
  "destinationProjectId",
  "expiresAt",
  "issuedAt",
  "issuer",
  "nonce",
  "outcome",
  "payload",
  "payloadSha256",
  "requestBodySha256",
  "requestId",
  "requestNonceSha256",
  "schemaVersion",
  "shadowOnly",
  "sourceOrganizationId",
  "sourceProjectId",
  "sourceSetFingerprint",
] as const;

export interface Step8ResponseHeaders {
  protocol: typeof STEP8_SERVICE_READ_PROTOCOL;
  issuer: typeof STEP8_RESPONSE_ISSUER;
  audience: typeof STEP8_RESPONSE_AUDIENCE;
  responseKeyId: string;
  responseKeyVersion: number;
  requestId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  bodySha256: string;
  requestBodySha256: string;
  requestNonceSha256: string;
  signature: string;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) =>
    Object.hasOwn(value, key)
  );
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function canonicalValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("non_canonical_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort().map((key) => {
      const item = record[key];
      if (item === undefined) throw new Error("non_canonical_value");
      return `${JSON.stringify(key)}:${canonicalValue(item)}`;
    });
    return `{${entries.join(",")}}`;
  }
  throw new Error("non_canonical_value");
}

export function canonicalJson(value: unknown): string {
  return canonicalValue(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function parseCanonicalObject(rawBody: string): Record<string, unknown> {
  if (!rawBody || encoder.encode(rawBody).byteLength > STEP8_REQUEST_MAX_BYTES) {
    throw new Error("invalid_request_body");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("invalid_request_body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_request_body");
  }
  if (canonicalJson(parsed) !== rawBody) throw new Error("non_canonical_body");
  return parsed as Record<string, unknown>;
}

export function validateStep8RequestBody(
  rawBody: string,
): Step8ServiceReadRequest {
  const value = parseCanonicalObject(rawBody);
  if (
    !exactKeys(value, STEP8_REQUEST_KEYS) ||
    value.schemaVersion !== STEP8_REQUEST_SCHEMA ||
    value.issuer !== STEP8_REQUEST_ISSUER ||
    value.audience !== STEP8_REQUEST_AUDIENCE ||
    value.operation !== "read" ||
    value.mappingBasis !== "finance_local_current_component_map" ||
    value.shadowOnly !== true ||
    !UUID.test(String(value.requestId)) ||
    !UUID.test(String(value.destinationOrganizationId)) ||
    !UUID.test(String(value.destinationProjectId)) ||
    !UUID.test(String(value.sourceOrganizationId)) ||
    !UUID.test(String(value.sourceProjectId)) ||
    !HASH.test(String(value.sourceSetFingerprint)) ||
    !HASH.test(String(value.actorSubjectHash)) ||
    !NONCE.test(String(value.nonce)) ||
    !positiveInteger(value.sourceCount) ||
    value.sourceCount > 50 ||
    !positiveInteger(value.authCheckedAt) ||
    !positiveInteger(value.issuedAt) ||
    !positiveInteger(value.expiresAt) ||
    value.authCheckedAt > value.issuedAt ||
    value.issuedAt - value.authCheckedAt > STEP8_MAX_AUTH_AGE_SECONDS ||
    value.expiresAt <= value.issuedAt ||
    value.expiresAt - value.issuedAt > STEP8_MAX_TTL_SECONDS
  ) throw new Error("invalid_request_contract");
  return value as unknown as Step8ServiceReadRequest;
}

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (value === null || value.trim() !== value) {
    throw new Error("invalid_request_headers");
  }
  return value;
}

function secondsHeader(headers: Headers, name: string): number {
  const raw = requiredHeader(headers, name);
  if (!/^[1-9][0-9]{0,11}$/.test(raw)) {
    throw new Error("invalid_request_headers");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error("invalid_request_headers");
  return value;
}

export async function validateStep8RequestHeaders(
  headers: Headers,
  body: Step8ServiceReadRequest,
  rawBody: string,
  nowSeconds: number,
): Promise<Step8RequestHeaders> {
  const protocol = requiredHeader(headers, "x-eventflow-protocol");
  const issuer = requiredHeader(headers, "x-eventflow-issuer");
  const audience = requiredHeader(headers, "x-eventflow-audience");
  const requestKeyId = requiredHeader(headers, "x-eventflow-key-id");
  const keyVersionRaw = requiredHeader(headers, "x-eventflow-key-version");
  const requestId = requiredHeader(headers, "x-eventflow-request-id");
  const nonce = requiredHeader(headers, "x-eventflow-nonce");
  const issuedAt = secondsHeader(headers, "x-eventflow-issued-at");
  const expiresAt = secondsHeader(headers, "x-eventflow-expires-at");
  const bodySha256 = requiredHeader(headers, "x-eventflow-body-sha256");
  const actorSubjectHash = requiredHeader(
    headers,
    "x-eventflow-actor-subject-hash",
  );
  const authCheckedAt = secondsHeader(headers, "x-eventflow-auth-checked-at");
  const signature = requiredHeader(headers, "x-eventflow-signature");
  const requestKeyVersion = Number(keyVersionRaw);
  if (
    protocol !== STEP8_SERVICE_READ_PROTOCOL ||
    issuer !== STEP8_REQUEST_ISSUER ||
    audience !== STEP8_REQUEST_AUDIENCE ||
    !KEY_ID.test(requestKeyId) ||
    !/^[1-9][0-9]{0,8}$/.test(keyVersionRaw) ||
    !Number.isSafeInteger(requestKeyVersion) ||
    !UUID.test(requestId) ||
    !NONCE.test(nonce) ||
    !HASH.test(bodySha256) ||
    !HASH.test(actorSubjectHash) ||
    !SIGNATURE.test(signature) ||
    body.requestId !== requestId ||
    body.nonce !== nonce ||
    body.issuedAt !== issuedAt ||
    body.expiresAt !== expiresAt ||
    body.actorSubjectHash !== actorSubjectHash ||
    body.authCheckedAt !== authCheckedAt ||
    body.issuer !== issuer ||
    body.audience !== audience ||
    await sha256Hex(rawBody) !== bodySha256 ||
    !Number.isSafeInteger(nowSeconds) ||
    issuedAt > nowSeconds + STEP8_MAX_CLOCK_LEAD_SECONDS ||
    expiresAt <= nowSeconds ||
    expiresAt - issuedAt > STEP8_MAX_TTL_SECONDS
  ) throw new Error("invalid_request_headers");
  return {
    method: "POST",
    route: STEP8_SERVICE_READ_ROUTE,
    protocol,
    issuer,
    audience,
    requestKeyId,
    requestKeyVersion,
    requestId,
    nonce,
    issuedAt,
    expiresAt,
    bodySha256,
    actorSubjectHash,
    authCheckedAt,
    signature,
  };
}

export function buildStep8RequestSigningFrame(
  headers: Omit<Step8RequestHeaders, "signature">,
): string {
  return [
    "hmac-sha256",
    headers.protocol,
    headers.method,
    headers.route,
    headers.issuer,
    headers.audience,
    headers.requestKeyId,
    String(headers.requestKeyVersion),
    headers.requestId,
    headers.nonce,
    String(headers.issuedAt),
    String(headers.expiresAt),
    headers.bodySha256,
    headers.actorSubjectHash,
    String(headers.authCheckedAt),
  ].join("\n");
}

export function buildStep8ResponseSigningFrame(
  headers: Omit<Step8ResponseHeaders, "signature">,
): string {
  return [
    "hmac-sha256",
    headers.protocol,
    headers.issuer,
    headers.audience,
    headers.responseKeyId,
    String(headers.responseKeyVersion),
    headers.requestId,
    headers.nonce,
    String(headers.issuedAt),
    String(headers.expiresAt),
    headers.bodySha256,
    headers.requestBodySha256,
    headers.requestNonceSha256,
  ].join("\n");
}

export function validateStep8ResponseHeaders(
  value: unknown,
  request: Step8RequestHeaders,
  nowSeconds: number,
): Step8ResponseHeaders {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_response_headers");
  }
  const headers = value as Record<string, unknown>;
  const keys = [
    "audience",
    "bodySha256",
    "expiresAt",
    "issuedAt",
    "issuer",
    "nonce",
    "protocol",
    "requestBodySha256",
    "requestId",
    "requestNonceSha256",
    "responseKeyId",
    "responseKeyVersion",
    "signature",
  ];
  if (
    !exactKeys(headers, keys) ||
    headers.protocol !== STEP8_SERVICE_READ_PROTOCOL ||
    headers.issuer !== STEP8_RESPONSE_ISSUER ||
    headers.audience !== STEP8_RESPONSE_AUDIENCE ||
    !KEY_ID.test(String(headers.responseKeyId)) ||
    !positiveInteger(headers.responseKeyVersion) ||
    headers.requestId !== request.requestId ||
    !NONCE.test(String(headers.nonce)) ||
    headers.nonce !== request.nonce ||
    !positiveInteger(headers.issuedAt) ||
    !positiveInteger(headers.expiresAt) ||
    headers.issuedAt !== request.issuedAt ||
    headers.expiresAt !== request.expiresAt ||
    Number(headers.issuedAt) > nowSeconds + STEP8_MAX_CLOCK_LEAD_SECONDS ||
    Number(headers.expiresAt) <= nowSeconds ||
    Number(headers.expiresAt) - Number(headers.issuedAt) >
      STEP8_MAX_TTL_SECONDS ||
    !HASH.test(String(headers.bodySha256)) ||
    headers.requestBodySha256 !== request.bodySha256 ||
    !HASH.test(String(headers.requestNonceSha256)) ||
    !HASH.test(String(headers.signature))
  ) throw new Error("invalid_response_headers");
  return headers as unknown as Step8ResponseHeaders;
}

export async function validateStep8ResponseBody(
  rawBody: string,
  headers: Step8ResponseHeaders,
  requestBody: Step8ServiceReadRequest,
  requestHeaders: Step8RequestHeaders,
): Promise<Step8ServiceReadResponse> {
  if (
    !rawBody || encoder.encode(rawBody).byteLength > STEP8_RESPONSE_MAX_BYTES ||
    canonicalJson(JSON.parse(rawBody)) !== rawBody ||
    await sha256Hex(rawBody) !== headers.bodySha256
  ) throw new Error("invalid_response_body");
  const value = JSON.parse(rawBody) as Record<string, unknown>;
  if (
    !value || Array.isArray(value) ||
    !exactKeys(value, STEP8_RESPONSE_KEYS) ||
    value.schemaVersion !== STEP8_RESPONSE_SCHEMA ||
    value.issuer !== STEP8_RESPONSE_ISSUER ||
    value.audience !== STEP8_RESPONSE_AUDIENCE ||
    value.requestId !== requestHeaders.requestId ||
    value.requestBodySha256 !== requestHeaders.bodySha256 ||
    value.requestNonceSha256 !== await sha256Hex(requestHeaders.nonce) ||
    value.requestNonceSha256 !== headers.requestNonceSha256 ||
    value.destinationOrganizationId !==
      requestBody.destinationOrganizationId ||
    value.destinationProjectId !== requestBody.destinationProjectId ||
    value.sourceOrganizationId !== requestBody.sourceOrganizationId ||
    value.sourceProjectId !== requestBody.sourceProjectId ||
    value.sourceSetFingerprint !== requestBody.sourceSetFingerprint ||
    value.issuedAt !== headers.issuedAt ||
    value.expiresAt !== headers.expiresAt ||
    value.nonce !== headers.nonce ||
    value.shadowOnly !== true ||
    !["available", "unavailable"].includes(
      String(value.outcome),
    )
  ) throw new Error("invalid_response_contract");
  if (value.outcome === "available") {
    const payloadRaw = canonicalJson(value.payload);
    if (
      !value.payload || typeof value.payload !== "object" ||
      Array.isArray(value.payload) || !HASH.test(String(value.payloadSha256)) ||
      encoder.encode(payloadRaw).byteLength > STEP8_PAYLOAD_MAX_BYTES ||
      await sha256Hex(payloadRaw) !== value.payloadSha256
    ) throw new Error("invalid_response_payload");
  } else if (value.payload !== null || value.payloadSha256 !== null) {
    throw new Error("invalid_response_payload");
  }
  return value as unknown as Step8ServiceReadResponse;
}

export function step8ResponseWireHeaders(
  headers: Step8ResponseHeaders,
): Headers {
  return new Headers({
    "cache-control": "no-store",
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
    "x-eventflow-protocol": headers.protocol,
    "x-eventflow-issuer": headers.issuer,
    "x-eventflow-audience": headers.audience,
    "x-eventflow-key-id": headers.responseKeyId,
    "x-eventflow-key-version": String(headers.responseKeyVersion),
    "x-eventflow-request-id": headers.requestId,
    "x-eventflow-nonce": headers.nonce,
    "x-eventflow-issued-at": String(headers.issuedAt),
    "x-eventflow-expires-at": String(headers.expiresAt),
    "x-eventflow-body-sha256": headers.bodySha256,
    "x-eventflow-request-body-sha256": headers.requestBodySha256,
    "x-eventflow-request-nonce-sha256": headers.requestNonceSha256,
    "x-eventflow-signature": `hmac-sha256=${headers.signature}`,
  });
}
