/** Immutable allocation-v2 send boundary. No source, rate or forecast calculation. */
import { rawBodySha256 } from "./project-personnel-ingestion-transport.ts";
import {
  fingerprintCateringAllocationCost,
  fingerprintCateringAllocationEvent,
  validateSavedCateringAllocationCost,
} from "./catering-project-reassignment.ts";
import {
  type CateringAllocationFinanceReceipt,
  createCateringAllocationSignature,
  validateCateringAllocationReceipt,
} from "./catering-allocation-finance-proof.ts";
export interface CateringAllocationClaim {
  id: string;
  source_outbox_id: string;
  organization_id: string;
  source_stream_id: string;
  source_revision: number;
  allocation_event_id: string;
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
export type CateringAllocationSendResult =
  | {
    outcome: "delivered" | "superseded";
    receipt: CateringAllocationFinanceReceipt;
  }
  | { outcome: "retry" | "blocked"; error: string };
const uuid = (x: unknown): x is string =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const hash = (x: unknown): x is string =>
  typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
export function trustedCateringAllocationEndpoint(value: string): string {
  if (typeof value !== "string") throw new Error("invalid_allocation_endpoint");
  const url = new URL(value);
  if (
    typeof value !== "string" || url.protocol !== "https:" || url.username ||
    url.password || url.search || url.hash ||
    url.pathname !== "/functions/v1/operations-catering-allocation-cost-receive"
  ) throw new Error("invalid_allocation_endpoint");
  return url.href;
}
export async function dispatchCateringAllocationClaim(
  claim: CateringAllocationClaim,
  config: {
    enabled: boolean;
    endpoint: string;
    keyId: string;
    secret: string;
    timeoutMs?: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<CateringAllocationSendResult> {
  let sent = false;
  const invalid = (): CateringAllocationSendResult => ({
    outcome: "blocked",
    error: "catering_allocation_finance_capture_or_configuration_invalid",
  });
  if (config.enabled !== true) return invalid();
  try {
    const endpoint = trustedCateringAllocationEndpoint(config.endpoint),
      timeout = config.timeoutMs ?? 10000;
    if (
      endpoint !== trustedCateringAllocationEndpoint(claim.endpoint_url) ||
      claim.key_id !== config.keyId ||
      !Number.isInteger(timeout) || timeout < 1000 || timeout > 15000 ||
      ![
        claim.id,
        claim.organization_id,
        claim.source_outbox_id,
        claim.allocation_event_id,
        claim.route_id,
        claim.destination_organization_id,
        claim.lease_token,
      ].every(uuid) ||
      typeof claim.raw_body !== "string" ||
      new TextEncoder().encode(claim.raw_body).length > 262144 ||
      typeof claim.lease_owner !== "string" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(claim.lease_owner) ||
      typeof claim.route_revision !== "string" ||
      claim.route_revision !== claim.route_revision.trim() ||
      !claim.route_revision || claim.route_revision.length > 200 ||
      !Number.isSafeInteger(claim.source_revision) ||
      claim.source_revision < 1 || !hash(claim.body_sha256) ||
      await rawBodySha256(claim.raw_body) !== claim.body_sha256
    ) return invalid();
    const body: unknown = JSON.parse(claim.raw_body);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalid();
    }
    const p = body as Record<string, unknown>;
    const keys = [
      "schema_version",
      "operations_organization_id",
      "destination_organization_id",
      "route_id",
      "route_revision",
      "key_id",
      "source_stream_id",
      "source_outbox_id",
      "source_observation_id",
      "source_mapping_id",
      "destinations",
      "destination_mappings",
      "snapshot",
      "raw_entry",
      "raw_review",
      "raw_entry_sha256",
      "raw_review_sha256",
      "source_request_hash",
      "allocation_event",
    ];
    if (
      Object.keys(p).length !== 19 || keys.some((k) => !Object.hasOwn(p, k)) ||
      p["schema_version"] !== "operations-catering-delivery.v2" ||
      p["operations_organization_id"] !== claim.organization_id ||
      p["destination_organization_id"] !== claim.destination_organization_id ||
      p["route_id"] !== claim.route_id ||
      p["route_revision"] !== claim.route_revision ||
      p["key_id"] !== claim.key_id ||
      p["source_stream_id"] !== claim.source_stream_id ||
      p["source_outbox_id"] !== claim.source_outbox_id
    ) return invalid();
    const snapshot = validateSavedCateringAllocationCost(p["snapshot"]);
    const event = p["allocation_event"];
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return invalid();
    }
    const e = event as Record<string, unknown>;
    const eventKeys = [
      "schema_version",
      "event_id",
      "organization_id",
      "source_stream_id",
      "allocation_revision",
      "actor_system_user_id",
      "reason",
      "idempotency_key",
      "created_at",
      "base_publication_revision",
      "allocated_publication_revision",
      "source_observation_id",
      "source_entry_version",
      "raw_entry_sha256",
      "raw_review_sha256",
      "source_cost_fingerprint",
      "previous_mapping_id",
      "previous_mapping_revision",
      "next_mapping_id",
      "next_mapping_revision",
      "from_project_id",
      "from_obligation_id",
      "to_project_id",
      "to_obligation_id",
      "target_obligation_revision",
      "fingerprint",
    ];
    if (
      Object.keys(e).length !== 26 || eventKeys.some((k) =>
        !Object.hasOwn(e, k)
      ) ||
      [
        "event_id",
        "organization_id",
        "actor_system_user_id",
        "source_observation_id",
        "previous_mapping_id",
        "next_mapping_id",
        "from_project_id",
        "from_obligation_id",
        "to_project_id",
        "to_obligation_id",
      ].some((k) => !uuid(e[k])) ||
      [
        "allocation_revision",
        "base_publication_revision",
        "allocated_publication_revision",
        "source_entry_version",
        "target_obligation_revision",
      ].some((k) =>
        typeof e[k] !== "number" || !Number.isSafeInteger(e[k]) ||
        (e[k] as number) < 1
      ) ||
      ["source_cost_fingerprint", "raw_entry_sha256", "fingerprint"].some((k) =>
        !hash(e[k])
      ) ||
      (e["raw_review_sha256"] !== null && !hash(e["raw_review_sha256"])) ||
      snapshot.source_time_entry_version <
        (e["source_entry_version"] as number) ||
      snapshot.publication_revision <
        (e["allocated_publication_revision"] as number)
    ) return invalid();
    if (snapshot.source_time_entry_version === e["source_entry_version"]) {
      if (
        p["source_observation_id"] !== e["source_observation_id"] ||
        p["raw_entry_sha256"] !== e["raw_entry_sha256"] ||
        p["raw_review_sha256"] !== e["raw_review_sha256"] ||
        await fingerprintCateringAllocationCost(snapshot) !==
          e["source_cost_fingerprint"]
      ) return invalid();
    } else if (
      p["source_observation_id"] === e["source_observation_id"] ||
      p["raw_entry_sha256"] === e["raw_entry_sha256"]
    ) return invalid();

    if (
      e["schema_version"] !== "operations-catering-allocation-authority.v2" ||
      e["event_id"] !== claim.allocation_event_id ||
      e["organization_id"] !== claim.organization_id ||
      e["source_stream_id"] !== claim.source_stream_id ||
      e["next_mapping_id"] !== p["source_mapping_id"] ||
      e["next_mapping_revision"] !== snapshot.mapping_revision ||
      e["to_project_id"] !== snapshot.project_id ||
      e["to_obligation_id"] !== snapshot.obligation_id ||
      snapshot.organization_id !== claim.organization_id ||
      snapshot.publication_revision !== claim.source_revision ||
      claim.source_stream_id !==
        `catering:${snapshot.source_organization_id}:${snapshot.source_time_entry_id}` ||
      !hash(e["fingerprint"]) ||
      await fingerprintCateringAllocationEvent(
          e as unknown as Parameters<
            typeof fingerprintCateringAllocationEvent
          >[0],
        ) !== e["fingerprint"] ||
      typeof p["raw_entry"] !== "string" ||
      await rawBodySha256(p["raw_entry"]) !== p["raw_entry_sha256"]
    ) return invalid();
    const timestamp = String(Math.floor(Date.now() / 1000)),
      nonce = crypto.randomUUID();
    const signature = await createCateringAllocationSignature({
      secret: config.secret,
      keyId: config.keyId,
      timestamp,
      nonce,
      rawBody: claim.raw_body,
    });
    sent = true;
    return await cateringAllocationJsonRequest(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-eventflow-key-id": config.keyId,
          "x-eventflow-timestamp": timestamp,
          "x-eventflow-nonce": nonce,
          "x-eventflow-signature": signature,
        },
        body: claim.raw_body,
      },
      fetchImpl,
      async (reply, value) => {
        if (reply.status !== 200 && reply.status !== 409) {
          return {
            outcome: [401, 403, 413, 422].includes(reply.status)
              ? "blocked"
              : "retry",
            error: "catering_allocation_finance_http_" + reply.status,
          };
        }
        const receipt = validateCateringAllocationReceipt(value, claim);
        if (
          (receipt.outcome === "stale") !== (reply.status === 409)
        ) throw new Error("receipt_status_mismatch");
        return {
          outcome: receipt.outcome === "stale" ? "superseded" : "delivered",
          receipt,
        };
      },
      timeout,
    );
  } catch {
    return sent
      ? { outcome: "retry", error: "catering_allocation_finance_ack_unknown" }
      : invalid();
  }
}

/** One bounded fetch/body/receipt budget; late or cancelled reads never become success. */
export async function cateringAllocationJsonRequest<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  inspect: (reply: Response, value: unknown) => Promise<T>,
  timeoutMs = 15000,
  maxBytes = 16384,
): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
    throw new Error("invalid_backend_timeout");
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576) {
    throw new Error("invalid_backend_limit");
  }
  const started = performance.now();
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
  const checkDeadline = () => {
    if (expired || performance.now() - started >= timeoutMs) {
      expired = true;
      controller.abort();
      throw new Error("backend_timeout");
    }
  };
  try {
    const backend = fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    }).then(
      (reply) => {
        if (expired || performance.now() - started >= timeoutMs) {
          expired = true;
          controller.abort();
          void reply.body?.cancel().catch(() => {});
        }
        return reply;
      },
    );
    const operation = (async () => {
      const reply = await Promise.race([backend, deadline]);
      checkDeadline();
      reader = reply.body?.getReader();
      let bytes = 0;
      let chunksRead = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          checkDeadline();
          const part = await Promise.race([reader.read(), deadline]);
          checkDeadline();
          if (part.done) break;
          chunksRead++;
          if (chunksRead > 4096) {
            void reader.cancel().catch(() => {});
            throw new Error("backend_too_many_chunks");
          }
          if (part.value.length === 0) continue;
          bytes += part.value.length;
          if (bytes > maxBytes) {
            void reader.cancel().catch(() => {});
            throw new Error("backend_too_large");
          }
          chunks.push(part.value);
        }
      }
      checkDeadline();
      const all = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(all),
      );
      checkDeadline();
      const result = await Promise.race([inspect(reply, value), deadline]);
      checkDeadline();
      return result;
    })();
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (expired) void reader?.cancel().catch(() => {});
  }
}

/** V2 request bytes: monotonic deadline and finite chunk work, including empty chunks. */
export async function boundedCateringAllocationDispatchBody(
  request: Request,
): Promise<string> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) {
    throw new Error("payload_too_large");
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const started = performance.now();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      void reader.cancel().catch(() => {});
      reject(new Error("body_timeout"));
    }, 15000);
  });
  const check = () => {
    if (expired || performance.now() - started >= 15000) {
      expired = true;
      void reader.cancel().catch(() => {});
      throw new Error("body_timeout");
    }
  };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let count = 0;
  try {
    while (true) {
      check();
      const part = await Promise.race([reader.read(), deadline]);
      check();
      if (part.done) break;
      if (++count > 4096) {
        void reader.cancel().catch(() => {});
        throw new Error("payload_too_many_chunks");
      }
      if (part.value.byteLength === 0) continue;
      bytes += part.value.byteLength;
      if (bytes > 4096) {
        void reader.cancel().catch(() => {});
        throw new Error("payload_too_large");
      }
      chunks.push(part.value);
    }
    check();
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const part of chunks) {
      all.set(part, offset);
      offset += part.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(all);
    check();
    return text;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    reader.releaseLock();
  }
}
