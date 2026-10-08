import {
  dispatchCateringFinanceClaim,
  cateringFinanceJsonRequest,
  type CateringFinanceClaim,
} from "../_shared/catering-finance-transport.ts";
import { readBoundedBody } from "../_shared/project-personnel-ingestion-transport.ts";
export interface CateringFinanceDeliveryDeps {
  env: (name: string) => string | undefined;
  fetch?: typeof fetch;
}
const reply = (status: number, value: Record<string, unknown>) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
async function equalSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const hash = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let n = 0; n < x.length; n++) diff |= x[n]! ^ y[n]!;
  return diff === 0;
}
export async function handleCateringFinanceDelivery(
  request: Request,
  deps: CateringFinanceDeliveryDeps,
): Promise<Response> {
  if (request.method !== "POST")
    return reply(405, { error: "method_not_allowed" });
  if (deps.env("OPERATIONS_CATERING_FINANCE_DELIVERY_ENABLED") !== "true")
    return reply(503, { error: "delivery_disabled" });
  const internal = deps.env("OPERATIONS_CATERING_FINANCE_DISPATCH_SECRET");
  const supplied = request.headers.get("x-eventflow-catering-dispatch-secret");
  if (!internal || new TextEncoder().encode(internal).length < 32)
    return reply(503, { error: "dispatch_not_configured" });
  if (
    !supplied ||
    supplied.length > 1024 ||
    !(await equalSecret(internal, supplied))
  )
    return reply(401, { error: "dispatch_unauthorized" });
  let input: Record<string, unknown>;
  try {
    const raw = await readBoundedBody(request.body, 4096, 15000);
    const data: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
    );
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    input = data as Record<string, unknown>;
    if (
      Object.keys(input).length !== 2 ||
      !uuid(input.organization_id) ||
      !uuid(input.delivery_id)
    )
      throw new Error();
  } catch {
    return reply(400, { error: "invalid_delivery_scope" });
  }
  const url = deps.env("SUPABASE_URL"),
    service = deps.env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return reply(503, { error: "database_not_configured" });
  const fetchImpl = deps.fetch ?? fetch;
  const rpc = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    return await cateringFinanceJsonRequest(
      url + "/rest/v1/rpc/" + name,
      {
        method: "POST",
        headers: {
          apikey: service,
          Authorization: "Bearer " + service,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      },
      fetchImpl,
      async (response, value) => {
        if (!response.ok) throw new Error("database_command_failed");
        return value;
      },
      15000,
      1048576,
    );
  };
  const owner = "catering-finance-" + crypto.randomUUID();
  let claim: CateringFinanceClaim;
  try {
    const value = await rpc("claim_operations_catering_finance_delivery_v1", {
      p_organization_id: input.organization_id,
      p_delivery_id: input.delivery_id,
      p_lease_owner: owner,
    });
    if (value === null) return reply(409, { error: "delivery_unavailable" });
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    claim = value as CateringFinanceClaim;
    if (
      claim.id !== input.delivery_id ||
      claim.organization_id !== input.organization_id ||
      claim.lease_owner !== owner ||
      !uuid(claim.lease_token)
    )
      throw new Error();
  } catch {
    return reply(503, { error: "claim_unavailable" });
  }
  let secret: unknown;
  try {
    const keys: unknown = JSON.parse(
      deps.env("OPERATIONS_CATERING_FINANCE_HMAC_KEYS_JSON") ?? "null",
    );
    if (
      keys &&
      typeof keys === "object" &&
      !Array.isArray(keys) &&
      Object.hasOwn(keys, claim.key_id)
    )
      secret = (keys as Record<string, unknown>)[claim.key_id];
  } catch {
    /* Missing or malformed dedicated keys result in a blocked captured delivery. */
  }
  const result = await dispatchCateringFinanceClaim(
    claim,
    {
      enabled: true,
      endpoint: claim.endpoint_url,
      keyId: claim.key_id,
      secret: typeof secret === "string" ? secret : "",
    },
    fetchImpl,
  );
  try {
    const finished = await rpc(
      "finish_operations_catering_finance_delivery_v1",
      {
        p_organization_id: input.organization_id,
        p_delivery_id: input.delivery_id,
        p_lease_owner: owner,
        p_lease_token: claim.lease_token,
        p_outcome: result.outcome,
        p_receipt: "receipt" in result ? result.receipt : null,
        p_error: "error" in result ? result.error : null,
      },
    );
    if (
      !finished ||
      typeof finished !== "object" ||
      Array.isArray(finished) ||
      (finished as Record<string, unknown>).delivery_id !== claim.id ||
      (finished as Record<string, unknown>).source_outbox_status !== "parked" ||
      (finished as Record<string, unknown>).status !==
        (result.outcome === "retry" ? "pending" : result.outcome)
    )
      throw new Error();
  } catch {
    return reply(503, { error: "finish_unavailable" });
  }
  return reply(
    result.outcome === "retry" ? 503 : result.outcome === "blocked" ? 409 : 200,
    {
      delivery_id: claim.id,
      outcome: result.outcome,
      shadow_only: true,
      source_outbox_status: "parked",
    },
  );
}
