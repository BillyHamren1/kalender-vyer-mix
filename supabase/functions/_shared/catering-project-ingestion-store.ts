import type { HistoricalPersonnelRate } from "./project-personnel-cost.ts";
import type {
  CateringSourceBinding,
  CateringCurrentPublication,
  CateringResolvedAllocation,
  buildCateringPublication,
} from "./catering-project-ingestion.ts";
import { readBoundedBody } from "./project-personnel-ingestion-transport.ts";
type Publication = NonNullable<
  Awaited<ReturnType<typeof buildCateringPublication>>
>;
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** Its own Operations service credential is never sent to native Catering. */
export function createOperationsCateringStore(
  databaseUrl: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
) {
  const url = new URL(databaseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !serviceKey
  )
    throw new Error("invalid_operations_database_configuration");
  const base = url.href.replace(/\/$/, "") + "/rest/v1/";
  const request = async (
    path: string,
    params: Record<string, string> = {},
    body?: unknown,
  ): Promise<any> => {
    const endpoint = new URL(base + path);
    for (const [k, v] of Object.entries(params))
      endpoint.searchParams.set(k, v);
    const r = await fetchImpl(endpoint, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: serviceKey,
        authorization: "Bearer " + serviceKey,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!r.ok) {
      const error = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readBoundedBody(r.body, 4096, 15000),
        ),
      );
      if (error?.code === "40001") throw new Error("publication_head_changed");
      throw new Error("operations_database_http_" + r.status);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedBody(r.body, 2097152, 15000),
      ),
    );
  };
  const rows = async (path: string, params: Record<string, string>) => {
    const r = await request(path, params);
    if (!Array.isArray(r)) throw new Error("invalid_operations_database_rows");
    return r;
  };
  const scope = (org: string, worker?: string) => {
    if (!uuid(org) || (worker !== undefined && !uuid(worker)))
      throw new Error("invalid_native_scope");
    return {
      organization_id: "eq." + org,
      ...(worker ? { worker_id: "eq." + worker } : {}),
    };
  };
  return {
    async binding(org: string, worker: string): Promise<CateringSourceBinding> {
      const filters = scope(org, worker);
      const gates = await rows("operations_catering_publish_gates", {
        select: "enabled",
        organization_id: filters.organization_id,
        enabled: "eq.true",
        limit: "2",
      });
      if (gates.length !== 1 || gates[0].enabled !== true)
        throw new Error("native_publication_disabled");
      const found = await rows("operations_catering_source_bindings", {
        ...filters,
        select: "*",
        enabled: "eq.true",
        limit: "2",
      });
      if (found.length !== 1 || found[0].enabled !== true)
        throw new Error("native_source_binding_disabled");
      return found[0];
    },
    async allocation(
      binding: CateringSourceBinding,
      entryId: string,
    ): Promise<CateringResolvedAllocation & { id: string }> {
      if (!uuid(entryId)) throw new Error("invalid_native_entry");
      const found = await rows("operations_catering_project_mappings", {
        ...scope(binding.organization_id, binding.worker_id),
        select: "*",
        catering_organization_id: "eq." + binding.catering_organization_id,
        catering_person_id: "eq." + binding.catering_person_id,
        time_entry_id: "eq." + entryId,
        enabled: "eq.true",
        limit: "2",
      });
      if (found.length !== 1 || found[0].enabled !== true)
        throw new Error("native_exact_mapping_missing");
      return found[0];
    },
    async current(
      org: string,
      stream: string,
    ): Promise<CateringCurrentPublication> {
      const filters = { ...scope(org), source_stream_id: "eq." + stream };
      const heads = await rows("operations_catering_cost_streams", {
        ...filters,
        select: "current_revision",
        limit: "2",
      });
      if (heads.length > 1) throw new Error("ambiguous_native_stream");
      if (!heads.length)
        return {
          current_revision: 0,
          evidence: null,
          raw_entry: null,
          raw_review: null,
        };
      const revision = heads[0].current_revision;
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw new Error("native_head_evidence_missing");
      const publications = await rows("operations_catering_cost_publications", {
        ...filters,
        select: "snapshot,observation_id",
        source_revision: "eq." + revision,
        limit: "2",
      });
      if (publications.length !== 1 || !uuid(publications[0].observation_id))
        throw new Error("native_head_evidence_missing");
      const observations = await rows(
        "operations_catering_source_observations",
        {
          ...scope(org),
          select: "raw_entry,raw_review",
          id: "eq." + publications[0].observation_id,
          limit: "2",
        },
      );
      if (observations.length !== 1)
        throw new Error("native_observation_missing");
      return {
        current_revision: revision,
        evidence: publications[0].snapshot,
        ...observations[0],
      };
    },
    async rates(
      org: string,
      worker: string,
      date: string,
    ): Promise<HistoricalPersonnelRate[]> {
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error("invalid_work_date");
      const found = await rows("operations_personnel_rate_history", {
        ...scope(org, worker),
        select:
          "organization_id,worker_id,category,currency,rate_revision,hourly_rate_minor,effective_from,effective_to",
        category: "eq.work",
        effective_from: "lte." + date,
        or: "(effective_to.is.null,effective_to.gt." + date + ")",
        limit: "1001",
      });
      if (found.length > 1000) throw new Error("too_many_rate_histories");
      return found;
    },
    publish(p: Publication, mappingId: string, sourceRequestHash: string) {
      if (
        !uuid(mappingId) ||
        typeof sourceRequestHash !== "string" ||
        !/^[0-9a-f]{64}$/.test(sourceRequestHash)
      )
        throw new Error("invalid_native_publication_reference");
      return request(
        "rpc/publish_operations_catering_cost_v1",
        {},
        {
          p_snapshot: p.evidence,
          p_raw_entry: p.raw_entry,
          p_raw_review: p.raw_review,
          p_mapping_id: mappingId,
          p_source_request_hash: sourceRequestHash,
          p_expected_revision: p.expected_revision,
          p_idempotency_key: p.idempotency_key,
        },
      );
    },
  };
}
