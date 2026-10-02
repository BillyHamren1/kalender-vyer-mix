// TEST ONLY: strict protocol tests; native mode runs only on guarded disposable schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  PROJECT_COST_STATE_SCHEMA,
  PROJECT_COST_STATE_DATABASE,
  PROJECT_COST_STATE_COUNTS,
  PROJECT_COST_STATE_TABLES,
  projectCostStateFingerprint,
  projectCostStatePreimage,
  validateProjectCostState,
  validateProjectCostNativeStateProof,
} from './operations-project-cost-mounted-state.mjs';
export function syntheticProjectCostState() {
  const s = {
    schema: PROJECT_COST_STATE_SCHEMA,
    databaseName: PROJECT_COST_STATE_DATABASE,
    ...Object.fromEntries(PROJECT_COST_STATE_COUNTS.map((k) => [k, 0])),
    legacyPurchasesFingerprint: 'a'.repeat(64),
    tableFingerprints: Object.fromEntries(
      PROJECT_COST_STATE_TABLES.map((k) => [k, 'a'.repeat(64)]),
    ),
  };
  s.stateFingerprint = projectCostStateFingerprint(s);
  return s;
}
test('state protocol requires exact18 fields and all47 ordered opaque table proofs', () => {
  const s = syntheticProjectCostState();
  assert.equal(validateProjectCostState(s), s);
  assert.equal(Object.keys(s).length, 18);
  assert.equal(PROJECT_COST_STATE_TABLES.length, 47);
  assert.deepEqual(
    [...PROJECT_COST_STATE_TABLES].sort(),
    PROJECT_COST_STATE_TABLES,
  );
  for (const delta of [
    { schema: 'old' },
    { databaseName: 'production' },
    { extra: 'PRIVATE' },
    { personnelStreams: undefined },
    { personnelOutbox: '0' },
    { reviewGrants: 1001 },
    { personnelReviews: -1 },
    { baselines: 0.1 },
    { stateFingerprint: 'A'.repeat(64) },
  ])
    assert.throws(() => validateProjectCostState({ ...s, ...delta }));
  const { compositions, ...without } = s;
  assert.throws(() => validateProjectCostState(without));
  for (const map of [
    [],
    {},
    { ...s.tableFingerprints, unknown: 'a'.repeat(64) },
    { ...s.tableFingerprints, operations_personnel_cost_streams: null },
    { ...s.tableFingerprints, operations_project_obligation_heads: 'PRIVATE' },
  ])
    assert.throws(() =>
      validateProjectCostState({ ...s, tableFingerprints: map }),
    );
});
test('changed same-count personnel head must alter validated proof, stale fingerprint denied', () => {
  const before = syntheticProjectCostState();
  const changed = {
    ...before,
    tableFingerprints: {
      ...before.tableFingerprints,
      operations_personnel_cost_streams: 'b'.repeat(64),
    },
  };
  assert.equal(changed.personnelStreams, before.personnelStreams);
  assert.throws(() => validateProjectCostState(changed));
  changed.stateFingerprint = projectCostStateFingerprint(changed);
  validateProjectCostState(changed);
  assert.notEqual(changed.stateFingerprint, before.stateFingerprint);
  assert.notDeepEqual(changed, before);
});
test('legacy equality and proof cover counts, source authority, leases and review heads', () => {
  const before = syntheticProjectCostState();
  for (const key of [
    'operations_personnel_cost_outbox',
    'operations_personnel_source_bindings',
    'operations_project_personnel_review_grants',
    'operations_scope_obligation_composition_heads',
    'project_purchases',
  ]) {
    const altered = {
      ...before,
      tableFingerprints: { ...before.tableFingerprints, [key]: 'b'.repeat(64) },
    };
    altered.stateFingerprint = projectCostStateFingerprint(altered);
    if (key === 'project_purchases')
      assert.throws(() => validateProjectCostState(altered));
    else {
      validateProjectCostState(altered);
      assert.notDeepEqual(altered, before);
    }
  }
  assert.throws(() =>
    validateProjectCostState({ ...before, personnelPublications: 1 }),
  );
});
test('state tuple bytes have fixed purpose/order and ignore JSON object insertion order', () => {
  const s = syntheticProjectCostState(),
    tuple = JSON.parse(projectCostStatePreimage(s));
  assert.equal(tuple.length, 6);
  assert.equal(tuple[0], 'operations-mounted-state-proof.v1');
  assert.deepEqual(tuple[3], Array(13).fill(0));
  assert.deepEqual(
    tuple[4],
    PROJECT_COST_STATE_TABLES.map((k) => [k, 'a'.repeat(64)]),
  );
  assert.equal(projectCostStatePreimage(s), JSON.stringify(tuple));
  const reversed = {
    ...s,
    tableFingerprints: Object.fromEntries(
      Object.entries(s.tableFingerprints).reverse(),
    ),
  };
  assert.equal(projectCostStateFingerprint(reversed), s.stateFingerprint);
  validateProjectCostState(reversed);
});
test('literal state read covers whole actual rows with bounded single-statement aggregation', () => {
  const sql = readFileSync(
    new URL('./operations-project-cost-mounted-state.sql', import.meta.url),
    'utf8',
  );
  const names = [
    ...sql.matchAll(/select \* from public\.([a-z0-9_]+) limit 1001/g),
  ].map((x) => x[1]);
  assert.deepEqual(names, PROJECT_COST_STATE_TABLES);
  assert.equal((sql.match(/with tags\(/g) || []).length, 1);
  assert.match(sql, /to_jsonb\(t\)::text/);
  assert.match(sql, /n<=1000 and largest_row<=2097152/);
  assert.match(sql, /sum\(serialized_bytes\)<=16777216/);
  assert.match(
    sql,
    /current_database\(\)<>'eventflow_project_evidence_http_runtime'/,
  );
  assert.doesNotMatch(
    sql,
    /\b(insert|update|delete|truncate|grant|create|alter)\s+(into|table|role|function|trigger|on|public\.)/i,
  );
});
if (!process.argv.includes('--native-state-negative'))
  test('native negative refuses absent isolation before any Docker invocation', () => {
    const r = spawnSync(
      process.execPath,
      [new URL(import.meta.url).pathname, '--native-state-negative'],
      { env: { PATH: '' }, encoding: 'utf8', timeout: 5000, maxBuffer: 65536 },
    );
    assert.equal(r.status, 1);
    assert.match(r.stdout, /PROJECT_COST_MOUNTED_STATE_NATIVE_NEGATIVE FAIL/);
    assert.doesNotMatch(
      r.stdout,
      /PROJECT_COST_MOUNTED_STATE_NATIVE_NEGATIVE PASS/,
    );
    assert.equal(r.stderr, '');
  });
test('native proof rejects missing head change, leaked extra records, rollback mismatch and actor changes', () => {
  const state = syntheticProjectCostState(),
    changed = {
      ...state,
      tableFingerprints: {
        ...state.tableFingerprints,
        operations_personnel_cost_streams: 'b'.repeat(64),
      },
    };
  changed.stateFingerprint = projectCostStateFingerprint(changed);
  const actor = { authUsers: 4, profiles: 4, roles: 3 };
  const good = [actor, state, changed, state, actor, state];
  const raw = (records) => records.map((v) => JSON.stringify(v)).join('\n');
  assert.equal(validateProjectCostNativeStateProof(raw(good)), true);
  for (const records of [
    [actor, state, state, state, actor, state],
    [actor, state, changed, changed, actor, state],
    [actor, state, changed, state, { ...actor, roles: 2 }, state],
    [...good, { private: 'PRIVATE' }],
    good.slice(1),
  ])
    assert.throws(() => validateProjectCostNativeStateProof(raw(records)));
  assert.throws(() => validateProjectCostNativeStateProof(' '.repeat(65537)));
});
// Native Docker/psql execution belongs to the new Python runner's unchanged owned-group executor.
// This CLI only validates capped private records; it executes no subprocess/SQL/network.
if (process.argv.includes('--native-state-negative')) {
  try {
    assert.deepEqual(process.argv.slice(2), ['--native-state-negative']);
    assert.equal(process.env.CI, 'true');
    assert.equal(process.env.ISOLATED_PROJECT_EVIDENCE_HTTP, 'true');
    assert.equal(
      process.env.ISOLATED_OPERATIONS_PROJECT_COST_MOUNTED_BROWSER,
      'true',
    );
    assert.equal(
      process.env.GITHUB_REPOSITORY,
      'BillyHamren1/kalender-vyer-mix',
    );
    assert.equal(
      process.env.PROJECT_EVIDENCE_DATABASE_NAME,
      PROJECT_COST_STATE_DATABASE,
    );
    const parts = [];
    let bytes = 0;
    while (true) {
      const buffer = Buffer.alloc(8192);
      const n = readSync(0, buffer, 0, buffer.length, null);
      if (!n) break;
      bytes += n;
      assert.ok(bytes <= 65536);
      parts.push(buffer.subarray(0, n));
    }
    validateProjectCostNativeStateProof(
      Buffer.concat(parts, bytes).toString('utf8'),
    );
    process.stdout.write('PROJECT_COST_MOUNTED_STATE_NATIVE_NEGATIVE PASS\n');
  } catch {
    process.stdout.write('PROJECT_COST_MOUNTED_STATE_NATIVE_NEGATIVE FAIL\n');
    process.exitCode = 1;
  }
}
