import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validateScopeInvoiceMountedSelectors,
  validateScopeInvoiceMountedRequest,
  scopeInvoiceMountedAvailability,
} from './operations-scope-invoice-mounted-browser.mjs';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const selectors = {
  schema: 'operations-scope-invoice-mounted-selectors.v1',
  organizationId: id(1),
  actorId: id(199),
  rootKind: 'project',
  rootId: id(1017),
  compositionSnapshotId: id(1031),
  state: 'blocked_product_reader_entry_unavailable',
};
test('fourth skeleton accepts only real saved parent selectors and remains explicitly blocked', () => {
  assert.equal(validateScopeInvoiceMountedSelectors(selectors), selectors);
  for (const delta of [
    { actorId: id(9) },
    { rootKind: 'large_project' },
    { rootId: id(117) },
    { compositionSnapshotId: [] },
    { state: 'ready' },
    { callerActor: id(199) },
  ])
    assert.throws(() =>
      validateScopeInvoiceMountedSelectors({ ...selectors, ...delta }),
    );
  assert.deepEqual(scopeInvoiceMountedAvailability(), {
    result: 'BLOCKED',
    gateMode: 'scope_invoice_capture',
    reason: 'product_reader_entry_unavailable',
    accepted_cases: 0,
  });
});
test('future exact admin purpose binds displayed capture and accepts no caller org/actor/money', () => {
  const body = {
    p_request: {
      schema_version: 'operations-scope-invoice-capture-admin-read.v1',
      root_kind: 'project',
      root_id: id(1017),
      expected_composition_snapshot_id: id(1031),
    },
  };
  assert.deepEqual(
    validateScopeInvoiceMountedRequest(JSON.stringify(body), selectors),
    body.p_request,
  );
  for (const delta of [
    { root_id: id(117) },
    { expected_composition_snapshot_id: id(1049) },
    { root_kind: 'packing_project' },
    { organization_id: id(1) },
    { amount_minor: 0 },
  ])
    assert.throws(() =>
      validateScopeInvoiceMountedRequest(
        JSON.stringify({ p_request: { ...body.p_request, ...delta } }),
        selectors,
      ),
    );
});
test('fake product readiness env cannot turn skeleton into accepted native proof or credential access', () => {
  const r = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          './operations-scope-invoice-mounted-browser.mjs',
          import.meta.url,
        ),
      ),
    ],
    {
      env: {
        ...process.env,
        PRODUCT_SAFE_ENTRY_COMMIT: 'a'.repeat(40),
        OPERATIONS_SCOPE_INVOICE_NATIVE_READY: 'true',
        PROJECT_EVIDENCE_JWT_SECRET: 'PRIVATE_SENTINEL',
      },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4096,
    },
  );
  assert.equal(r.status, 78);
  assert.equal(r.stderr, '');
  assert.deepEqual(JSON.parse(r.stdout), scopeInvoiceMountedAvailability());
  assert.equal(r.stdout.includes('PRIVATE'), false);
});
