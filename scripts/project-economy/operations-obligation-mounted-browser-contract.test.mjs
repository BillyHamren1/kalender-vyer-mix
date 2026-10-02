import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedMountedRead,
  assertMountedEndpoint,
  validateMountedRpc,
  validateMountedSelectors,
} from './operations-obligation-mounted-browser.mjs';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const origin = 'https://pihrhltinhewhoxefjxv.supabase.co';
const scope = '/rest/v1/rpc/read_operations_scope_obligation_evidence_v1';
const leaf = '/rest/v1/rpc/read_operations_scope_obligation_drilldown_v1';
const selectors = {
  schema: 'operations-obligation-mounted-browser-selectors.v1',
  organizationId: id(1),
  actorId: id(199),
  projectId: id(1017),
  compositionSnapshotId: id(1031),
  baselineEventId: id(1032),
  obligationId: id(1018),
  unknownBaselineEventId: id(1033),
  unknownObligationId: id(1028),
  baselineRowIndex: 2,
  unknownBaselineRowIndex: 1,
};
const leafBody = {
  p_request: {
    schema_version: 'operations-scope-obligation-drilldown-read.v1',
    root_kind: 'project',
    root_id: id(1017),
    obligation_id: id(1018),
    expected_composition_snapshot_id: id(1031),
    expected_baseline_event_id: id(1032),
  },
};
test('exact loopback endpoints refuse foreign host/ports/paths before any network call', () => {
  const saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    throw new Error('network prohibited');
  };
  try {
    for (const port of ['55610', '55611', '55612'])
      assert.equal(
        assertMountedEndpoint(`http://127.0.0.1:${port}/`, port),
        `http://127.0.0.1:${port}`,
      );
    for (const [url, port] of [
      ['http://127.0.0.1:4173/', '55612'],
      ['http://127.0.0.1:55611/', '55610'],
      ['https://127.0.0.1:55612/', '55612'],
      ['http://example.invalid:55612/', '55612'],
      ['http://actor@127.0.0.1:55612/', '55612'],
      ['http://127.0.0.1:55612/path', '55612'],
      ['http://127.0.0.1:55612/?secret=1', '55612'],
    ])
      assert.throws(() => assertMountedEndpoint(url, port));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = saved;
  }
});
test('only exact native read paths and methods may be forwarded', () => {
  assert.equal(
    allowedMountedRead(
      `${origin}/rest/v1/profiles?select=organization_id`,
      'GET',
    ),
    true,
  );
  assert.equal(allowedMountedRead(`${origin}${scope}`, 'POST'), true);
  assert.equal(allowedMountedRead(`${origin}${leaf}`, 'POST'), true);
  assert.equal(allowedMountedRead(`${origin}${leaf}`, 'OPTIONS'), true);
  for (const [url, method] of [
    [`${origin}/rest/v1/projects`, 'PATCH'],
    [`${origin}/rest/v1/project_purchases`, 'POST'],
    [
      `${origin}/rest/v1/rpc/append_operations_manual_obligation_baseline_v1`,
      'POST',
    ],
    [`${origin}/rest/v1/rpc/unknown_read`, 'POST'],
    [`${origin}/functions/v1/planning-api-proxy`, 'POST'],
    [`https://foreign.invalid${leaf}`, 'POST'],
    [`${origin}${leaf}?override=1`, 'POST'],
    [`${origin}/rest/v1/operations_project_obligation_baselines`, 'GET'],
  ])
    assert.equal(allowedMountedRead(url, method), false);
});
test('only exact actual immutable fixture selectors including saved row ordering are accepted', () => {
  assert.equal(validateMountedSelectors(selectors), selectors);
  for (const value of [
    { ...selectors, actorId: id(9) },
    { ...selectors, projectId: id(117) },
    { ...selectors, baselineRowIndex: 0 },
    { ...selectors, baselineRowIndex: '2' },
    { ...selectors, unknownBaselineRowIndex: 2 },
    { ...selectors, baselineEventId: selectors.unknownBaselineEventId },
    { ...selectors, arbitraryAmount: 0 },
  ])
    assert.throws(() => validateMountedSelectors(value));
});
test('scope forwarding is bound to the actual org/root selector', () => {
  const good = {
    p_organization_id: id(1),
    p_root_kind: 'project',
    p_root_id: id(1017),
  };
  assert.equal(
    validateMountedRpc(scope, JSON.stringify(good), selectors),
    'scope',
  );
  for (const bad of [
    { ...good, p_organization_id: id(99) },
    { ...good, p_root_id: id(117) },
    { ...good, actor_id: id(199) },
  ])
    assert.throws(() =>
      validateMountedRpc(scope, JSON.stringify(bad), selectors),
    );
});
test('leaf forwarding preserves the real displayed captured obligation and baseline tuple', () => {
  assert.equal(
    validateMountedRpc(leaf, JSON.stringify(leafBody), selectors),
    'leaf',
  );
  const unknown = {
    p_request: {
      ...leafBody.p_request,
      obligation_id: id(1028),
      expected_baseline_event_id: id(1033),
    },
  };
  assert.equal(
    validateMountedRpc(leaf, JSON.stringify(unknown), selectors),
    'unknown_leaf',
  );
  for (const patch of [
    { obligation_id: id(1028) },
    { expected_composition_snapshot_id: id(1039) },
    { expected_baseline_event_id: id(1033) },
    { actor_id: id(199) },
    { root_kind: 'large_project' },
  ])
    assert.throws(() =>
      validateMountedRpc(
        leaf,
        JSON.stringify({ p_request: { ...leafBody.p_request, ...patch } }),
        selectors,
      ),
    );
  assert.throws(() => validateMountedRpc(leaf, ' '.repeat(262145), selectors));
});
