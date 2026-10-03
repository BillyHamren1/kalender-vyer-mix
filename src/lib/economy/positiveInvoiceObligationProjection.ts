import type { ScopeRootKind } from './projectScopeObligationEvidence';

export interface PositiveInvoiceObligationProjection {
  schema: 'operations-positive-invoice-obligation-projection.v1';
  authorityScope: 'operations_single_obligation_positive_invoice_only';
  organizationId: string;
  projectId: string;
  obligationId: string;
  currency: string;
  sourceKeys: string[];
  sourceCount: number;
  activeSourceCount: number;
  rejectedSourceCount: number;
  preliminaryMinor: number | null;
  confirmedMinor: number | null;
  knownInvoiceMinor: number | null;
  estimateRemainingMinor: number | null;
  commitmentRemainingMinor: number | null;
  remainingMinor: number | null;
  eacMinor: number | null;
  coverage: 'complete_for_bound_positive_invoice_sources' | 'unavailable';
  issues: string[];
  totalProjectCoverage: 'unavailable';
  creditCoverage: 'unavailable';
  hiredCoverage: 'unavailable';
  financeRecalculated: false;
  shadowOnly: true;
}
export interface PositiveInvoiceObligationRead {
  schema: 'operations-positive-invoice-obligation-read.v1';
  rootKind: ScopeRootKind;
  rootId: string;
  compositionSnapshotId: string;
  baselineEventId: string;
  asOf: string;
  projection: PositiveInvoiceObligationProjection;
  budgetMinor: null;
  marginMinor: null;
}
export interface PositiveInvoiceObligationAuthority {
  actorId: string;
  accessToken: string;
  organizationId: string;
  rootKind: ScopeRootKind;
  rootId: string;
  obligationId: string;
  compositionSnapshotId: string;
  baselineEventId: string;
}
export interface PositiveInvoiceObligationClient {
  auth: {
    getSession(): PromiseLike<{
      data: { session: { access_token: string; user: { id: string } } | null };
      error: unknown;
    }>;
  };
  rpc(
    name: 'read_operations_positive_invoice_obligation_projection_v1',
    args: {
      p_request: {
        schema_version: 'operations-positive-invoice-obligation-read.v1';
        root_kind: ScopeRootKind;
        root_id: string;
        obligation_id: string;
        expected_composition_snapshot_id: string;
        expected_baseline_event_id: string;
      };
    },
  ): {
    setHeader(name: string, value: string): {
      abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}
const invalid = (): never => {
  throw new Error('Den avgränsade fakturaprognosen kunde inte verifieras.');
};
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const money = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
const object = (v: unknown, keys: string[]): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid();
  const x = v as Record<string, unknown>;
  if (Object.keys(x).length !== keys.length || keys.some((k) => !Object.hasOwn(x, k)))
    return invalid();
  return x;
};
function timestamp(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
    Number.isFinite(Date.parse(v))
  );
}
export function validatePositiveInvoiceObligationRead(
  value: unknown,
  a: PositiveInvoiceObligationAuthority,
): PositiveInvoiceObligationRead {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 262144) return invalid();
  const x = object(value, [
    'schema','rootKind','rootId','compositionSnapshotId','baselineEventId','asOf','projection','budgetMinor','marginMinor',
  ]);
  if (
    x.schema !== 'operations-positive-invoice-obligation-read.v1' ||
    x.rootKind !== a.rootKind || x.rootId !== a.rootId ||
    x.compositionSnapshotId !== a.compositionSnapshotId || x.baselineEventId !== a.baselineEventId ||
    !timestamp(x.asOf) || x.budgetMinor !== null || x.marginMinor !== null
  ) return invalid();
  const p = object(x.projection, [
    'schema','authorityScope','organizationId','projectId','obligationId','currency','sourceKeys','sourceCount',
    'activeSourceCount','rejectedSourceCount','preliminaryMinor','confirmedMinor','knownInvoiceMinor',
    'estimateRemainingMinor','commitmentRemainingMinor','remainingMinor','eacMinor','coverage','issues',
    'totalProjectCoverage','creditCoverage','hiredCoverage','financeRecalculated','shadowOnly',
  ]);
  if (
    p.schema !== 'operations-positive-invoice-obligation-projection.v1' ||
    p.authorityScope !== 'operations_single_obligation_positive_invoice_only' ||
    p.organizationId !== a.organizationId || p.obligationId !== a.obligationId || !uuid(p.projectId) ||
    (a.rootKind === 'project' && p.projectId !== a.rootId) ||
    typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency) ||
    p.totalProjectCoverage !== 'unavailable' || p.creditCoverage !== 'unavailable' || p.hiredCoverage !== 'unavailable' ||
    p.financeRecalculated !== false || p.shadowOnly !== true ||
    !['complete_for_bound_positive_invoice_sources','unavailable'].includes(String(p.coverage))
  ) return invalid();
  const counts = [p.sourceCount,p.activeSourceCount,p.rejectedSourceCount];
  const amounts = [p.preliminaryMinor,p.confirmedMinor,p.knownInvoiceMinor,p.estimateRemainingMinor,
    p.commitmentRemainingMinor,p.remainingMinor,p.eacMinor];
  if (counts.some((v) => typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > 200) || amounts.some((v) => !money(v)))
    return invalid();
  if (!Array.isArray(p.sourceKeys) || p.sourceKeys.length !== p.sourceCount ||
    p.sourceKeys.some((v) => !hash(v)) || new Set(p.sourceKeys).size !== p.sourceKeys.length ||
    [...p.sourceKeys].sort().some((v,i) => v !== p.sourceKeys[i])) return invalid();
  if (!Array.isArray(p.issues) || p.issues.length > 202 || p.issues.some((v) => typeof v !== 'string' || v.length > 100)) return invalid();
  if (p.activeSourceCount + p.rejectedSourceCount > p.sourceCount)
    return invalid();
  if (p.coverage === 'unavailable') {
    if ([p.preliminaryMinor,p.confirmedMinor,p.knownInvoiceMinor,p.estimateRemainingMinor,p.commitmentRemainingMinor,p.remainingMinor,p.eacMinor].some((v) => v !== null) || p.issues.length === 0)
      return invalid();
  } else {
    if ([p.preliminaryMinor,p.confirmedMinor,p.knownInvoiceMinor,p.estimateRemainingMinor,p.commitmentRemainingMinor,p.remainingMinor,p.eacMinor].some((v) => typeof v !== 'number') ||
      p.sourceCount !== p.activeSourceCount + p.rejectedSourceCount ||
      ((p.knownInvoiceMinor as number) > 0) !== (p.activeSourceCount > 0) ||
      p.knownInvoiceMinor !== (p.preliminaryMinor as number) + (p.confirmedMinor as number) ||
      p.issues.length !== 0 || p.remainingMinor !== Math.max(p.estimateRemainingMinor as number,p.commitmentRemainingMinor as number) ||
      p.eacMinor !== (p.knownInvoiceMinor as number) + (p.remainingMinor as number)) return invalid();
  }
  return x as unknown as PositiveInvoiceObligationRead;
}

export async function readPositiveInvoiceObligationProjection(
  client: PositiveInvoiceObligationClient,
  a: PositiveInvoiceObligationAuthority,
  signal: AbortSignal,
): Promise<PositiveInvoiceObligationRead> {
  if (!a.accessToken || ![a.actorId,a.organizationId,a.rootId,a.obligationId,a.compositionSnapshotId,a.baselineEventId].every(uuid))
    return invalid();
  const controller = new AbortController();
  const started = performance.now();
  const relay = () => controller.abort(signal.reason);
  signal.addEventListener('abort', relay, { once: true });
  if (signal.aborted) relay();
  const deadline = setTimeout(() => controller.abort(new Error('Tidsgränsen passerades.')), 15000);
  const stop = new Promise<never>((_,reject) => {
    const fail = () => reject(new Error('Läsningen avbröts.'));
    controller.signal.addEventListener('abort', fail, { once:true });
    if (controller.signal.aborted) fail();
  });
  const fresh = () => { if (controller.signal.aborted || performance.now()-started>=15000) throw new Error('Läsningen avbröts.'); };
  const session = async () => {
    const s = await Promise.race([Promise.resolve(client.auth.getSession()),stop]);fresh();
    if (s.error || s.data.session?.access_token !== a.accessToken || s.data.session.user.id !== a.actorId) throw new Error('Sessionen har ändrats.');
  };
  try {
    await session();
    const result = await Promise.race([Promise.resolve(client.rpc('read_operations_positive_invoice_obligation_projection_v1', {
      p_request: {schema_version:'operations-positive-invoice-obligation-read.v1',root_kind:a.rootKind,root_id:a.rootId,
        obligation_id:a.obligationId,expected_composition_snapshot_id:a.compositionSnapshotId,expected_baseline_event_id:a.baselineEventId},
    }).setHeader('Authorization',`Bearer ${a.accessToken}`).abortSignal(controller.signal)),stop]);
    fresh();if (result.error) throw new Error('Den avgränsade fakturaprognosen kunde inte hämtas.');
    await session();const value=validatePositiveInvoiceObligationRead(result.data,a);fresh();return value;
  } finally { clearTimeout(deadline);signal.removeEventListener('abort',relay); }
}
