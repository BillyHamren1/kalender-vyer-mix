/**
 * Source-only, default-off projection boundary.
 *
 * The caller must obtain the hired authority rows through the existing
 * authenticated Operations reader and the invoice rows from the same validated
 * scope-capture boundary.  This function performs no database read, pricing,
 * approval, forecast or runtime admission.
 */
import {
  validateHiredPublishedSourceMetadata,
  type HiredPublishedSourceMetadata,
} from "./hired-personnel-authority.ts";

type RootKind = "project" | "large_project" | "packing_project";
type MappingState = "charging" | "excluded" | "unsupported_basis";

export interface HiredScopeInvoiceReference {
  source_anchor: string;
  project_id: string;
  obligation_id: string;
  binding_event_id: string;
  source_economic_revision: number;
  source_economic_fingerprint: string;
  mapping_state: MappingState;
  reason: string | null;
}

export interface HiredScopeCoverageInput {
  schema_version: "operations-hired-scope-coverage-input.v1";
  organization_id: string;
  economic_scope_id: string;
  root_kind: RootKind;
  root_id: string;
  scope_snapshot_id: string;
  scope_revision: number;
  membership_fingerprint: string;
  composition_snapshot_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  captured_inventory_fingerprint: string;
  membership_currentness: "as_of_graph";
  source_currentness: "saved_receiver_heads_only";
  source_project_ids: string[];
  local_booking_ids: string[];
  hired_sources: Array<{
    authority: unknown;
    invoice_inventory: HiredScopeInvoiceReference;
  }>;
}

export interface HiredOperationalCoverageRow {
  sourceIdentity: string;
  projectId: string;
  obligationId: string;
  assignmentEventId: string;
  assignmentRevision: number;
  assignmentFingerprint: string;
  basisEventId: string;
  invoiceBindingEventId: string;
  invoiceSourceAnchor: string;
  invoiceEconomicRevision: number;
  invoiceEconomicFingerprint: string;
  state: "current_operational_only" | "unresolved";
  reason: string | null;
  sourceKind: "time" | "catering";
  sourceRevision: number;
  sourceCoverage: "complete" | "missing_rate";
  sourceCurrency: string;
  sourceCalculatedAmountMinor: number | null;
  disposition: "operational_only";
  economicCostAuthority: "existing_invoice_allocation_only";
  invoiceRelationState: "charging" | "unavailable";
  additionalCostMinor: null;
  replacesEstimateMinor: 0;
  consumesCommitmentMinor: 0;
}

export interface HiredObligationCoverageProjection {
  schema_version: "operations-hired-obligation-coverage-projection.v1";
  authority_scope: "validated_hired_authority_and_scope_invoice_capture";
  organization_id: string;
  economic_scope_id: string;
  root_kind: RootKind;
  root_id: string;
  scope_snapshot_id: string;
  scope_revision: number;
  membership_fingerprint: string;
  composition_snapshot_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  captured_inventory_fingerprint: string;
  membership_currentness: "as_of_graph";
  source_currentness: "saved_receiver_heads_only";
  sourceProjectCount: number;
  localBookingCount: number;
  state: "no_evidence" | "evidence";
  operationalSources: HiredOperationalCoverageRow[];
  economicChargeReferences: Array<{
    sourceAnchor: string;
    projectId: string;
    obligationId: string;
    bindingEventId: string;
    sourceEconomicRevision: number;
    sourceEconomicFingerprint: string;
    countedBy: "scope_invoice_capture";
  }>;
  diagnostics: string[];
  category_coverage: {
    personnel: "unavailable";
    supplier: "unavailable";
    catering: "unavailable";
    other: "unavailable";
  };
  source_coverage: "unavailable";
  credit_eligible: false;
  additional_cost_minor: null;
  remaining_minor: null;
  eac_minor: null;
  budget_minor: null;
  margin_minor: null;
  economic_totals_admission: false;
  runtime_admission: false;
  shadow_only: true;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const UNRESOLVED_REASONS = new Set([
  "basis_or_baseline_changed",
  "currency_changed",
  "invoice_economics_changed",
  "source_or_invoice_changed",
  "source_or_invoice_denied",
  "saved_source_line_unavailable",
]);
const AUTHORITY_KEYS = new Set([
  "schema_version",
  "organization_id",
  "project_id",
  "obligation_id",
  "source_identity",
  "state",
  "reason",
  "current_source",
  "historical_source",
  "assignment_event_id",
  "assignment_revision",
  "assignment_fingerprint",
  "basis_event_id",
  "invoice_binding_event_id",
  "disposition",
  "replaces_estimate_minor",
  "consumes_commitment_minor",
  "category_coverage",
  "source_coverage",
  "eac_minor",
  "remaining_minor",
  "shadow_only",
  "credit_eligible",
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_hired_scope_coverage");
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const row = object(value);
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    throw new Error("invalid_hired_scope_coverage");
  return row;
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function hash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function text(value: unknown, maximum = 256): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    Array.from(value).length <= maximum &&
    !value.includes("\0")
  );
}
function compareUtf8(a: string, b: string): number {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(aa.length, bb.length); i += 1)
    if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}
function canonicalIds(values: unknown, kind: "uuid" | "text"): string[] {
  if (!Array.isArray(values) || values.length > 1000)
    throw new Error("invalid_hired_scope_membership");
  const result = values.map((value) => {
    if (kind === "uuid") {
      if (!uuid(value)) throw new Error("invalid_hired_scope_membership");
      return value;
    }
    if (!text(value)) throw new Error("invalid_hired_scope_membership");
    return value;
  });
  if (
    new Set(result).size !== result.length ||
    result.some((value, index) => index > 0 && compareUtf8(result[index - 1], value) >= 0)
  )
    throw new Error("noncanonical_hired_scope_membership");
  return result;
}

type AssignedAuthority = {
  organization_id: string;
  project_id: string;
  obligation_id: string;
  source_identity: string;
  state: "current_operational_only" | "unresolved";
  reason: string | null;
  current_source: HiredPublishedSourceMetadata | null;
  historical_source: HiredPublishedSourceMetadata;
  assignment_event_id: string;
  assignment_revision: number;
  assignment_fingerprint: string;
  basis_event_id: string;
  invoice_binding_event_id: string;
  disposition: "operational_only";
  replaces_estimate_minor: 0;
  consumes_commitment_minor: 0;
};

function assignedAuthority(value: unknown): AssignedAuthority {
  const row = object(value);
  if (
    Object.keys(row).length !== AUTHORITY_KEYS.size ||
    Object.keys(row).some((key) => !AUTHORITY_KEYS.has(key)) ||
    [...AUTHORITY_KEYS].some((key) => !Object.hasOwn(row, key)) ||
    row.schema_version !== "operations-hired-source-authority.v1" ||
    !uuid(row.organization_id) ||
    !uuid(row.project_id) ||
    !uuid(row.obligation_id) ||
    !hash(row.source_identity) ||
    !["current_operational_only", "unresolved"].includes(row.state as string) ||
    !uuid(row.assignment_event_id) ||
    !positive(row.assignment_revision) ||
    !hash(row.assignment_fingerprint) ||
    !uuid(row.basis_event_id) ||
    !uuid(row.invoice_binding_event_id) ||
    row.disposition !== "operational_only" ||
    row.replaces_estimate_minor !== 0 ||
    row.consumes_commitment_minor !== 0 ||
    row.category_coverage !== "unavailable" ||
    row.source_coverage !== "unavailable" ||
    row.eac_minor !== null ||
    row.remaining_minor !== null ||
    row.shadow_only !== true ||
    row.credit_eligible !== false
  )
    throw new Error("invalid_hired_authority_evidence");
  const historical = validateHiredPublishedSourceMetadata(row.historical_source);
  let current: HiredPublishedSourceMetadata | null = null;
  if (row.state === "current_operational_only") {
    if (row.reason !== null) throw new Error("invalid_current_hired_authority");
    current = validateHiredPublishedSourceMetadata(row.current_source);
    if (
      current.source_kind !== historical.source_kind ||
      current.source_stream_id !== historical.source_stream_id ||
      current.source_line_id !== historical.source_line_id
    )
      throw new Error("changed_hired_source_identity");
  } else {
    if (!text(row.reason, 64) || !UNRESOLVED_REASONS.has(row.reason as string))
      throw new Error("invalid_unresolved_hired_reason");
    if (row.current_source !== null)
      throw new Error("unresolved_hired_source_has_current_value");
  }
  return {
    organization_id: row.organization_id,
    project_id: row.project_id,
    obligation_id: row.obligation_id,
    source_identity: row.source_identity,
    state: row.state as AssignedAuthority["state"],
    reason: row.reason as string | null,
    current_source: current,
    historical_source: historical,
    assignment_event_id: row.assignment_event_id,
    assignment_revision: row.assignment_revision,
    assignment_fingerprint: row.assignment_fingerprint,
    basis_event_id: row.basis_event_id,
    invoice_binding_event_id: row.invoice_binding_event_id,
    disposition: "operational_only",
    replaces_estimate_minor: 0,
    consumes_commitment_minor: 0,
  };
}

function invoiceReference(value: unknown): HiredScopeInvoiceReference {
  const row = exact(value, [
    "source_anchor",
    "project_id",
    "obligation_id",
    "binding_event_id",
    "source_economic_revision",
    "source_economic_fingerprint",
    "mapping_state",
    "reason",
  ]);
  if (
    !hash(row.source_anchor) ||
    !uuid(row.project_id) ||
    !uuid(row.obligation_id) ||
    !uuid(row.binding_event_id) ||
    !positive(row.source_economic_revision) ||
    !hash(row.source_economic_fingerprint) ||
    !["charging", "excluded", "unsupported_basis"].includes(row.mapping_state as string) ||
    (row.mapping_state === "charging"
      ? row.reason !== null
      : !text(row.reason, 128))
  )
    throw new Error("invalid_hired_invoice_reference");
  return row as unknown as HiredScopeInvoiceReference;
}

export function projectHiredObligationCoverage(
  value: unknown,
): HiredObligationCoverageProjection {
  const input = exact(value, [
    "schema_version",
    "organization_id",
    "economic_scope_id",
    "root_kind",
    "root_id",
    "scope_snapshot_id",
    "scope_revision",
    "membership_fingerprint",
    "composition_snapshot_id",
    "composition_revision",
    "composition_fingerprint",
    "captured_inventory_fingerprint",
    "membership_currentness",
    "source_currentness",
    "source_project_ids",
    "local_booking_ids",
    "hired_sources",
  ]);
  if (
    input.schema_version !== "operations-hired-scope-coverage-input.v1" ||
    !uuid(input.organization_id) ||
    !uuid(input.economic_scope_id) ||
    !["project", "large_project", "packing_project"].includes(input.root_kind as string) ||
    !uuid(input.root_id) ||
    !uuid(input.scope_snapshot_id) ||
    !positive(input.scope_revision) ||
    !hash(input.membership_fingerprint) ||
    !uuid(input.composition_snapshot_id) ||
    !positive(input.composition_revision) ||
    !hash(input.composition_fingerprint) ||
    !hash(input.captured_inventory_fingerprint) ||
    input.membership_currentness !== "as_of_graph" ||
    input.source_currentness !== "saved_receiver_heads_only" ||
    !Array.isArray(input.hired_sources) ||
    input.hired_sources.length > 2000
  )
    throw new Error("invalid_hired_scope_coverage");
  const projectIds = canonicalIds(input.source_project_ids, "uuid");
  const bookingIds = canonicalIds(input.local_booking_ids, "text");
  const projectSet = new Set(projectIds);
  const sourceIdentities = new Set<string>();
  const invoiceReferences = new Map<string, string>();
  const chargeReferences = new Map<
    string,
    HiredObligationCoverageProjection["economicChargeReferences"][number]
  >();
  const operationalSources: HiredOperationalCoverageRow[] = [];
  const diagnostics = new Set<string>();

  for (const item of input.hired_sources) {
    const pair = exact(item, ["authority", "invoice_inventory"]);
    const authority = assignedAuthority(pair.authority);
    const invoice = invoiceReference(pair.invoice_inventory);
    if (
      authority.organization_id !== input.organization_id ||
      !projectSet.has(authority.project_id) ||
      invoice.project_id !== authority.project_id ||
      invoice.obligation_id !== authority.obligation_id ||
      invoice.binding_event_id !== authority.invoice_binding_event_id
    )
      throw new Error("cross_scope_hired_evidence");
    if (sourceIdentities.has(authority.source_identity))
      throw new Error("duplicate_hired_source_identity");
    sourceIdentities.add(authority.source_identity);
    const metadata = authority.current_source ?? authority.historical_source;
    if (metadata.project_id !== authority.project_id)
      throw new Error("hired_source_project_changed");
    const prior = chargeReferences.get(invoice.source_anchor);
    const reference = {
      sourceAnchor: invoice.source_anchor,
      projectId: invoice.project_id,
      obligationId: invoice.obligation_id,
      bindingEventId: invoice.binding_event_id,
      sourceEconomicRevision: invoice.source_economic_revision,
      sourceEconomicFingerprint: invoice.source_economic_fingerprint,
      countedBy: "scope_invoice_capture" as const,
    };
    const invoiceIdentity = JSON.stringify({
      ...reference,
      mappingState: invoice.mapping_state,
      reason: invoice.reason,
    });
    const seenInvoiceIdentity = invoiceReferences.get(invoice.source_anchor);
    if (
      (prior && JSON.stringify(prior) !== JSON.stringify(reference)) ||
      (seenInvoiceIdentity && seenInvoiceIdentity !== invoiceIdentity)
    )
      throw new Error("conflicting_hired_invoice_charge_identity");
    invoiceReferences.set(invoice.source_anchor, invoiceIdentity);
    if (invoice.mapping_state === "charging")
      chargeReferences.set(invoice.source_anchor, reference);
    else diagnostics.add(`invoice_relation_unavailable:${authority.source_identity}`);
    if (authority.state === "unresolved")
      diagnostics.add(`hired_source_unresolved:${authority.source_identity}:${authority.reason}`);
    if (metadata.coverage === "missing_rate")
      diagnostics.add(`hired_source_rate_unavailable:${authority.source_identity}`);
    operationalSources.push({
      sourceIdentity: authority.source_identity,
      projectId: authority.project_id,
      obligationId: authority.obligation_id,
      assignmentEventId: authority.assignment_event_id,
      assignmentRevision: authority.assignment_revision,
      assignmentFingerprint: authority.assignment_fingerprint,
      basisEventId: authority.basis_event_id,
      invoiceBindingEventId: authority.invoice_binding_event_id,
      invoiceSourceAnchor: invoice.source_anchor,
      invoiceEconomicRevision: invoice.source_economic_revision,
      invoiceEconomicFingerprint: invoice.source_economic_fingerprint,
      state: authority.state,
      reason: authority.reason,
      sourceKind: metadata.source_kind,
      sourceRevision: metadata.source_revision,
      sourceCoverage: metadata.coverage,
      sourceCurrency: metadata.currency,
      sourceCalculatedAmountMinor: metadata.amount_minor,
      disposition: "operational_only",
      economicCostAuthority: "existing_invoice_allocation_only",
      invoiceRelationState:
        invoice.mapping_state === "charging" ? "charging" : "unavailable",
      additionalCostMinor: null,
      replacesEstimateMinor: 0,
      consumesCommitmentMinor: 0,
    });
  }
  operationalSources.sort((a, b) => compareUtf8(a.sourceIdentity, b.sourceIdentity));
  const economicChargeReferences = [...chargeReferences.values()].sort((a, b) =>
    compareUtf8(a.sourceAnchor, b.sourceAnchor)
  );
  return {
    schema_version: "operations-hired-obligation-coverage-projection.v1",
    authority_scope: "validated_hired_authority_and_scope_invoice_capture",
    organization_id: input.organization_id as string,
    economic_scope_id: input.economic_scope_id as string,
    root_kind: input.root_kind as RootKind,
    root_id: input.root_id as string,
    scope_snapshot_id: input.scope_snapshot_id as string,
    scope_revision: input.scope_revision as number,
    membership_fingerprint: input.membership_fingerprint as string,
    composition_snapshot_id: input.composition_snapshot_id as string,
    composition_revision: input.composition_revision as number,
    composition_fingerprint: input.composition_fingerprint as string,
    captured_inventory_fingerprint: input.captured_inventory_fingerprint as string,
    membership_currentness: "as_of_graph",
    source_currentness: "saved_receiver_heads_only",
    sourceProjectCount: projectIds.length,
    localBookingCount: bookingIds.length,
    state: operationalSources.length ? "evidence" : "no_evidence",
    operationalSources,
    economicChargeReferences,
    diagnostics: [...diagnostics].sort(compareUtf8),
    category_coverage: {
      personnel: "unavailable",
      supplier: "unavailable",
      catering: "unavailable",
      other: "unavailable",
    },
    source_coverage: "unavailable",
    credit_eligible: false,
    additional_cost_minor: null,
    remaining_minor: null,
    eac_minor: null,
    budget_minor: null,
    margin_minor: null,
    economic_totals_admission: false,
    runtime_admission: false,
    shadow_only: true,
  };
}
