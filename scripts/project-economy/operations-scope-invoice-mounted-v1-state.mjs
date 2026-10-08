// TEST ONLY: opaque same-server state fingerprints, never user-facing cost evidence.
import { createHash } from "node:crypto";
export const SCOPE_INVOICE_STATE_SCHEMA =
  "operations-scope-invoice-mounted-state.v1";
export const SCOPE_INVOICE_STATE_DATABASE =
  "eventflow_project_evidence_http_runtime";
export const SCOPE_INVOICE_STATE_COUNTS = Object.freeze([
  "cateringPublications",
  "cateringObservations",
  "cateringOutbox",
  "invoiceSnapshots",
  "baselines",
  "bindings",
  "sourcePolicies",
  "compositions",
  "personnelPublications",
  "personnelStreams",
  "personnelOutbox",
  "personnelReviews",
  "reviewGrants",
  "scopeInvoiceReadGates",
]);
export const SCOPE_INVOICE_STATE_TABLES = Object.freeze([
  "operations_catering_cost_outbox",
  "operations_catering_cost_publications",
  "operations_catering_cost_streams",
  "operations_catering_project_mappings",
  "operations_catering_publish_gates",
  "operations_catering_source_bindings",
  "operations_catering_source_observations",
  "operations_finance_credit_v2_enrollments",
  "operations_finance_credit_v2_project_scopes",
  "operations_finance_credit_v2_receipts",
  "operations_finance_credit_v2_snapshots",
  "operations_finance_credit_v2_streams",
  "operations_finance_invoice_enrollments",
  "operations_finance_invoice_project_scopes",
  "operations_finance_invoice_receipts",
  "operations_finance_invoice_snapshots",
  "operations_finance_invoice_streams",
  "operations_invoice_obligation_kernel_read_gates",
  "operations_obligation_source_policies",
  "operations_obligation_source_policy_heads",
  "operations_personnel_cost_outbox",
  "operations_personnel_cost_publications",
  "operations_personnel_cost_streams",
  "operations_personnel_rate_history",
  "operations_personnel_source_bindings",
  "operations_personnel_target_bindings",
  "operations_personnel_transport_routes",
  "operations_project_obligation_baselines",
  "operations_project_obligation_heads",
  "operations_project_obligation_invoice_bindings",
  "operations_project_obligation_source_ownership",
  "operations_project_personnel_review_grants",
  "operations_project_personnel_reviews",
  "operations_project_scope_heads",
  "operations_project_scope_member_ownership",
  "operations_project_scope_packing_policies",
  "operations_project_scope_snapshots",
  "operations_scope_invoice_kernel_read_gates",
  "operations_scope_obligation_baseline_captures",
  "operations_scope_obligation_composition_heads",
  "operations_scope_obligation_compositions",
  "operations_scope_obligation_ownership",
  "product_cost_overrides",
  "project_billing",
  "project_budget",
  "project_labor_costs",
  "project_purchases",
  "project_staff_time_cost_lines",
]);
const fingerprint = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function check(value) {
  if (!value) throw new Error("scope invoice mounted state boundary");
}
function exact(value, keys) {
  check(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
  );
}
export function scopeInvoiceStatePreimage(state) {
  return JSON.stringify([
    "operations-scope-invoice-mounted-state-proof.v1",
    state.schema,
    state.databaseName,
    SCOPE_INVOICE_STATE_COUNTS.map((key) => state[key]),
    SCOPE_INVOICE_STATE_TABLES.map((name) => [
      name,
      state.tableFingerprints[name],
    ]),
    state.legacyPurchasesFingerprint,
  ]);
}
export function scopeInvoiceStateFingerprint(state) {
  return createHash("sha256")
    .update(scopeInvoiceStatePreimage(state), "utf8")
    .digest("hex");
}
export function validateScopeInvoiceState(state) {
  exact(state, [
    "schema",
    "databaseName",
    ...SCOPE_INVOICE_STATE_COUNTS,
    "legacyPurchasesFingerprint",
    "tableFingerprints",
    "stateFingerprint",
  ]);
  check(
    state.schema === SCOPE_INVOICE_STATE_SCHEMA &&
      state.databaseName === SCOPE_INVOICE_STATE_DATABASE,
  );
  for (const key of SCOPE_INVOICE_STATE_COUNTS)
    check(
      Number.isSafeInteger(state[key]) && state[key] >= 0 && state[key] <= 1000,
    );
  exact(state.tableFingerprints, SCOPE_INVOICE_STATE_TABLES);
  for (const name of SCOPE_INVOICE_STATE_TABLES)
    check(fingerprint(state.tableFingerprints[name]));
  check(
    fingerprint(state.legacyPurchasesFingerprint) &&
      fingerprint(state.stateFingerprint) &&
      state.legacyPurchasesFingerprint ===
        state.tableFingerprints.project_purchases,
  );
  check(scopeInvoiceStateFingerprint(state) === state.stateFingerprint);
  return state;
}

// Native runner supplies seven private newline-delimited records. No SQL execution here.
export function validateScopeInvoiceNativeStateProof(raw) {
  check(typeof raw === "string" && Buffer.byteLength(raw) <= 65536);
  const records = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  check(records.length === 7);
  const [
    authorityBefore,
    before,
    gateChanged,
    headChanged,
    restored,
    authorityAfter,
    afterRollback,
  ] = records;
  for (const authority of [authorityBefore, authorityAfter]) {
    exact(authority, ["authUsers", "profiles", "roles"]);
    for (const key of ["authUsers", "profiles", "roles"])
      check(
        Number.isSafeInteger(authority[key]) &&
          authority[key] >= 0 &&
          authority[key] <= 1000,
      );
  }
  check(
    ["authUsers", "profiles", "roles"].every(
      (key) => authorityBefore[key] === authorityAfter[key],
    ),
  );
  for (const state of [
    before,
    gateChanged,
    headChanged,
    restored,
    afterRollback,
  ])
    validateScopeInvoiceState(state);
  for (const [changed, changedTable] of [
    [gateChanged, "operations_scope_invoice_kernel_read_gates"],
    [headChanged, "operations_personnel_cost_streams"],
  ]) {
    check(
      SCOPE_INVOICE_STATE_COUNTS.every((key) => before[key] === changed[key]),
    );
    check(
      before.tableFingerprints[changedTable] !==
        changed.tableFingerprints[changedTable],
    );
    check(
      SCOPE_INVOICE_STATE_TABLES.every(
        (name) =>
          name === changedTable ||
          before.tableFingerprints[name] === changed.tableFingerprints[name],
      ),
    );
    check(before.stateFingerprint !== changed.stateFingerprint);
  }
  check(
    scopeInvoiceStatePreimage(before) === scopeInvoiceStatePreimage(restored),
  );
  check(
    scopeInvoiceStatePreimage(before) ===
      scopeInvoiceStatePreimage(afterRollback),
  );
  return true;
}
