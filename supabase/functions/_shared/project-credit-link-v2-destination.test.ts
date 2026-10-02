import { creditSourceAnchor } from "./project-credit-link-v2-destination.ts";
import {
  projectCreditLinkV2SigningMessage,
  signProjectCreditLinkV2Destination,
  validateProjectCreditLinkV2Destination,
} from "./project-credit-link-v2-destination.ts";
import { signProjectInvoiceDestinationRequest } from "./finance-project-invoice-destination.ts";
function assert(value: boolean) {
  if (!value) throw new Error("Assertion failed");
}
async function fixture(kind: "invoice" | "credit" = "invoice") {
  const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const invoiceId = kind === "invoice"
    ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    : "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const allocationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const documentFingerprint = "d".repeat(64);
  return {
    schema_version: "finance-project-invoice-destination-v2",
    source_organization_id: organizationId,
    destination_organization_id: "11111111-1111-4111-8111-111111111111",
    invoice_id: invoiceId,
    source_revision: 1,
    source_publication_fingerprint: "f".repeat(64),
    source_observation_id: "22222222-2222-4222-8222-222222222222",
    provider_document_number: "protocol-vector",
    document_fingerprint: documentFingerprint,
    invoice_kind: kind,
    currency: "SEK",
    recipient_net_minor: kind === "invoice" ? 2000 : -2000,
    invoice_status: "received",
    provider_source_changed: false,
    accounting_state: "booked",
    settlement_state: "paid",
    provider_approval_state: "not_pending",
    credit_relation_coverage: kind === "invoice"
      ? "not_applicable"
      : "unresolved",
    source_economic_revision: 3,
    source_economic_publication_fingerprint: "3".repeat(64),
    credit_relationship_fingerprint: null as string | null,
    allocations: [
      {
        allocation_id: allocationId,
        project_id: "33333333-3333-4333-8333-333333333333",
        cost_line_id: "44444444-4444-4444-8444-444444444444",
        destination_organization_id: "11111111-1111-4111-8111-111111111111",
        destination_project_id: "55555555-5555-4555-8555-555555555555",
        amount_minor: kind === "invoice" ? 2000 : -2000,
        consumes_commitment: kind === "invoice",
        status: "preliminary",
        source_anchor: await creditSourceAnchor({
          organizationId,
          invoiceId,
          allocationId,
          documentFingerprint,
          currency: "SEK",
        }),
        credited_source_anchor: null as string | null,
      },
    ],
  };
}
Deno.test(
  "v2 original and unresolved credit exact selected evidence, withdrawal zero",
  async () => {
    for (const kind of ["invoice", "credit"] as const) {
      const p = await fixture(kind);
      assert(
        (await validateProjectCreditLinkV2Destination(p))
          .source_economic_revision === 3,
      );
      const withdrawal = { ...p, recipient_net_minor: 0, allocations: [] };
      assert(
        (await validateProjectCreditLinkV2Destination(withdrawal)).allocations
          .length === 0,
      );
    }
  },
);
Deno.test(
  "v2 exact fields, own-anchor binding, private recipient and safe economic revisions",
  async () => {
    const p = await fixture();
    for (
      const value of [
        { ...p, original_invoice_id: p.invoice_id },
        { ...p, source_economic_revision: 0 },
        { ...p, source_economic_revision: Number.MAX_SAFE_INTEGER + 1 },
        {
          ...p,
          allocations: [{ ...p.allocations[0], source_anchor: "0".repeat(64) }],
        },
        {
          ...p,
          allocations: [
            {
              ...p.allocations[0],
              destination_organization_id:
                "99999999-9999-4999-8999-999999999999",
            },
          ],
        },
        {
          ...p,
          allocations: [{ ...p.allocations[0], original_amount_minor: 2000 }],
        },
      ]
    ) {
      let denied = false;
      try {
        await validateProjectCreditLinkV2Destination(value);
      } catch {
        denied = true;
      }
      assert(denied);
    }
  },
);
Deno.test(
  "linked metadata requires opaque original anchor and private relationship fingerprint, never caller EAC",
  async () => {
    const p = await fixture("credit");
    let denied = false;
    try {
      await validateProjectCreditLinkV2Destination({
        ...p,
        credit_relation_coverage: "linked",
      });
    } catch {
      denied = true;
    }
    assert(denied);
    // Wire shape only: no original-obligation resolution or economic eligibility is performed here.
    const linked = {
      ...p,
      credit_relation_coverage: "linked",
      credit_relationship_fingerprint: "1".repeat(64),
      allocations: [{
        ...p.allocations[0],
        credited_source_anchor: "2".repeat(64),
      }],
    };
    assert(
      (await validateProjectCreditLinkV2Destination(linked))
        .credit_relation_coverage === "linked",
    );
    denied = false;
    try {
      await validateProjectCreditLinkV2Destination({ ...linked, eac_minor: 0 });
    } catch {
      denied = true;
    }
    assert(denied);
  },
);
Deno.test("v2 HMAC exact locked purpose is separated from v1 and rejects coercion", async () => {
  const secret = "isolated-credit-v2-purpose-key-at-least-32-bytes";
  const timestamp = "1790899200";
  const nonce = "fixture_nonce_v2_0001";
  const signature = await signProjectCreditLinkV2Destination(
    "{}",
    "fixture_credit_v2",
    secret,
    timestamp,
    nonce,
  );
  assert(
    signature ===
      "v1=df7c62194fe0f4f7bf5ea30eb9a2e1b68ea8ff8969fa9b9ee47acdd886cbf990",
  );
  assert(
    signature !==
      (await signProjectInvoiceDestinationRequest(
        secret,
        "fixture_credit_v2",
        timestamp,
        nonce,
        "{}",
      )),
  );
  assert(
    projectCreditLinkV2SigningMessage(
      "{}",
      "fixture_credit_v2",
      timestamp,
      nonce,
    ).split(
      "\n",
    )[1] === "finance-project-invoice-receive-v2",
  );
  let denied = false;
  try {
    projectCreditLinkV2SigningMessage(
      "{}",
      "fixture_credit_v2",
      timestamp,
      "bad\nnonce",
    );
  } catch {
    denied = true;
  }
  assert(denied);
});

Deno.test("Operations own anchor matches locked Finance canonical bytes", async () => {
  assert(
    await creditSourceAnchor({
      organizationId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      invoiceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      allocationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      documentFingerprint: "D".repeat(64),
      currency: "sek",
    }) === "675114e775937545947fda78ce6c291bb64b4af3ff663d2df8dee668c5abb50b",
  );
});
