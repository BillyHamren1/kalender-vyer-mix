import {
  validateProjectNativeCostEvidence,
  type NativeCateringEvidenceRow,
} from './projectNativeCostEvidence';
export interface CateringParityWithdrawal {
  streamKey: string;
  revision: number;
  publishedAt: string;
}
export interface CateringParityCurrency {
  currency: string;
  preliminaryKnownMinor: number | null;
  confirmedKnownMinor: number | null;
  knownMinor: number | null;
  receivedTotalMinor: number | null;
  missingCostLineCount: number;
  missingCostMinutes: number;
}
export interface ProjectCateringEvidenceParity {
  schema: 'operations-catering-project-evidence.v3';
  organizationId: string;
  projectId: string;
  generatedAt: string;
  upstreamCurrentness: 'unverified';
  shadowOnly: true;
  evidenceState: 'no_evidence' | 'complete' | 'incomplete';
  lines: NativeCateringEvidenceRow[];
  withdrawals: CateringParityWithdrawal[];
  currencyTotals: CateringParityCurrency[];
  counts: {
    lineCount: number;
    withdrawalCount: number;
    missingCostLineCount: number;
    missingCostMinutes: number;
  };
}
const invalid = (): never => {
  throw new Error('Projektets Cateringunderlag kunde inte verifieras.');
};
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
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
/** Checks saved copied-money consistency only; never computes a duration/rate cost. */
export function validateProjectCateringEvidenceParity(
  value: unknown,
  organizationId: string,
  projectId: string,
): ProjectCateringEvidenceParity {
  const x = object(value, [
    'schema',
    'organizationId',
    'projectId',
    'generatedAt',
    'upstreamCurrentness',
    'shadowOnly',
    'evidenceState',
    'lines',
    'withdrawals',
    'currencyTotals',
    'counts',
  ]);
  if (
    x.schema !== 'operations-catering-project-evidence.v3' ||
    x.upstreamCurrentness !== 'unverified' ||
    x.shadowOnly !== true ||
    !timestamp(x.generatedAt) ||
    !Array.isArray(x.lines) ||
    !Array.isArray(x.withdrawals) ||
    !Array.isArray(x.currencyTotals) ||
    x.lines.length + x.withdrawals.length > 2000 ||
    x.currencyTotals.length > 2000
  )
    return invalid();
  // Reuse the actual frozen v2 native row validator without changing or displaying its Time/invoice rows.
  const base = validateProjectNativeCostEvidence(
    {
      schema: 'operations-project-cost-evidence.v2',
      organizationId: x.organizationId,
      projectId: x.projectId,
      generatedAt: x.generatedAt,
      personnel: [],
      invoices: [],
      missingPersonnelCostCount: 0,
      catering: x.lines,
      missingCateringCostCount: x.lines.filter(
        (l: NativeCateringEvidenceRow) =>
          l.status !== 'rejected' && l.coverage === 'missing_rate',
      ).length,
    },
    organizationId,
    projectId,
  );
  const lines = base.catering,
    seen = new Set(lines.map((l) => l.streamKey));
  if (lines.some((l) => !timestamp(l.publishedAt))) return invalid();
  for (const value of x.withdrawals) {
    const r = object(value, ['streamKey', 'revision', 'publishedAt']);
    if (
      typeof r.streamKey !== 'string' ||
      !/^[0-9a-f]{64}$/.test(r.streamKey) ||
      seen.has(r.streamKey) ||
      !integer(r.revision) ||
      r.revision === 0 ||
      !timestamp(r.publishedAt)
    )
      return invalid();
    seen.add(r.streamKey);
  }
  const counts = object(x.counts, [
    'lineCount',
    'withdrawalCount',
    'missingCostLineCount',
    'missingCostMinutes',
  ]);
  if (
    !Object.values(counts).every(integer) ||
    counts.lineCount !== lines.length ||
    counts.withdrawalCount !== x.withdrawals.length
  )
    return invalid();
  const active = lines.filter((l) => l.status !== 'rejected'),
    missing = active.filter((l) => l.amountMinor === null);
  if (
    counts.missingCostLineCount !== missing.length ||
    BigInt(counts.missingCostMinutes as number) !==
      missing.reduce((s, l) => s + BigInt(l.minutes), 0n) ||
    x.evidenceState !==
      (!lines.length
        ? 'no_evidence'
        : missing.length
          ? 'incomplete'
          : 'complete')
  )
    return invalid();
  const expected = new Set(active.map((l) => l.currency)),
    currencies = new Set<string>();
  for (const value of x.currencyTotals) {
    const t = object(value, [
      'currency',
      'preliminaryKnownMinor',
      'confirmedKnownMinor',
      'knownMinor',
      'receivedTotalMinor',
      'missingCostLineCount',
      'missingCostMinutes',
    ]);
    if (
      typeof t.currency !== 'string' ||
      !expected.has(t.currency) ||
      currencies.has(t.currency) ||
      ![
        'preliminaryKnownMinor',
        'confirmedKnownMinor',
        'knownMinor',
        'receivedTotalMinor',
      ].every((k) => t[k] === null || integer(t[k])) ||
      !integer(t.missingCostLineCount) ||
      !integer(t.missingCostMinutes)
    )
      return invalid();
    currencies.add(t.currency);
    const scoped = active.filter((l) => l.currency === t.currency),
      absent = scoped.filter((l) => l.amountMinor === null);
    const known = (status?: string) =>
      scoped.filter(
        (l) => l.amountMinor !== null && (!status || l.status === status),
      );
    const match = (v: unknown, rows: NativeCateringEvidenceRow[]) =>
      rows.length
        ? v !== null &&
          BigInt(v as number) ===
            rows.reduce((s, l) => s + BigInt(l.amountMinor!), 0n)
        : v === null;
    if (
      !match(t.preliminaryKnownMinor, known('preliminary')) ||
      !match(t.confirmedKnownMinor, known('confirmed')) ||
      !match(t.knownMinor, known()) ||
      (absent.length
        ? t.receivedTotalMinor !== null
        : !match(t.receivedTotalMinor, known())) ||
      t.missingCostLineCount !== absent.length ||
      BigInt(t.missingCostMinutes) !==
        absent.reduce((s, l) => s + BigInt(l.minutes), 0n)
    )
      return invalid();
  }
  if (expected.size !== currencies.size) return invalid();
  return structuredClone(value) as ProjectCateringEvidenceParity;
}
export interface CateringReadAuthority {
  actorId: string;
  accessToken: string;
  organizationId: string;
  projectId: string;
}
export interface CateringReadClient {
  auth: {
    getSession(): PromiseLike<{
      data: { session: { access_token: string; user: { id: string } } | null };
      error: unknown;
    }>;
  };
  rpc(
    name: 'read_operations_catering_project_evidence_v3',
    args: { p_organization_id: string; p_project_id: string },
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
export async function readCateringProjectEvidenceParity(
  client: CateringReadClient,
  a: CateringReadAuthority,
  signal: AbortSignal,
): Promise<ProjectCateringEvidenceParity> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    typeof a.accessToken !== 'string' ||
    a.accessToken.length === 0 ||
    ![a.actorId, a.organizationId, a.projectId].every(
      (v) => typeof v === 'string' && uuid.test(v),
    )
  )
    return invalid();
  if (signal.aborted) throw new Error('Cateringläsningen avbröts.');
  const controller = new AbortController(),
    bounded = controller.signal,
    started = performance.now();
  let abort: (() => void) | undefined;
  const abortInput = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abortInput, { once: true });
  if (signal.aborted) abortInput();
  const deadline = setTimeout(
    () =>
      controller.abort(new Error('Cateringläsningens tidsgräns passerades.')),
    15_000,
  );
  const stop = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('Cateringläsningen avbröts.'));
    bounded.addEventListener('abort', abort, { once: true });
    if (bounded.aborted) abort();
  });
  const fresh = () => {
    if (bounded.aborted) throw new Error('Cateringläsningen avbröts.');
    if (performance.now() - started >= 15_000)
      throw new Error('Cateringläsningen avbröts.');
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
      throw new Error('Cateringsessionen har ändrats.');
  };
  try {
    await checkSession();
    const result = await Promise.race([
      Promise.resolve(
        client
          .rpc('read_operations_catering_project_evidence_v3', {
            p_organization_id: a.organizationId,
            p_project_id: a.projectId,
          })
          .setHeader('Authorization', `Bearer ${a.accessToken}`)
          .abortSignal(bounded),
      ),
      stop,
    ]);
    fresh();
    if (result.error) throw new Error('Cateringunderlaget kunde inte hämtas.');
    await checkSession();
    const value = validateProjectCateringEvidenceParity(
      result.data,
      a.organizationId,
      a.projectId,
    );
    fresh();
    return value;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', abortInput);
    if (abort) bounded.removeEventListener('abort', abort);
  }
}
