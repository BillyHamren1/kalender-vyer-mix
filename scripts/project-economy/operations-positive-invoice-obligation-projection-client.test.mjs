import {
  validatePositiveInvoiceObligationRead,
} from '../../src/lib/economy/positiveInvoiceObligationProjection.ts';

const authority = {
  actorId: '11111111-1111-4111-8111-111111111111',
  accessToken: 'synthetic-token',
  organizationId: '22222222-2222-4222-8222-222222222222',
  rootKind: 'project',
  rootId: '33333333-3333-4333-8333-333333333333',
  obligationId: '44444444-4444-4444-8444-444444444444',
  compositionSnapshotId: '55555555-5555-4555-8555-555555555555',
  baselineEventId: '66666666-6666-4666-8666-666666666666',
};
const envelope = {
  schema: 'operations-positive-invoice-obligation-read.v1',
  rootKind: authority.rootKind,
  rootId: authority.rootId,
  compositionSnapshotId: authority.compositionSnapshotId,
  baselineEventId: authority.baselineEventId,
  asOf: '2026-10-03T12:30:00Z',
  budgetMinor: null,
  marginMinor: null,
};
const complete = {
  schema: 'operations-positive-invoice-obligation-projection.v1',
  authorityScope: 'operations_single_obligation_positive_invoice_only',
  organizationId: authority.organizationId,
  projectId: authority.rootId,
  obligationId: authority.obligationId,
  currency: 'SEK',
  sourceKeys: ['a'.repeat(64)],
  sourceCount: 1,
  activeSourceCount: 1,
  rejectedSourceCount: 0,
  preliminaryMinor: 5400,
  confirmedMinor: 0,
  knownInvoiceMinor: 5400,
  estimateRemainingMinor: 0,
  commitmentRemainingMinor: 0,
  remainingMinor: 0,
  eacMinor: 5400,
  coverage: 'complete_for_bound_positive_invoice_sources',
  issues: [],
  totalProjectCoverage: 'unavailable',
  creditCoverage: 'unavailable',
  hiredCoverage: 'unavailable',
  financeRecalculated: false,
  shadowOnly: true,
};

const accept = (projection, activeAuthority = authority) =>
  validatePositiveInvoiceObligationRead(
    { ...envelope, rootKind: activeAuthority.rootKind, rootId: activeAuthority.rootId, projection },
    activeAuthority,
  );
const reject = (projection, activeAuthority = authority) => {
  let denied = false;
  try {
    accept(projection, activeAuthority);
  } catch {
    denied = true;
  }
  if (!denied) throw new Error('invalid projection accepted');
};

accept(complete);
reject({ ...complete, sourceKeys: [], sourceCount: 0, activeSourceCount: 0 });
reject({ ...complete, activeSourceCount: 0 });
reject({ ...complete, projectId: '77777777-7777-4777-8777-777777777777' });
reject({ ...complete, knownInvoiceMinor: 0, preliminaryMinor: 0 });

const aggregateAuthority = {
  ...authority,
  rootKind: 'large_project',
  rootId: '88888888-8888-4888-8888-888888888888',
};
accept(
  { ...complete, projectId: '77777777-7777-4777-8777-777777777777' },
  aggregateAuthority,
);

console.log('PASS operations positive invoice client validator 6 vectors');
