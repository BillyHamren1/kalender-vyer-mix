// TEST ONLY: protocol boundary; does not establish product reader/native readiness.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  SCOPE_INVOICE_STATE_SCHEMA,
  SCOPE_INVOICE_STATE_DATABASE,
  SCOPE_INVOICE_STATE_COUNTS,
  SCOPE_INVOICE_STATE_TABLES,
  scopeInvoiceStateFingerprint,
  scopeInvoiceStatePreimage,
  validateScopeInvoiceState,
  validateScopeInvoiceNativeStateProof,
} from "./operations-scope-invoice-mounted-v1-state.mjs";
import {
  PROJECT_COST_STATE_TABLES,
  validateProjectCostState,
} from "./operations-project-cost-mounted-state.mjs";
function state() {
  const value = {
    schema: SCOPE_INVOICE_STATE_SCHEMA,
    databaseName: SCOPE_INVOICE_STATE_DATABASE,
    ...Object.fromEntries(SCOPE_INVOICE_STATE_COUNTS.map((key) => [key, 0])),
    legacyPurchasesFingerprint: "a".repeat(64),
    tableFingerprints: Object.fromEntries(
      SCOPE_INVOICE_STATE_TABLES.map((key) => [key, "a".repeat(64)]),
    ),
  };
  value.stateFingerprint = scopeInvoiceStateFingerprint(value);
  return value;
}
function altered(before, name) {
  const value = {
    ...before,
    tableFingerprints: { ...before.tableFingerprints, [name]: "b".repeat(64) },
  };
  value.stateFingerprint = scopeInvoiceStateFingerprint(value);
  return value;
}
function proof() {
  const before = state(),
    authority = { authUsers: 6, profiles: 6, roles: 5 };
  return [
    authority,
    before,
    altered(before, "operations_scope_invoice_kernel_read_gates"),
    altered(before, "operations_personnel_cost_streams"),
    structuredClone(before),
    structuredClone(authority),
    structuredClone(before),
  ];
}
const lines = (records) =>
  records.map((record) => JSON.stringify(record)).join("\n");
test("new purpose is exact19 fields/48 tables; old COST47 cannot stand in", () => {
  const value = state();
  assert.equal(validateScopeInvoiceState(value), value);
  assert.equal(Object.keys(value).length, 19);
  assert.equal(SCOPE_INVOICE_STATE_COUNTS.length, 14);
  assert.equal(SCOPE_INVOICE_STATE_TABLES.length, 48);
  assert.deepEqual(
    [...SCOPE_INVOICE_STATE_TABLES].sort(),
    SCOPE_INVOICE_STATE_TABLES,
  );
  assert.deepEqual(
    SCOPE_INVOICE_STATE_TABLES.filter(
      (name) => name !== "operations_scope_invoice_kernel_read_gates",
    ),
    PROJECT_COST_STATE_TABLES,
  );
  assert.throws(() => validateProjectCostState(value));
  const { scopeInvoiceReadGates, ...old } = value;
  delete old.tableFingerprints.operations_scope_invoice_kernel_read_gates;
  assert.throws(() => validateScopeInvoiceState(old));
});
test("strict scalar, table inventory and bounded count failures reject without coercion", () => {
  for (const delta of [
    null,
    [],
    { schema: "operations-project-cost-mounted-state.v2" },
    { databaseName: "postgres" },
    { scopeInvoiceReadGates: "0" },
    { scopeInvoiceReadGates: 1001 },
    { bindings: -1 },
    { baselines: 0.5 },
    { personnelStreams: NaN },
    { compositions: undefined },
    { privatePayload: "secret" },
    { stateFingerprint: "A".repeat(64) },
  ]) {
    assert.throws(() =>
      validateScopeInvoiceState(
        delta === null || Array.isArray(delta)
          ? delta
          : { ...state(), ...delta },
      ),
    );
  }
  for (const value of [
    [],
    {},
    { ...state().tableFingerprints, extra: "a".repeat(64) },
    {
      ...state().tableFingerprints,
      operations_scope_invoice_kernel_read_gates: null,
    },
  ]) {
    assert.throws(() =>
      validateScopeInvoiceState({ ...state(), tableFingerprints: value }),
    );
  }
});
test("tuple hash is compact, fixed-purpose, independent of input object insertion order", () => {
  const value = state(),
    tuple = JSON.parse(scopeInvoiceStatePreimage(value));
  assert.equal(tuple[0], "operations-scope-invoice-mounted-state-proof.v1");
  assert.deepEqual(tuple[3], Array(14).fill(0));
  assert.deepEqual(
    tuple[4].map((pair) => pair[0]),
    SCOPE_INVOICE_STATE_TABLES,
  );
  const reverse = Object.fromEntries(Object.entries(value).reverse());
  reverse.tableFingerprints = Object.fromEntries(
    Object.entries(value.tableFingerprints).reverse(),
  );
  assert.equal(
    scopeInvoiceStatePreimage(reverse),
    scopeInvoiceStatePreimage(value),
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(tuple)).digest("hex"),
    value.stateFingerprint,
  );
});
test("same-count gate and composition-head changes require new validated fingerprints", () => {
  const before = state();
  for (const name of [
    "operations_scope_invoice_kernel_read_gates",
    "operations_scope_obligation_composition_heads",
  ]) {
    const changed = altered(before, name);
    assert.equal(validateScopeInvoiceState(changed), changed);
    assert.notEqual(changed.stateFingerprint, before.stateFingerprint);
    assert.throws(() =>
      validateScopeInvoiceState({
        ...changed,
        stateFingerprint: before.stateFingerprint,
      }),
    );
  }
  assert.throws(() =>
    validateScopeInvoiceState({
      ...before,
      legacyPurchasesFingerprint: "b".repeat(64),
    }),
  );
});
test("native proof requires isolated same-count changes, exact restoration and neutral actor counts", () => {
  assert.equal(validateScopeInvoiceNativeStateProof(lines(proof())), true);
  for (const mutate of [
    (records) => records.pop(),
    (records) => records.push({ extra: true }),
    (records) => (records[2] = structuredClone(records[1])),
    (records) => (records[3] = structuredClone(records[2])),
    (records) => records[5].roles++,
    (records) => records[2].scopeInvoiceReadGates++,
    (records) => (records[4] = structuredClone(records[2])),
    (records) => (records[6] = structuredClone(records[3])),
    (records) =>
      (records[2] = altered(
        records[2],
        "operations_scope_obligation_composition_heads",
      )),
  ]) {
    const records = proof();
    mutate(records);
    assert.throws(() => validateScopeInvoiceNativeStateProof(lines(records)));
  }
  assert.throws(() => validateScopeInvoiceNativeStateProof(" ".repeat(65537)));
  assert.throws(() => validateScopeInvoiceNativeStateProof("PRIVATE"));
});
test("SQL inventory includes all actual48 tables under one bounded full-row financial statement", () => {
  const sql = readFileSync(
    new URL("./operations-scope-invoice-mounted-v1-state.sql", import.meta.url),
    "utf8",
  );
  const rowTables = [
    ...sql.matchAll(/select \* from public\.([a-z0-9_]+) limit 1001/g),
  ].map((match) => match[1]);
  assert.deepEqual(rowTables, SCOPE_INVOICE_STATE_TABLES);
  assert.equal((sql.match(/with tags\(table_name\)/g) || []).length, 1);
  assert.equal((sql.match(/to_jsonb\(t\)::text row_json/g) || []).length, 48);
  assert.match(
    sql,
    /bool_and\(n<=1000 and largest_row<=2097152\) and sum\(serialized_bytes\)<=16777216/,
  );
  assert.match(sql, /statement_timeout='3s'/);
  assert.match(sql, /idle_in_transaction_session_timeout='5s'/);
  assert.match(
    sql,
    /'scopeInvoiceReadGates',\(select n from summary where table_name='operations_scope_invoice_kernel_read_gates'\)/,
  );
  assert.match(sql, /'operations-scope-invoice-mounted-state-proof.v1'/);
  assert.doesNotMatch(
    sql,
    /\b(insert\s+into|update\s+public\.|delete\s+from|create\s+(function|table)|truncate\s+)\b/i,
  );
});
