import { fetchCreditV2Receipt } from "./receipt.ts";
import {
  boundedProjectInvoiceBody,
  PROJECT_INVOICE_KEY_ID,
  PROJECT_INVOICE_NONCE,
  PROJECT_INVOICE_UUID,
  projectInvoiceBodyHash,
} from "../_shared/finance-project-invoice-destination.ts";
import {
  CREDIT_LINK_RECEIPT_V2,
  signProjectCreditLinkV2Destination,
  validateProjectCreditLinkV2Destination,
} from "../_shared/project-credit-link-v2-destination.ts";
async function verifyV2(input: {
  secret: string;
  keyId: string;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds: number;
}): Promise<boolean> {
  if (
    !input.timestamp || !/^[1-9][0-9]{0,11}$/.test(input.timestamp) ||
    !input.nonce || !PROJECT_INVOICE_NONCE.test(input.nonce) ||
    !input.signature || !/^v1=[0-9a-f]{64}$/.test(input.signature) ||
    !Number.isSafeInteger(input.nowSeconds) || input.nowSeconds < 1 ||
    Math.abs(Number(input.timestamp) - input.nowSeconds) > 120
  ) return false;
  const expected = await signProjectCreditLinkV2Destination(
    input.rawBody,
    input.keyId,
    input.secret,
    input.timestamp,
    input.nonce,
  );
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^
      input.signature.charCodeAt(index);
  }
  return difference === 0;
}
export interface CreditReceiveDependencies {
  env(name: string): string | undefined;
  nowSeconds?(): number;
  fetch?: typeof fetch;
}
const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
export async function handleFinanceProjectCreditV2Destination(
  request: Request,
  deps: CreditReceiveDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return reply(405, { error: "method_not_allowed" });
  }
  const route = new URL(request.url);
  if (
    ![
      "/finance-project-invoice-receive-v2",
      "/functions/v1/finance-project-invoice-receive-v2",
    ].includes(route.pathname) ||
    route.search || route.hash || route.username || route.password
  ) return reply(404, { error: "route_not_found" });
  if (
    deps.env("OPERATIONS_PROJECT_CREDIT_LINK_V2_RECEIVE_ENABLED") !== "true"
  ) {
    return reply(503, { error: "invoice_receive_disabled" });
  }
  const keyId = request.headers.get("x-eventflow-key-id");
  if (!keyId || !PROJECT_INVOICE_KEY_ID.test(keyId)) {
    return reply(401, { error: "invalid_signature" });
  }
  let secret: unknown;
  try {
    const keys: unknown = JSON.parse(
      deps.env("OPERATIONS_PROJECT_CREDIT_LINK_V2_HMAC_KEYS_JSON") ?? "null",
    );
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
      return reply(503, { error: "signing_not_configured" });
    }
    secret = Object.hasOwn(keys, keyId)
      ? (keys as Record<string, unknown>)[keyId]
      : undefined;
  } catch {
    return reply(503, { error: "signing_not_configured" });
  }
  if (
    typeof secret !== "string" || new TextEncoder().encode(secret).length < 32
  ) return reply(401, { error: "invalid_signature" });
  let rawBody: string;
  try {
    rawBody = await boundedProjectInvoiceBody(request);
  } catch (error) {
    return reply(
      error instanceof Error && error.message === "payload_too_large"
        ? 413
        : error instanceof Error && error.message === "body_timeout"
        ? 408
        : 400,
      { error: "invalid_body" },
    );
  }
  const timestamp = request.headers.get("x-eventflow-timestamp"),
    nonce = request.headers.get("x-eventflow-nonce");
  if (
    !await verifyV2({
      secret,
      keyId,
      timestamp,
      nonce,
      signature: request.headers.get("x-eventflow-signature"),
      rawBody,
      nowSeconds: (deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))(),
    })
  ) return reply(401, { error: "invalid_signature" });
  let payload: Awaited<
    ReturnType<typeof validateProjectCreditLinkV2Destination>
  >;
  try {
    payload = await validateProjectCreditLinkV2Destination(JSON.parse(rawBody));
  } catch {
    return reply(400, { error: "invalid_invoice_destination_contract" });
  }
  const url = deps.env("SUPABASE_URL"),
    serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return reply(503, { error: "backend_not_configured" });
  }
  let value: unknown;
  try {
    const backend = await fetchCreditV2Receipt(
      deps.fetch ?? fetch,
      `${
        url.replace(/\/$/, "")
      }/rest/v1/rpc/operations_receive_finance_project_invoice_destination_v2`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_key_id: keyId,
          p_timestamp: timestamp,
          p_nonce: nonce,
          p_raw_body: rawBody,
        }),
        redirect: "error",
      },
    );
    value = backend.value;
    if (!backend.response.ok) {
      const code = value && typeof value === "object"
        ? (value as Record<string, unknown>).code
        : null;
      return reply(
        code === "42501"
          ? 403
          : code === "22023" || code === "22P02"
          ? 422
          : 503,
        {
          error: code === "42501"
            ? "invoice_scope_denied"
            : code === "22023" || code === "22P02"
            ? "invoice_destination_rejected"
            : "backend_unavailable",
        },
      );
    }
  } catch {
    return reply(503, { error: "backend_unavailable" });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return reply(503, { error: "invalid_commit_receipt" });
  }
  const receipt = value as Record<string, unknown>;
  const keys = [
    "schema",
    "outcome",
    "source_organization_id",
    "destination_organization_id",
    "invoice_id",
    "requested_source_revision",
    "applied_source_revision",
    "current_source_revision",
    "request_body_sha256",
    "snapshot_receipt_id",
    "snapshot_fingerprint",
    "receipt_id",
    "shadow_only",
  ];
  const applied = receipt.applied_source_revision,
    current = receipt.current_source_revision;
  if (
    Object.keys(receipt).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(receipt, key)) ||
    receipt.schema !== CREDIT_LINK_RECEIPT_V2 ||
    receipt.shadow_only !== true ||
    receipt.source_organization_id !==
      payload.source_organization_id.toLowerCase() ||
    receipt.destination_organization_id !==
      payload.destination_organization_id.toLowerCase() ||
    receipt.invoice_id !== payload.invoice_id.toLowerCase() ||
    receipt.requested_source_revision !== payload.source_revision ||
    receipt.request_body_sha256 !== await projectInvoiceBodyHash(rawBody) ||
    !["receipt_id", "snapshot_receipt_id"].every((key) =>
      typeof receipt[key] === "string" &&
      PROJECT_INVOICE_UUID.test(receipt[key] as string)
    ) ||
    typeof receipt.snapshot_fingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(receipt.snapshot_fingerprint) ||
    !Number.isSafeInteger(applied) || Number(applied) < 1 ||
    !Number.isSafeInteger(current) || Number(current) < Number(applied) ||
    !(((receipt.outcome === "accepted" || receipt.outcome === "replayed") &&
      (receipt.outcome !== "accepted" || current === applied) &&
      applied === payload.source_revision &&
      receipt.snapshot_fingerprint === await projectInvoiceBodyHash(rawBody)) ||
      (receipt.outcome === "stale" && applied === current &&
        Number(current) > payload.source_revision))
  ) return reply(503, { error: "invalid_commit_receipt" });
  return reply(receipt.outcome === "stale" ? 409 : 200, receipt);
}
