import {
  type ProjectInvoiceAllocation,
  validateFinanceProjectInvoice,
} from "./finance-project-invoice.ts";
export const PROJECT_INVOICE_DESTINATION_SCHEMA =
  "finance-project-invoice-destination-v1";
export const PROJECT_INVOICE_DESTINATION_RECEIPT_SCHEMA =
  "finance-project-invoice-destination-receipt-v1";
export const PROJECT_INVOICE_RECEIVE_ROUTE = "finance-project-invoice-receive";
export const PROJECT_INVOICE_MAX_BYTES = 256 * 1024;
export const PROJECT_INVOICE_KEY_ID = /^[A-Za-z0-9_-]{4,64}$/;
export const PROJECT_INVOICE_NONCE = /^[A-Za-z0-9_-]{16,128}$/;
export const PROJECT_INVOICE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
export interface ProjectInvoiceDestination {
  schema_version: typeof PROJECT_INVOICE_DESTINATION_SCHEMA;
  source_organization_id: string;
  destination_organization_id: string;
  invoice_id: string;
  source_revision: number;
  source_publication_fingerprint: string;
  source_observation_id: string;
  provider_document_number: string;
  document_fingerprint: string;
  invoice_kind: "invoice" | "credit";
  currency: string;
  recipient_net_minor: number;
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
export function validateProjectInvoiceDestination(
  input: unknown,
): ProjectInvoiceDestination {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("destination_object_required");
  }
  const value = input as Record<string, unknown>;
  const fields = [
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
  ];
  if (
    Object.keys(value).length !== fields.length ||
    fields.some((key) => !(key in value)) ||
    value.schema_version !== PROJECT_INVOICE_DESTINATION_SCHEMA
  ) {
    throw new Error("destination_exact_fields_required");
  }
  if (
    typeof value.source_organization_id !== "string" ||
    !PROJECT_INVOICE_UUID.test(value.source_organization_id) ||
    typeof value.destination_organization_id !== "string" ||
    !PROJECT_INVOICE_UUID.test(value.destination_organization_id) ||
    typeof value.source_publication_fingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.source_publication_fingerprint) ||
    typeof value.provider_document_number !== "string" ||
    value.provider_document_number.length > 256
  ) {
    throw new Error("destination_identity_invalid");
  }
  // Reuse the existing local invoice validator with the recipient's amount only.
  // Full source totals and other destination allocations never enter this contract.
  const verified = validateFinanceProjectInvoice({
    schema_version: "finance-project-invoice-v1",
    organization_id: value.source_organization_id,
    invoice_id: value.invoice_id,
    source_revision: value.source_revision,
    source_observation_id: value.source_observation_id,
    provider_document_number: value.provider_document_number,
    document_fingerprint: value.document_fingerprint,
    invoice_kind: value.invoice_kind,
    currency: value.currency,
    signed_net_minor: value.recipient_net_minor,
    unallocated_minor: 0,
    invoice_status: value.invoice_status,
    provider_source_changed: value.provider_source_changed,
    accounting_state: value.accounting_state,
    settlement_state: value.settlement_state,
    provider_approval_state: value.provider_approval_state,
    credit_relation_coverage: value.credit_relation_coverage,
    allocations: value.allocations,
  });
  if (
    verified.allocations.some((line) =>
      line.destination_organization_id.toLowerCase() !==
        String(value.destination_organization_id).toLowerCase()
    )
  ) {
    throw new Error("other_destination_allocation_denied");
  }
  if (
    new Set(
      verified.allocations.map((line) => line.allocation_id.toLowerCase()),
    ).size !== verified.allocations.length
  ) {
    throw new Error("duplicate_allocation_identity");
  }
  return JSON.parse(JSON.stringify(value)) as ProjectInvoiceDestination;
}
export function projectInvoiceSignatureMessage(
  keyId: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return [
    "POST",
    PROJECT_INVOICE_RECEIVE_ROUTE,
    PROJECT_INVOICE_DESTINATION_SCHEMA,
    keyId,
    timestamp,
    nonce,
    rawBody,
  ].join("\n");
}
export async function projectInvoiceBodyHash(rawBody: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(rawBody)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function signProjectInvoiceDestinationRequest(
  secret: string,
  keyId: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return "v1=" +
    Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          encoder.encode(
            projectInvoiceSignatureMessage(keyId, timestamp, nonce, rawBody),
          ),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
}
export async function verifyProjectInvoiceDestinationRequest(
  input: {
    secret: string;
    keyId: string | null;
    timestamp: string | null;
    nonce: string | null;
    signature: string | null;
    rawBody: string;
    nowSeconds: number;
  },
): Promise<boolean> {
  const { secret, keyId, timestamp, nonce, signature, rawBody, nowSeconds } =
    input;
  if (
    encoder.encode(secret).length < 32 || !keyId ||
    !PROJECT_INVOICE_KEY_ID.test(keyId) || !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    !nonce || !PROJECT_INVOICE_NONCE.test(nonce) || !signature ||
    !/^v1=[0-9a-f]{64}$/.test(signature) ||
    !Number.isSafeInteger(nowSeconds) ||
    Math.abs(Number(timestamp) - nowSeconds) > 120
  ) return false;
  const expected = await signProjectInvoiceDestinationRequest(
    secret,
    keyId,
    timestamp,
    nonce,
    rawBody,
  );
  let different = 0;
  for (let n = 0; n < expected.length; n++) {
    different |= expected.charCodeAt(n) ^ signature.charCodeAt(n);
  }
  return different === 0;
}
export async function boundedProjectInvoiceBody(
  request: Request,
): Promise<string> {
  const length = request.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > PROJECT_INVOICE_MAX_BYTES)
  ) throw new Error("payload_too_large");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("body_timeout"));
      void reader.cancel().catch(() => {});
    }, 15000);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (timedOut) throw new Error("body_timeout");
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > PROJECT_INVOICE_MAX_BYTES) {
        void reader.cancel().catch(() => {});
        throw new Error("payload_too_large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(data);
}
