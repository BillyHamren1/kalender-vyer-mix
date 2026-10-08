import {
  readAuthenticatedCateringEntry,
  buildCateringPublication,
} from "../_shared/catering-project-ingestion.ts";
import { createOperationsCateringStore } from "../_shared/catering-project-ingestion-store.ts";
import { readBoundedBody } from "../_shared/project-personnel-ingestion-transport.ts";
export interface CateringPublishConfig {
  enabled: boolean;
  internalSecret: string;
  databaseUrl: string;
  databaseServiceKey: string;
  cateringSigningSeed: string;
  fetchImpl?: typeof fetch;
}
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const json = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
const sameSecret = (a: string, b: string) => {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};
/** Internal ingestion only; source payload, mapping and rates never come from caller. */
export function createCateringPublishHandler(
  config: CateringPublishConfig,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (config.enabled !== true)
      return json(503, { error: "catering_publisher_disabled" });
    if (request.method !== "POST")
      return json(405, { error: "method_not_allowed" });
    if (
      typeof config.internalSecret !== "string" ||
      new TextEncoder().encode(config.internalSecret).length < 32 ||
      !sameSecret(
        request.headers.get("authorization") ?? "",
        "Bearer " + config.internalSecret,
      )
    )
      return json(401, { error: "unauthorized" });
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readBoundedBody(request.body, 4096, 15000),
        ),
      );
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error();
    } catch (error) {
      return json(
        error instanceof Error && error.message === "body_too_large"
          ? 413
          : 400,
        { error: "invalid_request" },
      );
    }
    if (
      Object.keys(input).length !== 6 ||
      input.schema !== "operations-catering-ingest.v1" ||
      input.operation !== "time-entry.ingest" ||
      !uuid(input.organization_id) ||
      !uuid(input.worker_id) ||
      !uuid(input.time_entry_id) ||
      typeof input.expected_version !== "number" ||
      !Number.isSafeInteger(input.expected_version) ||
      input.expected_version < 1
    )
      return json(400, { error: "invalid_ingestion_request" });
    try {
      const fetchImpl = config.fetchImpl ?? fetch,
        store = createOperationsCateringStore(
          config.databaseUrl,
          config.databaseServiceKey,
          fetchImpl,
        );
      const binding = await store.binding(
        input.organization_id,
        input.worker_id,
      );
      const read = await readAuthenticatedCateringEntry(
        binding,
        input.time_entry_id,
        input.expected_version,
        {
          endpoint: binding.endpoint_url,
          keyId: binding.key_id,
          signingSeed: config.cateringSigningSeed,
        },
        fetchImpl,
      );
      const stream = `catering:${binding.catering_organization_id}:${input.time_entry_id}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await store.current(binding.organization_id, stream);
        const allocation = await store.allocation(binding, input.time_entry_id);
        const rates = await store.rates(
          binding.organization_id,
          binding.worker_id,
          allocation.work_date,
        );
        const publication = await buildCateringPublication({
          read,
          binding,
          allocation,
          current,
          rates,
        });
        if (!publication)
          return json(200, {
            schema: "operations-catering-publication-receipt.v1",
            outcome: "unchanged",
            current_revision: current.current_revision,
            delivery_status: "parked",
          });
        try {
          const receipt = await store.publish(
            publication,
            allocation.id,
            read.proofReceipt.requestBodySha256,
          );
          if (
            !receipt ||
            !["accepted", "replayed"].includes(receipt.outcome) ||
            receipt.delivery_status !== "parked" ||
            receipt.source_revision !==
              publication.evidence.publication_revision ||
            !uuid(receipt.observation_id)
          )
            throw new Error("native_publication_receipt_mismatch");
          return json(200, {
            schema: "operations-catering-publication-receipt.v1",
            ...receipt,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "publication_head_changed"
          )
            continue;
          throw error;
        }
      }
      return json(409, { error: "publication_head_changed" });
    } catch {
      return json(503, { error: "catering_publication_unavailable" });
    }
  };
}
