import { handleFinanceProjectInvoiceDestination } from "./handler.ts";
import {
  boundedProjectInvoiceBody,
  projectInvoiceBodyHash,
  signProjectInvoiceDestinationRequest,
  validateProjectInvoiceDestination,
} from "../_shared/finance-project-invoice-destination.ts";
function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const secret = "isolated-invoice-signing-purpose-secret-at-least-32bytes";
const keyId = "fixture_invoice_key",
  stamp = "1900000000",
  nonce = "fixture_nonce_00000001";
const uuids = {
  source: "77777777-7777-4777-8777-777777777777",
  destination: "11111111-1111-4111-8111-111111111111",
  invoice: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  project: "88888888-8888-4888-8888-888888888888",
  destinationProject: "55555555-5555-4555-8555-555555555555",
  allocation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  cost: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  observation: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};
export const destinationFixture = () => ({
  schema_version: "finance-project-invoice-destination-v1",
  source_organization_id: uuids.source,
  destination_organization_id: uuids.destination,
  invoice_id: uuids.invoice,
  source_revision: 1,
  source_publication_fingerprint: "a".repeat(64),
  source_observation_id: uuids.observation,
  provider_document_number: "ISOLATED-5400",
  document_fingerprint: "b".repeat(64),
  invoice_kind: "invoice",
  currency: "SEK",
  recipient_net_minor: 540000,
  invoice_status: "in_approval",
  provider_source_changed: false,
  accounting_state: "booked",
  settlement_state: "paid",
  provider_approval_state: "not_pending",
  credit_relation_coverage: "not_applicable",
  allocations: [{
    allocation_id: uuids.allocation,
    project_id: uuids.project,
    cost_line_id: uuids.cost,
    destination_organization_id: uuids.destination,
    destination_project_id: uuids.destinationProject,
    amount_minor: 540000,
    consumes_commitment: true,
    status: "preliminary",
  }],
});
const env = (name: string) =>
  ({
    OPERATIONS_PROJECT_INVOICE_RECEIVE_ENABLED: "true",
    OPERATIONS_PROJECT_INVOICE_HMAC_KEYS_JSON: JSON.stringify({
      [keyId]: secret,
    }),
    SUPABASE_URL: "http://127.0.0.1:55402",
    SUPABASE_SERVICE_ROLE_KEY: "isolated-local-only",
  } as Record<string, string>)[name];
const request = async (
  raw = JSON.stringify(destinationFixture()),
  changes: Record<string, string> = {},
) =>
  new Request(
    "https://localhost/functions/v1/finance-project-invoice-receive",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-eventflow-key-id": keyId,
        "x-eventflow-timestamp": stamp,
        "x-eventflow-nonce": nonce,
        "x-eventflow-signature": await signProjectInvoiceDestinationRequest(
          secret,
          keyId,
          stamp,
          nonce,
          raw,
        ),
        ...changes,
      },
      body: raw,
    },
  );
Deno.test("destination contract omits source document totals and rejects another recipient", () => {
  const fixture = destinationFixture();
  const valid = validateProjectInvoiceDestination(fixture);
  assert(
    valid.recipient_net_minor === 540000 &&
      valid.allocations[0].status === "preliminary",
  );
  for (
    const bad of [{ ...fixture, signed_net_minor: 540000 }, {
      ...fixture,
      unallocated_minor: 0,
    }, {
      ...fixture,
      allocations: [{
        ...fixture.allocations[0],
        destination_organization_id: uuids.source,
      }],
    }]
  ) {
    let refused = false;
    try {
      validateProjectInvoiceDestination(bad);
    } catch {
      refused = true;
    }
    assert(refused, "source/other recipient leaked");
  }
});
Deno.test("recipient total reconciles and withdrawal is explicit zero empty snapshot", () => {
  const fixture = destinationFixture();
  let refused = false;
  try {
    validateProjectInvoiceDestination({
      ...fixture,
      recipient_net_minor: 540001,
    });
  } catch {
    refused = true;
  }
  assert(refused);
  const withdrawn = validateProjectInvoiceDestination({
    ...fixture,
    source_revision: 2,
    recipient_net_minor: 0,
    allocations: [],
  });
  assert(
    withdrawn.allocations.length === 0 && withdrawn.recipient_net_minor === 0,
  );
});
Deno.test("paid/booked provider state does not confirm unapproved invoice; unresolved credit remains explicit", () => {
  const fixture = destinationFixture();
  assert(
    validateProjectInvoiceDestination(fixture).allocations[0].status ===
      "preliminary",
  );
  const credit = validateProjectInvoiceDestination({
    ...fixture,
    invoice_kind: "credit",
    recipient_net_minor: -540000,
    credit_relation_coverage: "unresolved",
    allocations: [{ ...fixture.allocations[0], amount_minor: -540000 }],
  });
  assert(credit.credit_relation_coverage === "unresolved");
});
Deno.test("disabled receive and invalid signature never reach database", async () => {
  const failFetch: typeof fetch = () => {
    throw new Error("unexpected database call");
  };
  const disabled = await handleFinanceProjectInvoiceDestination(
    await request(),
    { env: () => undefined, fetch: failFetch },
  );
  assert(disabled.status === 503);
  const invalid = await handleFinanceProjectInvoiceDestination(
    await request(undefined, {
      "x-eventflow-signature": "v1=" + "0".repeat(64),
    }),
    { env, nowSeconds: () => 1900000000, fetch: failFetch },
  );
  assert(invalid.status === 401);
  const expired = await handleFinanceProjectInvoiceDestination(
    await request(),
    { env, nowSeconds: () => 1900000121, fetch: failFetch },
  );
  assert(expired.status === 401);
});
Deno.test("personnel-route HMAC cannot authorize invoice receiver", async () => {
  const raw = JSON.stringify(destinationFixture());
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = [
    "POST",
    "operations-personnel-cost-receive",
    "operations-personnel-cost-v1",
    keyId,
    stamp,
    nonce,
    raw,
  ].join("\n");
  const signature = "v1=" +
    Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          cryptoKey,
          new TextEncoder().encode(message),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  const result = await handleFinanceProjectInvoiceDestination(
    await request(raw, { "x-eventflow-signature": signature }),
    {
      env,
      nowSeconds: () => 1900000000,
      fetch: () => {
        throw new Error("wrong purpose reached database");
      },
    },
  );
  assert(result.status === 401);
});
Deno.test("HTTP 200 without exact authoritative acknowledgment is not accepted", async () => {
  const raw = JSON.stringify(destinationFixture());
  const bodyHash = await projectInvoiceBodyHash(raw);
  const receipt = {
    schema: "finance-project-invoice-destination-receipt-v1",
    outcome: "accepted",
    source_organization_id: uuids.source,
    destination_organization_id: uuids.destination,
    invoice_id: uuids.invoice,
    requested_source_revision: 1,
    applied_source_revision: 1,
    current_source_revision: 1,
    request_body_sha256: bodyHash,
    snapshot_receipt_id: uuids.cost,
    snapshot_fingerprint: "c".repeat(64),
    receipt_id: uuids.allocation,
    shadow_only: true,
  };
  // Unit-only abnormal backend responses. Real backend acceptance is proved in the separate native HTTP/Pg harness.
  for (
    const bad of [
      receipt,
      {},
      { ...receipt, extra: true },
      { ...receipt, destination_organization_id: uuids.source },
      { ...receipt, request_body_sha256: "d".repeat(64) },
      { ...receipt, applied_source_revision: 2 },
    ]
  ) {
    const result = await handleFinanceProjectInvoiceDestination(
      await request(raw),
      {
        env,
        nowSeconds: () => 1900000000,
        fetch: async () => Response.json(bad),
      },
    );
    assert(result.status === 503, "unbound acknowledgment accepted");
  }
});
Deno.test("streaming body byte limit applies even when Content-Length is omitted", async () => {
  const result = await handleFinanceProjectInvoiceDestination(
    new Request(
      "https://localhost/functions/v1/finance-project-invoice-receive",
      {
        method: "POST",
        headers: { "x-eventflow-key-id": keyId },
        body: "x".repeat(262145),
      },
    ),
    {
      env,
      fetch: () => {
        throw new Error("oversized body reached backend");
      },
    },
  );
  assert(result.status === 413);
});

Deno.test("withdrawal UUID fields require strings", () => {
  for (
    const field of ["source_organization_id", "destination_organization_id"]
  ) {
    const payload: Record<string, unknown> = {
      ...destinationFixture(),
      allocations: [],
      recipient_net_minor: 0,
    };
    payload[field] = [payload[field]];
    let rejected = false;
    try {
      validateProjectInvoiceDestination(payload);
    } catch {
      rejected = true;
    }
    assert(rejected, field);
  }
});

Deno.test("body deadline denies cancellation completion race", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  let reason = "";
  try {
    await boundedProjectInvoiceBody(
      new Request("https://localhost/finance-project-invoice-receive", {
        method: "POST",
        body,
      }),
    );
  } catch (error) {
    reason = (error as Error).message;
  }
  assert(
    cancelled && reason === "body_timeout",
    "cancelled reader must not become successful empty body",
  );
});
