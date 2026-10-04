// TEST ONLY: opaque same-server state fingerprints, never user-facing cost evidence.
import { createHash } from 'node:crypto';
export const PROJECT_COST_STATE_SCHEMA =
  'operations-project-cost-mounted-state.v2';
export const PROJECT_COST_STATE_DATABASE =
  'eventflow_project_evidence_http_runtime';
export const PROJECT_COST_STATE_COUNTS = Object.freeze([
  'cateringPublications',
  'cateringObservations',
  'cateringOutbox',
  'invoiceSnapshots',
  'baselines',
  'bindings',
  'sourcePolicies',
  'compositions',
  'personnelPublications',
  'personnelStreams',
  'personnelOutbox',
  'personnelReviews',
  'reviewGrants',
]);
export const PROJECT_COST_STATE_TABLES = Object.freeze([
  'operations_catering_cost_outbox',
  'operations_catering_cost_publications',
  'operations_catering_cost_streams',
  'operations_catering_project_mappings',
  'operations_catering_publish_gates',
  'operations_catering_source_bindings',
  'operations_catering_source_observations',
  'operations_finance_credit_v2_enrollments',
  'operations_finance_credit_v2_project_scopes',
  'operations_finance_credit_v2_receipts',
  'operations_finance_credit_v2_snapshots',
  'operations_finance_credit_v2_streams',
  'operations_finance_invoice_enrollments',
  'operations_finance_invoice_project_scopes',
  'operations_finance_invoice_receipts',
  'operations_finance_invoice_snapshots',
  'operations_finance_invoice_streams',
  'operations_invoice_obligation_kernel_read_gates',
  'operations_obligation_source_policies',
  'operations_obligation_source_policy_heads',
  'operations_personnel_cost_outbox',
  'operations_personnel_cost_publications',
  'operations_personnel_cost_streams',
  'operations_personnel_rate_history',
  'operations_personnel_source_bindings',
  'operations_personnel_target_bindings',
  'operations_personnel_transport_routes',
  'operations_project_obligation_baselines',
  'operations_project_obligation_heads',
  'operations_project_obligation_invoice_bindings',
  'operations_project_obligation_source_ownership',
  'operations_project_personnel_review_grants',
  'operations_project_personnel_reviews',
  'operations_project_scope_heads',
  'operations_project_scope_member_ownership',
  'operations_project_scope_packing_policies',
  'operations_project_scope_snapshots',
  'operations_scope_obligation_baseline_captures',
  'operations_scope_obligation_composition_heads',
  'operations_scope_obligation_compositions',
  'operations_scope_obligation_ownership',
  'product_cost_overrides',
  'project_billing',
  'project_budget',
  'project_labor_costs',
  'project_purchases',
  'project_staff_time_cost_lines',
]);
const fingerprint = (value) =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function check(value) {
  if (!value) throw new Error('project cost state boundary');
}
function exact(value, keys) {
  check(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
  );
}
export function projectCostStatePreimage(state) {
  return JSON.stringify([
    'operations-mounted-state-proof.v1',
    state.schema,
    state.databaseName,
    PROJECT_COST_STATE_COUNTS.map((key) => state[key]),
    PROJECT_COST_STATE_TABLES.map((name) => [
      name,
      state.tableFingerprints[name],
    ]),
    state.legacyPurchasesFingerprint,
  ]);
}
export function projectCostStateFingerprint(state) {
  return createHash('sha256')
    .update(projectCostStatePreimage(state), 'utf8')
    .digest('hex');
}
export function validateProjectCostState(state) {
  exact(state, [
    'schema',
    'databaseName',
    ...PROJECT_COST_STATE_COUNTS,
    'legacyPurchasesFingerprint',
    'tableFingerprints',
    'stateFingerprint',
  ]);
  check(
    state.schema === PROJECT_COST_STATE_SCHEMA &&
      state.databaseName === PROJECT_COST_STATE_DATABASE,
  );
  for (const key of PROJECT_COST_STATE_COUNTS)
    check(
      Number.isSafeInteger(state[key]) && state[key] >= 0 && state[key] <= 1000,
    );
  exact(state.tableFingerprints, PROJECT_COST_STATE_TABLES);
  for (const name of PROJECT_COST_STATE_TABLES)
    check(fingerprint(state.tableFingerprints[name]));
  check(
    fingerprint(state.legacyPurchasesFingerprint) &&
      fingerprint(state.stateFingerprint) &&
      state.legacyPurchasesFingerprint ===
        state.tableFingerprints.project_purchases,
  );
  check(projectCostStateFingerprint(state) === state.stateFingerprint);
  return state;
}

export function validateProjectCostNativeStateProof(raw) {
  check(typeof raw === 'string' && Buffer.byteLength(raw) <= 65536);
  const records = raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  check(records.length === 6);
  const [
    authorityBefore,
    before,
    changed,
    restored,
    authorityAfter,
    afterRollback,
  ] = records;
  for (const authority of [authorityBefore, authorityAfter]) {
    exact(authority, ['authUsers', 'profiles', 'roles']);
    for (const key of ['authUsers', 'profiles', 'roles'])
      check(
        Number.isSafeInteger(authority[key]) &&
          authority[key] >= 0 &&
          authority[key] <= 1000,
      );
  }
  check(JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter));
  for (const state of [before, changed, restored, afterRollback])
    validateProjectCostState(state);
  for (const key of PROJECT_COST_STATE_COUNTS)
    check(before[key] === changed[key]);
  check(
    before.tableFingerprints.operations_personnel_cost_streams !==
      changed.tableFingerprints.operations_personnel_cost_streams,
  );
  check(before.stateFingerprint !== changed.stateFingerprint);
  check(
    JSON.stringify(before) === JSON.stringify(restored) &&
      JSON.stringify(before) === JSON.stringify(afterRollback),
  );
  return true;
}
