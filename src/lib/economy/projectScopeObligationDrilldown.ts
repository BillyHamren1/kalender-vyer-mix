/** Authenticated copied one-obligation evidence; no client cost calculation. */
import type { ScopeRootKind } from './projectScopeObligationEvidence';
export interface ObligationDrilldown {
  schema: 'operations-scope-obligation-drilldown.v1';
  organizationId: string;
  rootKind: ScopeRootKind;
  rootId: string;
  economicScopeId: string;
  scopeRevision: number;
  compositionRevision: number;
  compositionSnapshotId: string;
  compositionFingerprint: string;
  obligationProjectId: string;
  obligationId: string;
  asOf: string;
  state: 'received_evidence' | 'baseline_changed' | 'unsupported_basis';
  referenceCurrentness: {
    composition: true;
    membership: true;
    baseline: boolean;
  };
  baseline: {
    eventId: string;
    revision: number;
    fingerprint: string;
    evidenceBasis: 'operations_manual';
    currency: string;
    category: 'personnel' | 'supplier' | 'catering' | 'other';
    costBasis: 'time' | 'invoice' | 'other';
    estimateMinor: number | null;
    committedMinor: number | null;
  };
  sourceCurrentness: 'saved_receiver_heads_only';
  upstreamCurrentness: 'unverified';
  coverage: {
    total: 'unavailable';
    source: 'unavailable';
    personnel: 'unavailable';
    supplier: 'unavailable';
    catering: 'unavailable';
    other: 'unavailable';
    credit: 'unavailable';
  };
  prognosis: {
    remainingMinor: null;
    eacMinor: null;
    budgetMinor: null;
    marginMinor: null;
  };
  sources: ObligationSource[];
  diagnostics: string[];
  shadowOnly: true;
}
export interface ObligationSource {
  sourceKey: string;
  bindingEventId: string;
  sourceSnapshotId: string;
  sourceEconomicRevision: number;
  status: 'preliminary' | 'confirmed' | null;
  amountMinor: number | null;
  bindingState: 'resolved' | 'unresolved';
  policyState: 'current' | 'missing' | 'stale';
  policyEventId: string | null;
  policyRevision: number | null;
  replacesEstimateMinor: number | null;
  consumesCommitmentMinor: number | null;
  reason: string | null;
}
const invalid = (): never => {
  throw new Error('Det sparade kostnadsunderlaget kunde inte verifieras.');
};
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const positive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const minor = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
const object = (v: unknown, keys: string[]): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid();
  const x = v as Record<string, unknown>;
  if (
    Object.keys(x).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(x, k))
  )
    return invalid();
  return x;
};
const reasons = [
  'changed_baseline',
  'changed_invoice_economics',
  'saved_source_provenance_unavailable',
  'positive_original_unavailable',
  'missing_source_binding',
  'missing_invoice_obligation',
  'unified_current_economics_unavailable',
];
const diagnostics = [
  'category_coverage_unavailable',
  'source_inventory_incomplete',
  'credit_mapping_unavailable',
  'time_and_native_catering_mapping_unavailable',
  'unsupported_cost_basis',
  ...reasons,
];
function timestamp(v: unknown): boolean {
  if (typeof v !== 'string' || v.length > 40) return false;
  const m =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      v,
    );
  return (
    !!m &&
    Number.isFinite(Date.parse(v)) &&
    new Date(m[1] + 'T00:00:00Z').toISOString().slice(0, 10) === m[1] &&
    (m[5] === 'Z' ||
      (Number(m[6]) <= 14 &&
        Number(m[7]) < 60 &&
        (Number(m[6]) < 14 || Number(m[7]) === 0)))
  );
}
export function validateObligationDrilldown(
  value: unknown,
  a: Pick<
    ObligationDrilldownAuthority,
    | 'organizationId'
    | 'rootKind'
    | 'rootId'
    | 'obligationId'
    | 'compositionSnapshotId'
    | 'baselineEventId'
  >,
): ObligationDrilldown {
  const x = object(value, [
    'schema',
    'organizationId',
    'rootKind',
    'rootId',
    'economicScopeId',
    'scopeRevision',
    'compositionRevision',
    'compositionSnapshotId',
    'compositionFingerprint',
    'obligationProjectId',
    'obligationId',
    'asOf',
    'state',
    'referenceCurrentness',
    'baseline',
    'sourceCurrentness',
    'upstreamCurrentness',
    'coverage',
    'prognosis',
    'sources',
    'diagnostics',
    'shadowOnly',
  ]);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 262144)
    return invalid();
  if (
    ![
      a.organizationId,
      a.rootId,
      a.obligationId,
      a.compositionSnapshotId,
      a.baselineEventId,
    ].every(uuid) ||
    !['project', 'large_project', 'packing_project'].includes(a.rootKind)
  )
    return invalid();
  if (
    x.schema !== 'operations-scope-obligation-drilldown.v1' ||
    x.organizationId !== a.organizationId ||
    x.rootKind !== a.rootKind ||
    x.rootId !== a.rootId ||
    x.obligationId !== a.obligationId ||
    x.compositionSnapshotId !== a.compositionSnapshotId ||
    !uuid(x.economicScopeId) ||
    !uuid(x.obligationProjectId) ||
    !hash(x.compositionFingerprint) ||
    !positive(x.scopeRevision) ||
    !positive(x.compositionRevision) ||
    !timestamp(x.asOf) ||
    typeof x.state !== 'string' ||
    !['received_evidence', 'baseline_changed', 'unsupported_basis'].includes(
      x.state,
    ) ||
    x.sourceCurrentness !== 'saved_receiver_heads_only' ||
    x.upstreamCurrentness !== 'unverified' ||
    x.shadowOnly !== true
  )
    return invalid();
  const refs = object(x.referenceCurrentness, [
    'composition',
    'membership',
    'baseline',
  ]);
  if (
    refs.composition !== true ||
    refs.membership !== true ||
    typeof refs.baseline !== 'boolean' ||
    (x.state === 'baseline_changed') !== !refs.baseline
  )
    return invalid();
  const b = object(x.baseline, [
    'eventId',
    'revision',
    'fingerprint',
    'evidenceBasis',
    'currency',
    'category',
    'costBasis',
    'estimateMinor',
    'committedMinor',
  ]);
  if (
    b.eventId !== a.baselineEventId ||
    !positive(b.revision) ||
    !hash(b.fingerprint) ||
    b.evidenceBasis !== 'operations_manual' ||
    typeof b.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(b.currency) ||
    typeof b.category !== 'string' ||
    !['personnel', 'supplier', 'catering', 'other'].includes(b.category) ||
    typeof b.costBasis !== 'string' ||
    !['time', 'invoice', 'other'].includes(b.costBasis) ||
    !minor(b.estimateMinor) ||
    !minor(b.committedMinor) ||
    (x.state === 'unsupported_basis' && b.costBasis === 'invoice') ||
    (x.state === 'received_evidence' && b.costBasis !== 'invoice')
  )
    return invalid();
  const coverage = object(x.coverage, [
    'total',
    'source',
    'personnel',
    'supplier',
    'catering',
    'other',
    'credit',
  ]);
  if (Object.values(coverage).some((v) => v !== 'unavailable'))
    return invalid();
  const prognosis = object(x.prognosis, [
    'remainingMinor',
    'eacMinor',
    'budgetMinor',
    'marginMinor',
  ]);
  if (Object.values(prognosis).some((v) => v !== null)) return invalid();
  if (
    !Array.isArray(x.diagnostics) ||
    x.diagnostics.length > 16 ||
    new Set(x.diagnostics).size !== x.diagnostics.length ||
    x.diagnostics.some(
      (v) => typeof v !== 'string' || !diagnostics.includes(v),
    ) ||
    ![
      'category_coverage_unavailable',
      'source_inventory_incomplete',
      'credit_mapping_unavailable',
      'time_and_native_catering_mapping_unavailable',
    ].every((v) => (x.diagnostics as unknown[]).includes(v)) ||
    (x.state === 'baseline_changed' &&
      !x.diagnostics.includes('changed_baseline')) ||
    (x.state === 'unsupported_basis' &&
      !x.diagnostics.includes('unsupported_cost_basis'))
  )
    return invalid();
  if (
    !Array.isArray(x.sources) ||
    x.sources.length > 200 ||
    (x.state !== 'received_evidence' && x.sources.length !== 0)
  )
    return invalid();
  const ids = new Set<string>();
  for (const row of x.sources) {
    const s = object(row, [
      'sourceKey',
      'bindingEventId',
      'sourceSnapshotId',
      'sourceEconomicRevision',
      'status',
      'amountMinor',
      'bindingState',
      'policyState',
      'policyEventId',
      'policyRevision',
      'replacesEstimateMinor',
      'consumesCommitmentMinor',
      'reason',
    ]);
    if (
      !hash(s.sourceKey) ||
      ids.has(s.sourceKey) ||
      !uuid(s.bindingEventId) ||
      !uuid(s.sourceSnapshotId) ||
      !positive(s.sourceEconomicRevision) ||
      !minor(s.amountMinor) ||
      !minor(s.replacesEstimateMinor) ||
      !minor(s.consumesCommitmentMinor) ||
      typeof s.bindingState !== 'string' ||
      !['resolved', 'unresolved'].includes(s.bindingState) ||
      typeof s.policyState !== 'string' ||
      !['current', 'missing', 'stale'].includes(s.policyState) ||
      (s.reason !== null &&
        (typeof s.reason !== 'string' || !reasons.includes(s.reason))) ||
      (s.policyEventId !== null && !uuid(s.policyEventId)) ||
      (s.policyRevision !== null && !positive(s.policyRevision)) ||
      (s.policyEventId === null) !== (s.policyRevision === null)
    )
      return invalid();
    if (s.bindingState === 'resolved') {
      if (
        s.amountMinor === null ||
        typeof s.status !== 'string' ||
        !['preliminary', 'confirmed'].includes(s.status) ||
        s.reason !== null
      )
        return invalid();
    } else if (
      s.amountMinor !== null ||
      s.status !== null ||
      s.reason === null ||
      s.policyState === 'current'
    )
      return invalid();
    if (
      (s.policyState === 'missing' &&
        (s.policyEventId !== null || s.policyRevision !== null)) ||
      (s.policyState !== 'missing' &&
        (s.policyEventId === null || s.policyRevision === null)) ||
      (s.policyState !== 'current' &&
        (s.replacesEstimateMinor !== null ||
          s.consumesCommitmentMinor !== null))
    )
      return invalid();
    if (
      s.policyState === 'current' &&
      ((b.estimateMinor === null && s.replacesEstimateMinor !== null) ||
        (b.committedMinor === null && s.consumesCommitmentMinor !== null))
    )
      return invalid();
    ids.add(s.sourceKey);
  }
  return x as unknown as ObligationDrilldown;
}
export interface ObligationDrilldownAuthority {
  actorId: string;
  accessToken: string;
  organizationId: string;
  rootKind: ScopeRootKind;
  rootId: string;
  obligationId: string;
  compositionSnapshotId: string;
  baselineEventId: string;
}
export interface ObligationDrilldownClient {
  auth: {
    getSession(): PromiseLike<{
      data: { session: { access_token: string; user: { id: string } } | null };
      error: unknown;
    }>;
  };
  rpc(
    name: 'read_operations_scope_obligation_drilldown_v1',
    args: {
      p_request: {
        schema_version: 'operations-scope-obligation-drilldown-read.v1';
        root_kind: ScopeRootKind;
        root_id: string;
        obligation_id: string;
        expected_composition_snapshot_id: string;
        expected_baseline_event_id: string;
      };
    },
  ): {
    setHeader(
      name: string,
      value: string,
    ): {
      abortSignal(
        signal: AbortSignal,
      ): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}
/** Local session matching prevents cache mixing; SQL authorizer remains the authority. */
export async function readObligationDrilldown(
  client: ObligationDrilldownClient,
  a: ObligationDrilldownAuthority,
  signal: AbortSignal,
): Promise<ObligationDrilldown> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    typeof a.accessToken !== 'string' ||
    a.accessToken.length === 0 ||
    !['project', 'large_project', 'packing_project'].includes(a.rootKind) ||
    ![
      a.actorId,
      a.organizationId,
      a.rootId,
      a.obligationId,
      a.compositionSnapshotId,
      a.baselineEventId,
    ].every((v) => typeof v === 'string' && uuid.test(v))
  )
    return invalid();
  if (signal.aborted) throw new Error('Underlagsläsningen avbröts.');
  const controller = new AbortController(),
    bounded = controller.signal,
    started = performance.now();
  let abort: (() => void) | undefined;
  const abortInput = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abortInput, { once: true });
  if (signal.aborted) abortInput();
  const deadline = setTimeout(
    () =>
      controller.abort(new Error('Underlagsläsningens tidsgräns passerades.')),
    15_000,
  );
  const stop = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('Underlagsläsningen avbröts.'));
    bounded.addEventListener('abort', abort, { once: true });
    if (bounded.aborted) abort();
  });
  const fresh = () => {
    if (bounded.aborted) throw new Error('Underlagsläsningen avbröts.');
    if (performance.now() - started >= 15_000)
      throw new Error('Underlagsläsningen avbröts.');
  };
  const checkSession = async () => {
    const s = await Promise.race([
      Promise.resolve(client.auth.getSession()),
      stop,
    ]);
    fresh();
    if (
      s.error ||
      s.data.session?.access_token !== a.accessToken ||
      s.data.session.user.id !== a.actorId
    )
      throw new Error('Sessionen har ändrats.');
  };
  try {
    await checkSession();
    const result = await Promise.race([
      Promise.resolve(
        client
          .rpc('read_operations_scope_obligation_drilldown_v1', {
            p_request: {
              schema_version: 'operations-scope-obligation-drilldown-read.v1',
              root_kind: a.rootKind,
              root_id: a.rootId,
              obligation_id: a.obligationId,
              expected_composition_snapshot_id: a.compositionSnapshotId,
              expected_baseline_event_id: a.baselineEventId,
            },
          })
          .setHeader('Authorization', `Bearer ${a.accessToken}`)
          .abortSignal(bounded),
      ),
      stop,
    ]);
    fresh();
    if (result.error) {
      if (
        typeof result.error === 'object' &&
        result.error !== null &&
        (result.error as { code?: unknown }).code === 'PT409'
      )
        throw new Error(
          'Det sparade underlaget har ändrats. Öppna posten igen.',
        );
      throw new Error('Underlaget kunde inte hämtas.');
    }
    await checkSession();
    const value = validateObligationDrilldown(result.data, a);
    fresh();
    return value;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', abortInput);
    if (abort) bounded.removeEventListener('abort', abort);
  }
}
