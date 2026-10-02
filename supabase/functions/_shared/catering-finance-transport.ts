/** Dedicated native Catering delivery. No personnel/Time signing purpose or cost engine. */
import { rawBodySha256 } from "./project-personnel-ingestion-transport.ts";
export const CATERING_FINANCE_ROUTE = "operations-catering-cost-receive";
export const CATERING_FINANCE_MAX_BYTES = 256 * 1024;
export interface CateringFinanceClaim {
  id: string;
  source_outbox_id: string;
  organization_id: string;
  source_stream_id: string;
  source_revision: number;
  raw_body: string;
  body_sha256: string;
  destination_organization_id: string;
  route_id: string;
  route_revision: string;
  key_id: string;
  endpoint_url: string;
  lease_owner: string;
  lease_token: string;
}
export interface CateringFinanceReceipt {
  schema: "operations-catering-receipt.v1";
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
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const encoder = new TextEncoder();
export function trustedCateringFinanceEndpoint(value: string): string {
  if (typeof value !== "string")
    throw new Error("invalid_catering_finance_endpoint");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/functions/v1/" + CATERING_FINANCE_ROUTE
  )
    throw new Error("invalid_catering_finance_endpoint");
  return url.href;
}
export async function signCateringFinanceRequest(
  rawBody: string,
  keyId: string,
  secret: string,
  options: { now?: Date; nonce?: string } = {},
): Promise<Record<string, string>> {
  if (
    typeof rawBody !== "string" ||
    typeof keyId !== "string" ||
    !/^[A-Za-z0-9_-]{4,64}$/.test(keyId) ||
    typeof secret !== "string" ||
    encoder.encode(secret).length < 32 ||
    encoder.encode(rawBody).length > CATERING_FINANCE_MAX_BYTES
  )
    throw new Error("invalid_catering_finance_signing");
  const timestamp = String(
    Math.floor((options.now ?? new Date()).getTime() / 1000),
  );
  const nonce = options.nonce ?? crypto.randomUUID();
  if (
    !/^\d{10}$/.test(timestamp) ||
    typeof nonce !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)
  )
    throw new Error("invalid_catering_finance_attempt");
  const message = [
    "POST",
    CATERING_FINANCE_ROUTE,
    "operations-catering-delivery.v1",
    keyId,
    timestamp,
    nonce,
    rawBody,
  ].join("\n");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(message)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    "content-type": "application/json",
    "x-eventflow-key-id": keyId,
    "x-eventflow-timestamp": timestamp,
    "x-eventflow-nonce": nonce,
    "x-eventflow-signature": "v1=" + signature,
  };
}
export function verifyCateringFinanceReceipt(
  value: unknown,
  claim: CateringFinanceClaim,
  status: number,
): CateringFinanceReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_catering_finance_receipt");
  const r = value as CateringFinanceReceipt;
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
    Object.keys(r).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(r, k)) ||
    r.schema !== "operations-catering-receipt.v1" ||
    r.shadow_only !== true ||
    r.source_organization_id !== claim.organization_id ||
    r.source_stream_id !== claim.source_stream_id ||
    r.requested_source_revision !== claim.source_revision ||
    r.request_body_sha256 !== claim.body_sha256 ||
    r.destination_organization_id !== claim.destination_organization_id ||
    !uuid(r.receipt_id) ||
    !uuid(r.snapshot_receipt_id) ||
    !hash(r.snapshot_fingerprint) ||
    !integer(r.requested_source_revision) ||
    !integer(r.applied_source_revision) ||
    !integer(r.current_source_revision)
  )
    throw new Error("unbound_catering_finance_receipt");
  if (
    status === 200 &&
    (r.outcome === "accepted" || r.outcome === "replayed") &&
    r.applied_source_revision === claim.source_revision &&
    r.current_source_revision >= r.applied_source_revision &&
    r.snapshot_fingerprint === claim.body_sha256
  )
    return r;
  if (
    status === 409 &&
    r.outcome === "stale" &&
    r.applied_source_revision === r.current_source_revision &&
    r.current_source_revision > claim.source_revision
  )
    return r;
  throw new Error("inconsistent_catering_finance_receipt");
}
export type CateringFinanceResult =
  | { outcome: "delivered" | "superseded"; receipt: CateringFinanceReceipt }
  | { outcome: "retry" | "blocked"; error: string };
export async function dispatchCateringFinanceClaim(
  claim: CateringFinanceClaim,
  config: {
    enabled: boolean;
    endpoint: string;
    keyId: string;
    secret: string;
    timeoutMs?: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<CateringFinanceResult> {
  if (config.enabled !== true)
    return { outcome: "blocked", error: "catering_finance_transport_disabled" };
  let sent = false;
  try {
    const endpoint = trustedCateringFinanceEndpoint(config.endpoint),
      timeout = config.timeoutMs ?? 10000;
    if (
      endpoint !== trustedCateringFinanceEndpoint(claim.endpoint_url) ||
      claim.key_id !== config.keyId ||
      !Number.isInteger(timeout) ||
      timeout < 1000 ||
      timeout > 15000 ||
      ![
        "id",
        "source_outbox_id",
        "organization_id",
        "destination_organization_id",
        "route_id",
        "lease_token",
      ].every((k) => uuid(claim[k as keyof CateringFinanceClaim])) ||
      typeof claim.lease_owner !== "string" ||
      !claim.lease_owner.trim() ||
      typeof claim.route_revision !== "string" ||
      !claim.route_revision.trim() ||
      !integer(claim.source_revision) ||
      !hash(claim.body_sha256) ||
      typeof claim.raw_body !== "string" ||
      encoder.encode(claim.raw_body).length > CATERING_FINANCE_MAX_BYTES ||
      (await rawBodySha256(claim.raw_body)) !== claim.body_sha256
    )
      return {
        outcome: "blocked",
        error: "catering_finance_capture_or_configuration_invalid",
      };
    const body = JSON.parse(claim.raw_body);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      body.schema_version !== "operations-catering-delivery.v1" ||
      body.operations_organization_id !== claim.organization_id ||
      body.destination_organization_id !== claim.destination_organization_id ||
      body.source_stream_id !== claim.source_stream_id ||
      body.source_outbox_id !== claim.source_outbox_id ||
      body.route_id !== claim.route_id ||
      body.route_revision !== claim.route_revision ||
      body.key_id !== claim.key_id ||
      body.snapshot?.publication_revision !== claim.source_revision ||
      body.snapshot?.organization_id !== claim.organization_id
    )
      return {
        outcome: "blocked",
        error: "catering_finance_capture_or_configuration_invalid",
      };
    const headers = await signCateringFinanceRequest(
      claim.raw_body,
      config.keyId,
      config.secret,
    );
    sent = true;
    return await cateringFinanceJsonRequest(
      endpoint,
      {
        method: "POST",
        headers,
        body: claim.raw_body,
      },
      fetchImpl,
      async (response, value) => {
        if (response.status !== 200 && response.status !== 409)
          return {
            outcome: [401, 403, 413, 422].includes(response.status)
              ? "blocked"
              : "retry",
            error: "catering_finance_http_" + response.status,
          };
        const receipt = verifyCateringFinanceReceipt(
          value,
          claim,
          response.status,
        );
        return {
          outcome: receipt.outcome === "stale" ? "superseded" : "delivered",
          receipt,
        };
      },
      timeout,
    );
  } catch {
    return sent
      ? { outcome: "retry", error: "catering_finance_ack_unknown" }
      : {
          outcome: "blocked",
          error: "catering_finance_capture_or_configuration_invalid",
        };
  }
}

/** One bounded fetch/body/receipt budget; late or cancelled reads never become success. */
export async function cateringFinanceJsonRequest<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  inspect: (reply: Response, value: unknown) => Promise<T>,
  timeoutMs = 15000,
  maxBytes = 16384,
): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000)
    throw new Error("invalid_backend_timeout");
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576)
    throw new Error("invalid_backend_limit");
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      reject(new Error("backend_timeout"));
    }, timeoutMs);
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const backend = fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    }).then((reply) => {
      if (expired) void reply.body?.cancel().catch(() => {});
      return reply;
    });
    const operation = (async () => {
      const reply = await Promise.race([backend, deadline]);
      if (expired) throw new Error("backend_timeout");
      reader = reply.body?.getReader();
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const part = await Promise.race([reader.read(), deadline]);
          if (expired) throw new Error("backend_timeout");
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > maxBytes) {
            void reader.cancel().catch(() => {});
            throw new Error("backend_too_large");
          }
          chunks.push(part.value);
        }
      }
      const all = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(all),
      );
      const result = await Promise.race([inspect(reply, value), deadline]);
      if (expired) throw new Error("backend_timeout");
      return result;
    })();
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (expired) void reader?.cancel().catch(() => {});
  }
}
