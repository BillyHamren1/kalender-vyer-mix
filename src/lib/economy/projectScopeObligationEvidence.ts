/** Copied manual authority evidence. It never calculates whole-project costs. */
export type ScopeRootKind = 'project' | 'large_project' | 'packing_project';
export interface ScopeBaselineEvidence {
  baselineEventId: string;
  projectId: string;
  obligationId: string;
  baselineRevision: number;
  baselineFingerprint: string;
  evidenceBasis: 'operations_manual';
  authorityScope: 'local_project_only';
  category: 'personnel' | 'supplier' | 'catering' | 'other';
  currency: string;
  costBasis: 'time' | 'invoice' | 'other';
  estimateMinor: number | null;
  committedMinor: number | null;
}
export interface ScopeSourceEvidence {
  sourceAnchor: string;
  projectId: string;
  obligationId: string;
  baselineEventId: string;
  bindingEventId: string;
  sourceSnapshotId: string;
  sourceEconomicRevision: number;
  sourceEconomicFingerprint: string;
  observedAmountMinor: number;
  observedStatus: 'preliminary' | 'confirmed' | 'rejected';
  sourceBindingState: 'bound_original' | 'unresolved';
  sourcePolicyState: 'current' | 'unresolved';
  policyEventId: string | null;
  policyRevision: number | null;
}
export interface ScopeObligationEvidence {
  schema: 'operations-scope-obligation-evidence.v1';
  organizationId: string;
  rootKind: ScopeRootKind;
  rootId: string;
  generatedAt: string;
  state: 'no_scope' | 'no_evidence' | 'evidence';
  economicScopeId: string | null;
  scopeRevision: number | null;
  currentScopeRevision: number | null;
  membershipFingerprint: string | null;
  compositionRevision: number | null;
  snapshotId: string | null;
  snapshotFingerprint: string | null;
  publishedAt: string | null;
  currency: string | null;
  referenceCurrentness: {
    membership: boolean | null;
    baselines: boolean | null;
    sources: boolean | null;
  };
  authorityScope: 'canonical_scope_composition';
  pricingBasis: 'operations_manual_composition';
  sourceCurrentness: 'receiver_v1_only';
  upstreamCurrentness: 'unverified';
  coverage: 'unavailable';
  categoryCoverage: {
    personnel: 'unavailable';
    supplier: 'unavailable';
    catering: 'unavailable';
    other: 'unavailable';
  };
  knownEstimateMinor: number | null;
  knownCommitmentMinor: number | null;
  allSelectedEstimatesKnown: boolean;
  allSelectedCommitmentsKnown: boolean;
  eacMinor: null;
  budgetMinor: null;
  marginMinor: null;
  shadowOnly: true;
  baselines: ScopeBaselineEvidence[];
  sources: ScopeSourceEvidence[];
}
const invalid = (): never => {
  throw new Error('Det sparade kostnadsunderlaget kunde inte verifieras.');
};
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const positive = (v: unknown): v is number => integer(v) && v > 0;
const minor = (v: unknown): v is number | null => v === null || integer(v);
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
function timestamp(v: unknown): v is string {
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
export function validateScopeObligationEvidence(
  value: unknown,
  organizationId: string,
  rootKind: ScopeRootKind,
  rootId: string,
): ScopeObligationEvidence {
  const x = object(value, [
    'schema',
    'organizationId',
    'rootKind',
    'rootId',
    'generatedAt',
    'state',
    'economicScopeId',
    'scopeRevision',
    'currentScopeRevision',
    'membershipFingerprint',
    'compositionRevision',
    'snapshotId',
    'snapshotFingerprint',
    'publishedAt',
    'currency',
    'referenceCurrentness',
    'authorityScope',
    'pricingBasis',
    'sourceCurrentness',
    'upstreamCurrentness',
    'coverage',
    'categoryCoverage',
    'knownEstimateMinor',
    'knownCommitmentMinor',
    'allSelectedEstimatesKnown',
    'allSelectedCommitmentsKnown',
    'eacMinor',
    'budgetMinor',
    'marginMinor',
    'shadowOnly',
    'baselines',
    'sources',
  ]);
  if (
    !uuid(organizationId) ||
    !uuid(rootId) ||
    !uuid(x.organizationId) ||
    !uuid(x.rootId) ||
    x.organizationId.toLowerCase() !== organizationId.toLowerCase() ||
    x.rootId.toLowerCase() !== rootId.toLowerCase() ||
    x.rootKind !== rootKind ||
    !['project', 'large_project', 'packing_project'].includes(rootKind) ||
    x.schema !== 'operations-scope-obligation-evidence.v1' ||
    !timestamp(x.generatedAt) ||
    typeof x.state !== 'string' ||
    !['no_scope', 'no_evidence', 'evidence'].includes(x.state) ||
    x.authorityScope !== 'canonical_scope_composition' ||
    x.pricingBasis !== 'operations_manual_composition' ||
    x.sourceCurrentness !== 'receiver_v1_only' ||
    x.upstreamCurrentness !== 'unverified' ||
    x.coverage !== 'unavailable' ||
    x.eacMinor !== null ||
    x.budgetMinor !== null ||
    x.marginMinor !== null ||
    x.shadowOnly !== true ||
    !Array.isArray(x.baselines) ||
    x.baselines.length > 1000 ||
    !Array.isArray(x.sources) ||
    x.sources.length > 200
  )
    return invalid();
  const refs = object(x.referenceCurrentness, [
    'membership',
    'baselines',
    'sources',
  ]);
  const categories = object(x.categoryCoverage, [
    'personnel',
    'supplier',
    'catering',
    'other',
  ]);
  if (Object.values(categories).some((v) => v !== 'unavailable'))
    return invalid();
  if (x.state !== 'evidence') {
    if (
      x.baselines.length ||
      x.sources.length ||
      x.knownEstimateMinor !== null ||
      x.knownCommitmentMinor !== null ||
      x.allSelectedEstimatesKnown !== false ||
      x.allSelectedCommitmentsKnown !== false ||
      Object.values(refs).some((v) => v !== null) ||
      [
        'scopeRevision',
        'membershipFingerprint',
        'compositionRevision',
        'snapshotId',
        'snapshotFingerprint',
        'publishedAt',
        'currency',
      ].some((k) => x[k] !== null)
    )
      return invalid();
    if (
      x.state === 'no_scope'
        ? x.economicScopeId !== null || x.currentScopeRevision !== null
        : !uuid(x.economicScopeId) || !positive(x.currentScopeRevision)
    )
      return invalid();
    return x as unknown as ScopeObligationEvidence;
  }
  if (
    !uuid(x.economicScopeId) ||
    !positive(x.scopeRevision) ||
    !positive(x.currentScopeRevision) ||
    x.currentScopeRevision < x.scopeRevision ||
    !positive(x.compositionRevision) ||
    !uuid(x.snapshotId) ||
    !hash(x.membershipFingerprint) ||
    !hash(x.snapshotFingerprint) ||
    !timestamp(x.publishedAt) ||
    typeof x.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(x.currency) ||
    Object.values(refs).some((v) => typeof v !== 'boolean') ||
    typeof x.allSelectedEstimatesKnown !== 'boolean' ||
    typeof x.allSelectedCommitmentsKnown !== 'boolean' ||
    !minor(x.knownEstimateMinor) ||
    !minor(x.knownCommitmentMinor)
  )
    return invalid();
  const obligations = new Map<string, Record<string, unknown>>(),
    eventIds = new Set<string>();
  for (const raw of x.baselines) {
    const b = object(raw, [
      'baselineEventId',
      'projectId',
      'obligationId',
      'baselineRevision',
      'baselineFingerprint',
      'evidenceBasis',
      'authorityScope',
      'category',
      'currency',
      'costBasis',
      'estimateMinor',
      'committedMinor',
    ]);
    if (
      ![b.baselineEventId, b.projectId, b.obligationId].every(uuid) ||
      !positive(b.baselineRevision) ||
      !hash(b.baselineFingerprint) ||
      b.evidenceBasis !== 'operations_manual' ||
      b.authorityScope !== 'local_project_only' ||
      b.currency !== x.currency ||
      typeof b.category !== 'string' ||
      !['personnel', 'supplier', 'catering', 'other'].includes(b.category) ||
      typeof b.costBasis !== 'string' ||
      !['time', 'invoice', 'other'].includes(b.costBasis) ||
      !minor(b.estimateMinor) ||
      !minor(b.committedMinor)
    )
      return invalid();
    const oid = (b.obligationId as string).toLowerCase(),
      eid = (b.baselineEventId as string).toLowerCase();
    if (obligations.has(oid) || eventIds.has(eid)) return invalid();
    obligations.set(oid, b);
    eventIds.add(eid);
  }
  const anchors = new Set<string>();
  for (const raw of x.sources) {
    const s = object(raw, [
      'sourceAnchor',
      'projectId',
      'obligationId',
      'baselineEventId',
      'bindingEventId',
      'sourceSnapshotId',
      'sourceEconomicRevision',
      'sourceEconomicFingerprint',
      'observedAmountMinor',
      'observedStatus',
      'sourceBindingState',
      'sourcePolicyState',
      'policyEventId',
      'policyRevision',
    ]);
    if (
      !hash(s.sourceAnchor) ||
      !hash(s.sourceEconomicFingerprint) ||
      ![
        s.projectId,
        s.obligationId,
        s.baselineEventId,
        s.bindingEventId,
        s.sourceSnapshotId,
      ].every(uuid) ||
      !positive(s.sourceEconomicRevision) ||
      !integer(s.observedAmountMinor) ||
      typeof s.observedStatus !== 'string' ||
      !['preliminary', 'confirmed', 'rejected'].includes(s.observedStatus) ||
      typeof s.sourceBindingState !== 'string' ||
      !['bound_original', 'unresolved'].includes(s.sourceBindingState) ||
      typeof s.sourcePolicyState !== 'string' ||
      !['current', 'unresolved'].includes(s.sourcePolicyState)
    )
      return invalid();
    const b = obligations.get((s.obligationId as string).toLowerCase());
    if (
      !b ||
      (s.projectId as string).toLowerCase() !==
        (b.projectId as string).toLowerCase() ||
      anchors.has(s.sourceAnchor)
    )
      return invalid();
    anchors.add(s.sourceAnchor);
    if (
      s.sourcePolicyState === 'current'
        ? s.sourceBindingState !== 'bound_original' ||
          !uuid(s.policyEventId) ||
          !positive(s.policyRevision)
        : s.policyEventId !== null || s.policyRevision !== null
    )
      return invalid();
  }
  // Consistency of saved manual summary, never an estimate replacement/EAC calculation.
  for (const [field, key, all] of [
    ['knownEstimateMinor', 'estimateMinor', 'allSelectedEstimatesKnown'],
    ['knownCommitmentMinor', 'committedMinor', 'allSelectedCommitmentsKnown'],
  ] as const) {
    const vals = x.baselines
      .map((b) => (b as Record<string, unknown>)[key])
      .filter((v): v is number => v !== null);
    const sum = vals.length ? vals.reduce((a, n) => a + BigInt(n), 0n) : null;
    if (
      (sum === null ? null : Number(sum)) !== x[field] ||
      (sum !== null && sum > BigInt(Number.MAX_SAFE_INTEGER)) ||
      x[all] !== (x.baselines.length > 0 && vals.length === x.baselines.length)
    )
      return invalid();
  }
  if (
    (!x.baselines.length && refs.baselines !== false) ||
    (!x.sources.length && refs.sources !== false) ||
    (refs.membership === true && x.scopeRevision !== x.currentScopeRevision)
  )
    return invalid();
  return x as unknown as ScopeObligationEvidence;
}
export interface ScopeEvidenceReadAuthority {
  actorId: string;
  accessToken: string;
  organizationId: string;
  rootKind: ScopeRootKind;
  rootId: string;
}
export interface ScopeEvidenceReadClient {
  auth: {
    getSession(): PromiseLike<{
      data: { session: { access_token: string; user: { id: string } } | null };
      error: unknown;
    }>;
  };
  rpc(
    name: 'read_operations_scope_obligation_evidence_v1',
    args: {
      p_organization_id: string;
      p_root_kind: ScopeRootKind;
      p_root_id: string;
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
export async function readScopeObligationEvidence(
  client: ScopeEvidenceReadClient,
  a: ScopeEvidenceReadAuthority,
  signal: AbortSignal,
): Promise<ScopeObligationEvidence> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    typeof a.accessToken !== 'string' ||
    a.accessToken.length === 0 ||
    !['project', 'large_project', 'packing_project'].includes(a.rootKind) ||
    ![a.actorId, a.organizationId, a.rootId].every(
      (v) => typeof v === 'string' && uuid.test(v),
    )
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
          .rpc('read_operations_scope_obligation_evidence_v1', {
            p_organization_id: a.organizationId,
            p_root_kind: a.rootKind,
            p_root_id: a.rootId,
          })
          .setHeader('Authorization', `Bearer ${a.accessToken}`)
          .abortSignal(bounded),
      ),
      stop,
    ]);
    fresh();
    if (result.error) throw new Error('Underlaget kunde inte hämtas.');
    await checkSession();
    const value = validateScopeObligationEvidence(
      result.data,
      a.organizationId,
      a.rootKind,
      a.rootId,
    );
    fresh();
    return value;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', abortInput);
    if (abort) bounded.removeEventListener('abort', abort);
  }
}
