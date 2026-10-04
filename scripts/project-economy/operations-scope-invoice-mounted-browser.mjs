// TEST-ONLY fourth-mode skeleton. Always BLOCKED: no product safe entry exists.
// An environment variable, TEST publisher, source ACK or prior16 proof cannot enable it.
import { fileURLToPath } from 'node:url';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uuid = (v) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const check = (v) => {
  if (!v) throw new Error('scope invoice mounted boundary');
};
const exact = (v, keys) => {
  check(
    v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === keys.length &&
      keys.every((k) => Object.hasOwn(v, k)),
  );
  return v;
};
export function validateScopeInvoiceMountedSelectors(value) {
  const x = exact(value, [
    'schema',
    'organizationId',
    'actorId',
    'rootKind',
    'rootId',
    'compositionSnapshotId',
    'state',
  ]);
  check(
    x.schema === 'operations-scope-invoice-mounted-selectors.v1' &&
      x.organizationId === id(1) &&
      x.actorId === id(199) &&
      x.rootKind === 'project' &&
      x.rootId === id(1017) &&
      uuid(x.compositionSnapshotId) &&
      x.state === 'blocked_product_reader_entry_unavailable',
  );
  return x;
}
export function validateScopeInvoiceMountedRequest(raw, selectors) {
  validateScopeInvoiceMountedSelectors(selectors);
  check(typeof raw === 'string' && Buffer.byteLength(raw) <= 262144);
  const p = exact(JSON.parse(raw), ['p_request']);
  const x = exact(p.p_request, [
    'schema_version',
    'root_kind',
    'root_id',
    'expected_composition_snapshot_id',
  ]);
  check(
    x.schema_version === 'operations-scope-invoice-capture-admin-read.v1' &&
      x.root_kind === selectors.rootKind &&
      x.root_id === selectors.rootId &&
      x.expected_composition_snapshot_id === selectors.compositionSnapshotId,
  );
  return x;
}
export function scopeInvoiceMountedAvailability() {
  return Object.freeze({
    result: 'BLOCKED',
    gateMode: 'scope_invoice_capture',
    reason: 'product_reader_entry_unavailable',
    accepted_cases: 0,
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Intentional nonzero, fixed-only terminal result, BEFORE credentials/endpoints/network.
  console.log(JSON.stringify(scopeInvoiceMountedAvailability()));
  process.exitCode = 78;
}
