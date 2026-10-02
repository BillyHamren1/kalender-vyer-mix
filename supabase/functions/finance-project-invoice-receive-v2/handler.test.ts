import { handleFinanceProjectCreditV2Destination } from "./handler.ts";
import {
  creditSourceAnchor,
  signProjectCreditLinkV2Destination,
} from "../_shared/project-credit-link-v2-destination.ts";
import { signProjectInvoiceDestinationRequest } from "../_shared/finance-project-invoice-destination.ts";
const secret = "isolated-credit-v2-handler-key-at-least-32-bytes";
const keyId = "fixture_credit_v2",
  timestamp = "1790899200",
  nonce = "fixture_v2_handler_nonce1";
const values: Record<string, string> = {
  OPERATIONS_PROJECT_CREDIT_LINK_V2_RECEIVE_ENABLED: "true",
  OPERATIONS_PROJECT_CREDIT_LINK_V2_HMAC_KEYS_JSON: JSON.stringify({
    [keyId]: secret,
  }),
};
const deps = {
  env: (name: string) => values[name],
  nowSeconds: () => Number(timestamp),
};
function assert(value: boolean) {
  if (!value) throw new Error("Assertion failed");
}
async function payload() {
  const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    invoiceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const allocationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    documentFingerprint = "d".repeat(64);
  return {
    schema_version: "finance-project-invoice-destination-v2",
    source_organization_id: organizationId,
    destination_organization_id: "11111111-1111-4111-8111-111111111111",
    invoice_id: invoiceId,
    source_revision: 1,
    source_publication_fingerprint: "f".repeat(64),
    source_observation_id: "22222222-2222-4222-8222-222222222222",
    provider_document_number: "ISOLATED",
    document_fingerprint: documentFingerprint,
    invoice_kind: "invoice",
    currency: "SEK",
    recipient_net_minor: 540000,
    invoice_status: "in_approval",
    provider_source_changed: false,
    accounting_state: "booked",
    settlement_state: "unpaid",
    provider_approval_state: "pending",
    credit_relation_coverage: "not_applicable",
    source_economic_revision: 1,
    source_economic_publication_fingerprint: "e".repeat(64),
    credit_relationship_fingerprint: null,
    allocations: [{
      allocation_id: allocationId,
      project_id: "33333333-3333-4333-8333-333333333333",
      cost_line_id: "44444444-4444-4444-8444-444444444444",
      destination_organization_id: "11111111-1111-4111-8111-111111111111",
      destination_project_id: "55555555-5555-4555-8555-555555555555",
      amount_minor: 540000,
      consumes_commitment: true,
      status: "preliminary",
      source_anchor: await creditSourceAnchor({
        organizationId,
        invoiceId,
        allocationId,
        documentFingerprint,
        currency: "SEK",
      }),
      credited_source_anchor: null,
    }],
  };
}
async function request(
  body: string,
  stamp = timestamp,
  signature?: string,
  path = "/functions/v1/finance-project-invoice-receive-v2",
) {
  return new Request(`https://localhost${path}`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-eventflow-key-id": keyId,
      "x-eventflow-timestamp": stamp,
      "x-eventflow-nonce": nonce,
      "x-eventflow-signature": signature ??
        await signProjectCreditLinkV2Destination(
          body,
          keyId,
          secret,
          stamp,
          nonce,
        ),
    },
  });
}
Deno.test("credit-v2 HTTP default-off and exact route stay closed", async () => {
  const response = await handleFinanceProjectCreditV2Destination(
    await request("{}"),
    { env: () => undefined },
  );
  assert(
    response.status === 503 &&
      (await response.json()).error === "invoice_receive_disabled",
  );
  for (
    const path of [
      "/functions/v1/finance-project-invoice-receive",
      "/prefix/finance-project-invoice-receive-v2",
      "/functions/v1/finance-project-invoice-receive-v2?extra=1",
    ]
  ) {
    assert(
      (await handleFinanceProjectCreditV2Destination(
        await request("{}", timestamp, undefined, path),
        deps,
      )).status === 404,
    );
  }
});
Deno.test("credit-v2 HTTP rejects v1 signing purpose, changed bytes and expired/future proofs", async () => {
  const body = JSON.stringify(await payload());
  const v1 = await signProjectInvoiceDestinationRequest(
    secret,
    keyId,
    timestamp,
    nonce,
    body,
  );
  assert(
    (await handleFinanceProjectCreditV2Destination(
      await request(body, timestamp, v1),
      deps,
    )).status === 401,
  );
  const signature = await signProjectCreditLinkV2Destination(
    body,
    keyId,
    secret,
    timestamp,
    nonce,
  );
  assert(
    (await handleFinanceProjectCreditV2Destination(
      await request(body + " ", timestamp, signature),
      deps,
    )).status === 401,
  );
  for (const seconds of [Number(timestamp) - 121, Number(timestamp) + 121]) {
    assert(
      (await handleFinanceProjectCreditV2Destination(
        await request(body, String(seconds)),
        deps,
      )).status === 401,
    );
  }
});
Deno.test("credit-v2 valid source shape reaches backend gate without a fake DB", async () => {
  const response = await handleFinanceProjectCreditV2Destination(
    await request(JSON.stringify(await payload())),
    deps,
  );
  assert(
    response.status === 503 &&
      (await response.json()).error === "backend_not_configured",
  );
});
Deno.test("credit-v2 HTTP rejects private extras and forged own source anchor before backend", async () => {
  const value = await payload();
  for (
    const invalid of [{ ...value, eac_minor: 0 }, {
      ...value,
      allocations: [{ ...value.allocations[0], source_anchor: "0".repeat(64) }],
    }]
  ) {
    const response = await handleFinanceProjectCreditV2Destination(
      await request(JSON.stringify(invalid)),
      deps,
    );
    assert(
      response.status === 400 &&
        (await response.json()).error ===
          "invalid_invoice_destination_contract",
    );
  }
});

// Unit-only transport injection verifies receipt guards; actual PostgREST/DB
// acceptance remains a separate native gate, not established by these fixtures.
async function committedReceipt(body: string, outcome = "accepted") {
  const { projectInvoiceBodyHash } = await import(
    "../_shared/finance-project-invoice-destination.ts"
  );
  return {
    schema: "finance-project-invoice-destination-receipt-v2",
    outcome,
    source_organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    destination_organization_id: "11111111-1111-4111-8111-111111111111",
    invoice_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    requested_source_revision: 1,
    applied_source_revision: 1,
    current_source_revision: 1,
    request_body_sha256: await projectInvoiceBodyHash(body),
    snapshot_receipt_id: "66666666-6666-4666-8666-666666666666",
    snapshot_fingerprint: await projectInvoiceBodyHash(body),
    receipt_id: "77777777-7777-4777-8777-777777777777",
    shadow_only: true,
  };
}
function backendDeps(fetchImpl: typeof fetch) {
  return {
    ...deps,
    env: (name: string) =>
      name === "SUPABASE_URL"
        ? "http://127.0.0.1:1"
        : name === "SUPABASE_SERVICE_ROLE_KEY"
        ? "isolated-unit-service-key"
        : values[name],
    fetch: fetchImpl,
  };
}
Deno.test("unit credit-v2 accepted/replayed/stale strict receipts preserve raw identity", async () => {
  const body = JSON.stringify(await payload());
  for (const outcome of ["accepted", "replayed", "stale"]) {
    const receipt = await committedReceipt(body, outcome);
    if (outcome === "replayed") receipt.current_source_revision = 2;
    if (outcome === "stale") {
      Object.assign(receipt, {
        applied_source_revision: 2,
        current_source_revision: 2,
        snapshot_fingerprint: "8".repeat(64),
      });
    }
    const fetchImpl: typeof fetch = (_url, init) => {
      assert(init?.redirect === "error" && init.signal instanceof AbortSignal);
      return Promise.resolve(Response.json(receipt));
    };
    const response = await handleFinanceProjectCreditV2Destination(
      await request(body),
      backendDeps(fetchImpl),
    );
    assert(response.status === (outcome === "stale" ? 409 : 200));
    assert(
      (await response.json()).request_body_sha256 ===
        receipt.request_body_sha256,
    );
  }
});
Deno.test("unit credit-v2 rejects malformed/hash/tenant/revision/unbound receipt", async () => {
  const body = JSON.stringify(await payload()),
    valid = await committedReceipt(body);
  for (
    const invalid of [
      [],
      { ...valid, extra: true },
      { ...valid, request_body_sha256: "0".repeat(64) },
      { ...valid, snapshot_fingerprint: "0".repeat(64) },
      {
        ...valid,
        destination_organization_id: "99999999-9999-4999-8999-999999999999",
      },
      { ...valid, requested_source_revision: 2 },
      { ...valid, applied_source_revision: 2 },
      { ...valid, current_source_revision: 2 },
      { ...valid, snapshot_receipt_id: [valid.snapshot_receipt_id] },
      { ...valid, outcome: "stale" },
    ]
  ) {
    const response = await handleFinanceProjectCreditV2Destination(
      await request(body),
      backendDeps(() => Promise.resolve(Response.json(invalid))),
    );
    assert(
      response.status === 503 &&
        (await response.json()).error === "invalid_commit_receipt",
    );
  }
});
