/** Shadow evidence only. Never posts official costs or calls an accounting provider. */
export interface ProjectInvoiceAllocation {
  allocation_id: string;
  project_id: string;
  cost_line_id: string;
  destination_organization_id: string;
  destination_project_id: string;
  amount_minor: number;
  consumes_commitment: boolean;
  status: "preliminary" | "confirmed" | "rejected";
}
export interface ProjectInvoiceEvidence {
  schema_version: "finance-project-invoice-v1";
  organization_id: string;
  invoice_id: string;
  source_revision: number;
  source_observation_id: string;
  provider_document_number: string;
  document_fingerprint: string;
  invoice_kind: "invoice" | "credit";
  currency: string;
  signed_net_minor: number;
  unallocated_minor: number;
  invoice_status:
    | "received"
    | "needs_matching"
    | "in_approval"
    | "approved"
    | "rejected"
    | "investigation";
  provider_source_changed: boolean;
  accounting_state: "draft" | "booked" | "cancelled";
  settlement_state: "unpaid" | "part_paid" | "paid" | "inconsistent";
  provider_approval_state: "pending" | "not_pending";
  credit_relation_coverage: "not_applicable" | "unresolved";
  allocations: ProjectInvoiceAllocation[];
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invoice object required");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !(key in value))
  )
    throw new Error("Unexpected invoice fields");
}
function uuid(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value))
    throw new Error("Invalid invoice identity");
}
function integer(value: unknown) {
  if (!Number.isSafeInteger(value))
    throw new Error("Invalid invoice money/revision");
}
export function validateFinanceProjectInvoice(
  input: unknown,
): ProjectInvoiceEvidence {
  const x = obj(input);
  keys(x, [
    "schema_version",
    "organization_id",
    "invoice_id",
    "source_revision",
    "source_observation_id",
    "provider_document_number",
    "document_fingerprint",
    "invoice_kind",
    "currency",
    "signed_net_minor",
    "unallocated_minor",
    "invoice_status",
    "provider_source_changed",
    "accounting_state",
    "settlement_state",
    "provider_approval_state",
    "credit_relation_coverage",
    "allocations",
  ]);
  if (x["schema_version"] !== "finance-project-invoice-v1")
    throw new Error("Unsupported invoice schema");
  for (const k of ["organization_id", "invoice_id", "source_observation_id"])
    uuid(x[k]);
  integer(x["source_revision"]);
  if ((x["source_revision"] as number) < 1)
    throw new Error("Invalid invoice revision");
  if (
    typeof x["provider_document_number"] !== "string" ||
    !x["provider_document_number"].trim() ||
    x["provider_document_number"] !== x["provider_document_number"].trim()
  )
    throw new Error("Provider identity required");
  if (
    typeof x["document_fingerprint"] !== "string" ||
    !/^[0-9a-f]{64}$/.test(x["document_fingerprint"])
  )
    throw new Error("Provider fingerprint required");
  if (x["invoice_kind"] !== "invoice" && x["invoice_kind"] !== "credit")
    throw new Error("Invalid invoice kind");
  if (typeof x["currency"] !== "string" || !/^[A-Z]{3}$/.test(x["currency"]))
    throw new Error("Explicit invoice currency required");
  integer(x["signed_net_minor"]);
  integer(x["unallocated_minor"]);
  if (
    !(
      [
        "received",
        "needs_matching",
        "in_approval",
        "approved",
        "rejected",
        "investigation",
      ] as unknown[]
    ).includes(x["invoice_status"])
  )
    throw new Error("Invalid invoice status");
  if (
    !["draft", "booked", "cancelled"].includes(
      x["accounting_state"] as string,
    ) ||
    !["unpaid", "part_paid", "paid", "inconsistent"].includes(
      x["settlement_state"] as string,
    ) ||
    !["pending", "not_pending"].includes(x["provider_approval_state"] as string)
  )
    throw new Error("Invalid provider state");
  if (typeof x["provider_source_changed"] !== "boolean")
    throw new Error("Provider change coverage required");
  if (
    x["credit_relation_coverage"] !==
    (x["invoice_kind"] === "credit" ? "unresolved" : "not_applicable")
  )
    throw new Error("Credit relationship cannot be fabricated");
  const sign = x["invoice_kind"] === "credit" ? -1 : 1;
  if (
    sign * (x["signed_net_minor"] as number) < 0 ||
    sign * (x["unallocated_minor"] as number) < 0
  )
    throw new Error("Invoice sign mismatch");
  if (!Array.isArray(x["allocations"]) || x["allocations"].length > 10000)
    throw new Error("Complete invoice allocation list required");
  const seen = new Set<string>();
  let total = BigInt(x["unallocated_minor"] as number);
  let destination: string | undefined;
  for (const value of x["allocations"]) {
    const a = obj(value);
    keys(a, [
      "allocation_id",
      "project_id",
      "cost_line_id",
      "destination_organization_id",
      "destination_project_id",
      "amount_minor",
      "consumes_commitment",
      "status",
    ]);
    for (const k of [
      "allocation_id",
      "project_id",
      "cost_line_id",
      "destination_organization_id",
      "destination_project_id",
    ])
      uuid(a[k]);
    if (seen.has(a["allocation_id"] as string))
      throw new Error("Duplicate allocation identity");
    seen.add(a["allocation_id"] as string);
    if (destination && destination !== a["destination_organization_id"])
      throw new Error("Mixed destination tenants");
    destination = a["destination_organization_id"] as string;
    integer(a["amount_minor"]);
    if (sign * (a["amount_minor"] as number) <= 0)
      throw new Error("Allocation sign mismatch");
    if (typeof a["consumes_commitment"] !== "boolean")
      throw new Error("Commitment intent required");
    const expected =
      x["invoice_status"] === "approved"
        ? "confirmed"
        : x["invoice_status"] === "rejected"
          ? "rejected"
          : "preliminary";
    if (a["status"] !== expected)
      throw new Error("Allocation status contradicts invoice");
    total += BigInt(a["amount_minor"] as number);
  }
  if (total !== BigInt(x["signed_net_minor"] as number))
    throw new Error("Invoice allocation reconciliation failed");
  if (
    x["invoice_status"] === "approved" &&
    (x["unallocated_minor"] !== 0 || x["provider_source_changed"])
  )
    throw new Error("Unreviewed invoice cannot be confirmed");
  return JSON.parse(JSON.stringify(x)) as ProjectInvoiceEvidence;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a["localeCompare"](b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function acceptFinanceProjectInvoice(
  previous: unknown | null,
  incoming: unknown,
): {
  outcome: "accepted" | "replayed" | "stale";
  snapshot: ProjectInvoiceEvidence;
} {
  const next = validateFinanceProjectInvoice(incoming);
  if (!previous) return { outcome: "accepted", snapshot: next };
  const prior = validateFinanceProjectInvoice(previous);
  if (
    prior.organization_id !== next.organization_id ||
    prior.invoice_id !== next.invoice_id ||
    prior.provider_document_number !== next.provider_document_number ||
    prior.currency !== next.currency ||
    prior.invoice_kind !== next.invoice_kind
  )
    throw new Error("Invoice stream identity changed");
  if (next.source_revision < prior.source_revision)
    return { outcome: "stale", snapshot: prior };
  if (next.source_revision === prior.source_revision) {
    if (canonical(prior) !== canonical(next))
      throw new Error("Changed invoice revision replay");
    return { outcome: "replayed", snapshot: prior };
  }
  return { outcome: "accepted", snapshot: next };
}
