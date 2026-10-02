import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_COST_STATE_COUNTS,
  PROJECT_COST_STATE_TABLES,
  projectCostStateFingerprint,
} from './operations-project-cost-mounted-state.mjs';
import {
  allowedProjectCostRead,
  validateProjectCostSelectors,
  validateProjectCostRpc,
  validateProjectCostState,
  assertProjectCostIsolation,
  boundedProjectCostBody,
  PROJECT_COST_MOUNTED_CASES,
} from './operations-project-cost-mounted-browser.mjs';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const origin = 'https://pihrhltinhewhoxefjxv.supabase.co',
  rpc = '/rest/v1/rpc/read_operations_project_cost_evidence_v1';
const selectors = {
  schema: 'operations-project-cost-mounted-selectors.v1',
  organizationId: id(1),
  actorId: id(199),
  projectId: id(1017),
  knownReportId: id(7003),
  missingReportId: id(7004),
};
test('only exact older read purpose or fixed App table GET is admitted', () => {
  assert.equal(allowedProjectCostRead(origin + rpc, 'POST'), true);
  assert.equal(
    allowedProjectCostRead(
      origin + '/rest/v1/profiles?select=organization_id',
      'GET',
    ),
    true,
  );
  for (const [url, verb] of [
    [origin + rpc + '?override=1', 'POST'],
    [
      origin + '/rest/v1/rpc/read_operations_scope_invoice_capture_admin_v1',
      'POST',
    ],
    [
      origin + '/rest/v1/rpc/read_operations_scope_obligation_evidence_v1',
      'POST',
    ],
    [origin + '/rest/v1/project_purchases', 'POST'],
    [origin + '/functions/v1/mapbox-token', 'POST'],
    [origin + '/auth/v1/token', 'POST'],
    ['https://foreign.invalid' + rpc, 'POST'],
    [origin + '/rest/v1/operations_personnel_cost_publications', 'GET'],
  ])
    assert.equal(allowedProjectCostRead(url, verb), false);
});
test('fixed saved selectors reject foreign identity, shared reports and extra raw evidence', () => {
  assert.equal(validateProjectCostSelectors(selectors), selectors);
  for (const delta of [
    { actorId: id(9) },
    { organizationId: id(99) },
    { projectId: id(117) },
    { knownReportId: selectors.missingReportId },
    { missingReportId: [] },
    { hourly_rate_minor: 0 },
  ])
    assert.throws(() =>
      validateProjectCostSelectors({ ...selectors, ...delta }),
    );
});
test('exact native body must bind BOTH organization and project, no caller actor', () => {
  const body = { p_organization_id: id(1), p_project_id: id(1017) };
  assert.equal(
    validateProjectCostRpc(rpc, JSON.stringify(body), selectors),
    'project_cost',
  );
  for (const delta of [
    { p_organization_id: id(99) },
    { p_project_id: id(117) },
    { actor_id: id(199) },
  ])
    assert.throws(() =>
      validateProjectCostRpc(
        rpc,
        JSON.stringify({ ...body, ...delta }),
        selectors,
      ),
    );
  assert.throws(() =>
    validateProjectCostRpc(rpc, ' '.repeat(262145), selectors),
  );
});
test('named isolated mode refuses missing CI/gate/DB without network', () => {
  const saved = fetch;
  let requests = 0;
  globalThis.fetch = () => {
    requests++;
    throw new Error('network prohibited');
  };
  try {
    const good = {
      CI: 'true',
      ISOLATED_PROJECT_EVIDENCE_HTTP: 'true',
      PROJECT_EVIDENCE_DATABASE_NAME: 'eventflow_project_evidence_http_runtime',
    };
    assert.doesNotThrow(() => assertProjectCostIsolation(good));
    for (const delta of [
      { CI: 'false' },
      { ISOLATED_PROJECT_EVIDENCE_HTTP: undefined },
      { PROJECT_EVIDENCE_DATABASE_NAME: 'postgres' },
    ])
      assert.throws(() => assertProjectCostIsolation({ ...good, ...delta }));
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = saved;
  }
});
test('state proof requires personnel/outbox/reviews and unchanged legacy fingerprint', () => {
  const state = {
    schema: 'operations-project-cost-mounted-state.v2',
    databaseName: 'eventflow_project_evidence_http_runtime',
    ...Object.fromEntries(PROJECT_COST_STATE_COUNTS.map((k) => [k, 0])),
    tableFingerprints: Object.fromEntries(
      PROJECT_COST_STATE_TABLES.map((k) => [k, 'a'.repeat(64)]),
    ),
    legacyPurchasesFingerprint: 'a'.repeat(64),
  };
  state.stateFingerprint = projectCostStateFingerprint(state);
  assert.equal(validateProjectCostState(state), state);
  for (const delta of [
    { personnelPublications: undefined },
    { personnelOutbox: '0' },
    { personnelReviews: -1 },
    { legacyPurchasesFingerprint: 'PRIVATE' },
    { extra: 'PRIVATE' },
  ])
    assert.throws(() => validateProjectCostState({ ...state, ...delta }));
  assert.equal(PROJECT_COST_MOUNTED_CASES.length, 8);
  assert.equal(new Set(PROJECT_COST_MOUNTED_CASES).size, 8);
});
test('actual response reader preserves bytes and skips empty chunks', async () => {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array());
      c.enqueue(new TextEncoder().encode('a'));
      c.enqueue(new TextEncoder().encode('å'));
      c.close();
    },
  });
  assert.equal(
    (await boundedProjectCostBody(new Response(body))).toString('utf8'),
    'aå',
  );
});
test('stalled or malicious tiny native stream has bounded cancellation', async () => {
  let canceled = false;
  const stalled = new ReadableStream({
    pull() {
      return new Promise(() => {});
    },
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(boundedProjectCostBody(new Response(stalled), 20));
  assert.equal(canceled, true);
  const micro = new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array());
    },
  });
  await assert.rejects(boundedProjectCostBody(new Response(micro), 100));
  const oversized = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(2097153));
    },
  });
  await assert.rejects(boundedProjectCostBody(new Response(oversized)));
});

test('actual pinned Operations engine privately generates181 and null from distinct immutable Time identities', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const r = spawnSync(
    'deno',
    [
      'run',
      '--cached-only',
      '--allow-env',
      '--allow-read',
      fileURLToPath(
        new URL(
          './operations-project-cost-mounted-browser.mjs',
          import.meta.url,
        ),
      ),
      '--fixture',
    ],
    {
      env: {
        ...process.env,
        CI: 'true',
        ISOLATED_PROJECT_EVIDENCE_HTTP: 'true',
        PROJECT_EVIDENCE_DATABASE_NAME:
          'eventflow_project_evidence_http_runtime',
      },
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 131072,
    },
  );
  assert.equal(
    r.status,
    0,
    'actual Deno fixture generator must execute successfully',
  );
  const f = JSON.parse(r.stdout);
  assert.equal(f.schema, 'operations-project-cost-mounted-fixture.v1');
  assert.equal(f.known.snapshot.lines[0].amount_minor, 181);
  assert.equal(f.missing.snapshot.lines[0].amount_minor, null);
  for (const key of ['known', 'missing']) {
    assert.notEqual(f[key].raw.workerId, f[key].snapshot.worker_id);
    assert.equal(f[key].raw.snapshotHash, f[key].snapshot.source_snapshot_hash);
    assert.equal(f[key].raw.id, f[key].snapshot.source_time_report_id);
    assert.equal(f[key].snapshot.lines[0].source_project_id, id(1017));
    assert.equal(f[key].snapshot.lines[0].source_booking_id, null);
  }
  const invalid = spawnSync(
    'deno',
    [
      'run',
      '--cached-only',
      '--allow-env',
      '--allow-read',
      fileURLToPath(
        new URL(
          './operations-project-cost-mounted-browser.mjs',
          import.meta.url,
        ),
      ),
      '--fixture',
    ],
    {
      env: {
        ...process.env,
        CI: 'false',
        ISOLATED_PROJECT_EVIDENCE_HTTP: 'true',
        PROJECT_EVIDENCE_DATABASE_NAME:
          'eventflow_project_evidence_http_runtime',
      },
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 4096,
    },
  );
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).result, 'FAIL');
  assert.equal(invalid.stdout.includes('day-submission'), false);
});
