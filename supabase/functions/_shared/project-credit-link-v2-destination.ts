import {
  type ProjectInvoiceDestination,
  validateProjectInvoiceDestination,
} from "./finance-project-invoice-destination.ts";
/** Credit link identity only. This module never computes cost or authorizes a link. */
export const creditAnchorPurpose =
  "finance-invoice-allocation-source-anchor-v1";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface CreditSourceAnchorInput {
  organizationId: string;
  invoiceId: string;
  allocationId: string;
  documentFingerprint: string;
  currency: string;
}
export function creditAnchorBytes(
  input: CreditSourceAnchorInput,
): Uint8Array<ArrayBuffer> {
  for (
    const value of [input.organizationId, input.invoiceId, input.allocationId]
  ) {
    if (typeof value !== "string" || !uuid.test(value)) {
      throw new Error("Invalid anchor UUID");
    }
  }
  if (
    typeof input.documentFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/i.test(input.documentFingerprint)
  ) {
    throw new Error("Invalid anchor document fingerprint");
  }
  if (
    typeof input.currency !== "string" || !/^[a-z]{3}$/i.test(input.currency)
  ) {
    throw new Error("Invalid anchor currency");
  }
  return new TextEncoder().encode(
    [
      creditAnchorPurpose,
      input.organizationId.toLowerCase(),
      input.invoiceId.toLowerCase(),
      input.allocationId.toLowerCase(),
      input.documentFingerprint.toLowerCase(),
      input.currency.toUpperCase(),
    ].join("\n"),
  );
}
export async function creditSourceAnchor(
  input: CreditSourceAnchorInput,
): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", creditAnchorBytes(input)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export const CREDIT_LINK_DESTINATION_V2 =
  "finance-project-invoice-destination-v2";
export const CREDIT_LINK_ROUTE_V2 = "finance-project-invoice-receive-v2";
export const CREDIT_LINK_RECEIPT_V2 =
  "finance-project-invoice-destination-receipt-v2";
export type CreditLinkV2Allocation =
  & ProjectInvoiceDestination["allocations"][number]
  & {
    source_anchor: string;
    credited_source_anchor: string | null;
  };
export type ProjectCreditLinkV2Destination =
  & Omit<
    ProjectInvoiceDestination,
    "schema_version" | "allocations" | "credit_relation_coverage"
  >
  & {
    schema_version: typeof CREDIT_LINK_DESTINATION_V2;
    source_economic_revision: number;
    source_economic_publication_fingerprint: string;
    credit_relationship_fingerprint: string | null;
    credit_relation_coverage: "not_applicable" | "unresolved" | "linked";
    allocations: CreditLinkV2Allocation[];
  };
const keys = [
  "schema_version",
  "source_organization_id",
  "destination_organization_id",
  "invoice_id",
  "source_revision",
  "source_publication_fingerprint",
  "source_observation_id",
  "provider_document_number",
  "document_fingerprint",
  "invoice_kind",
  "currency",
  "recipient_net_minor",
  "invoice_status",
  "provider_source_changed",
  "accounting_state",
  "settlement_state",
  "provider_approval_state",
  "credit_relation_coverage",
  "allocations",
  "source_economic_revision",
  "source_economic_publication_fingerprint",
  "credit_relationship_fingerprint",
];
const allocationKeys = [
  "allocation_id",
  "project_id",
  "cost_line_id",
  "destination_organization_id",
  "destination_project_id",
  "amount_minor",
  "consumes_commitment",
  "status",
  "source_anchor",
  "credited_source_anchor",
];
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
/** Validates signed evidence shape and own identity. It NEVER resolves or authorizes an original obligation. */
export async function validateProjectCreditLinkV2Destination(
  input: unknown,
): Promise<ProjectCreditLinkV2Destination> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("credit_destination_object_required");
  }
  const p = input as Record<string, unknown>;
  if (
    Object.keys(p).length !== 22 ||
    keys.some((k) => !Object.hasOwn(p, k)) ||
    p.schema_version !== CREDIT_LINK_DESTINATION_V2
  ) {
    throw new Error("credit_destination_exact_fields");
  }
  if (
    !Number.isSafeInteger(p.source_economic_revision) ||
    (p.source_economic_revision as number) < 1 ||
    !hash(p.source_economic_publication_fingerprint) ||
    (p.credit_relationship_fingerprint !== null &&
      !hash(p.credit_relationship_fingerprint))
  ) {
    throw new Error("credit_destination_economic_binding");
  }
  if (
    !["not_applicable", "unresolved", "linked"].includes(
      p.credit_relation_coverage as string,
    )
  ) {
    throw new Error("credit_destination_coverage");
  }
  if (!Array.isArray(p.allocations) || p.allocations.length > 10000) {
    throw new Error("credit_destination_allocations");
  }
  const baseRows = p.allocations.map((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("credit_allocation_object");
    }
    const a = row as Record<string, unknown>;
    if (
      Object.keys(a).length !== 10 ||
      allocationKeys.some((k) => !Object.hasOwn(a, k)) ||
      !hash(a.source_anchor) ||
      (a.credited_source_anchor !== null && !hash(a.credited_source_anchor))
    ) {
      throw new Error("credit_allocation_exact_fields");
    }
    return Object.fromEntries(allocationKeys.slice(0, 8).map((k) => [k, a[k]]));
  });
  const base = Object.fromEntries(keys.slice(0, 19).map((k) => [k, p[k]]));
  base.schema_version = "finance-project-invoice-destination-v1";
  base.allocations = baseRows;
  base.credit_relation_coverage = p.invoice_kind === "credit"
    ? "unresolved"
    : "not_applicable";
  validateProjectInvoiceDestination(base);
  if (
    p.invoice_kind === "invoice" &&
    (p.credit_relation_coverage !== "not_applicable" ||
      p.credit_relationship_fingerprint !== null ||
      p.allocations.some((a) => a.credited_source_anchor !== null))
  ) {
    throw new Error("original_cannot_claim_credit_link");
  }
  if (
    p.invoice_kind === "credit" &&
    (p.credit_relation_coverage === "not_applicable" ||
      (p.credit_relation_coverage === "linked" &&
        (p.credit_relationship_fingerprint === null ||
          p.allocations.length === 0 ||
          p.allocations.some((a) => a.credited_source_anchor === null))))
  ) {
    throw new Error("linked_credit_requires_selected_anchors");
  }
  const anchors = new Set<string>();
  for (const row of p.allocations as CreditLinkV2Allocation[]) {
    const expected = await creditSourceAnchor({
      organizationId: p.source_organization_id as string,
      invoiceId: p.invoice_id as string,
      allocationId: row.allocation_id,
      documentFingerprint: p.document_fingerprint as string,
      currency: p.currency as string,
    });
    if (
      row.source_anchor !== expected ||
      anchors.has(expected) ||
      row.credited_source_anchor === expected
    ) {
      throw new Error("credit_source_anchor_mismatch");
    }
    anchors.add(expected);
  }
  return p as unknown as ProjectCreditLinkV2Destination;
}
export function projectCreditLinkV2SigningMessage(
  rawBody: string,
  keyId: string,
  timestamp: string,
  nonce: string,
): string {
  if (
    typeof rawBody !== "string" ||
    typeof keyId !== "string" ||
    !/^[A-Za-z0-9_-]{4,64}$/.test(keyId) ||
    typeof timestamp !== "string" ||
    !/^[1-9][0-9]{0,11}$/.test(timestamp) ||
    typeof nonce !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)
  ) {
    throw new Error("credit_signature_input");
  }
  return [
    "POST",
    CREDIT_LINK_ROUTE_V2,
    CREDIT_LINK_DESTINATION_V2,
    keyId,
    timestamp,
    nonce,
    rawBody,
  ].join("\n");
}
export async function signProjectCreditLinkV2Destination(
  rawBody: string,
  keyId: string,
  secret: string,
  timestamp: string,
  nonce: string,
): Promise<string> {
  if (
    typeof secret !== "string" || new TextEncoder().encode(secret).length < 32
  ) {
    throw new Error("credit_signature_key");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return (
    "v1=" +
    [
      ...new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(
            projectCreditLinkV2SigningMessage(rawBody, keyId, timestamp, nonce),
          ),
        ),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}
