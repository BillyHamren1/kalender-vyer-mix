export type Step8Coverage = 'complete' | 'incomplete' | 'unavailable';
export type Step8CostStatus = 'preliminary' | 'confirmed' | 'rejected';

export interface ProjectEconomyStep8PersonnelRow {
  organizationId: string;
  projectId: string;
  sourceBookingId: string | null;
  sourceTimeStreamKey: string;
  reportId: string;
  lineId: string;
  revision: number;
  timeSnapshotVersion: number;
  workDate: string;
  minutes: number;
  amountMinor: number | null;
  currency: string;
  status: Step8CostStatus;
  coverage: 'complete' | 'missing_rate';
}

export interface ProjectEconomyStep8InvoiceRow {
  organizationId: string;
  projectId: string;
  sourceOrganizationId: string;
  invoiceId: string;
  allocationId: string;
  revision: number;
  sourceProtocol: 'v1' | 'v2';
  sourceEconomicRevision: number;
  sourceEconomicFingerprint: string;
  sourceObservationId: string;
  publicationFingerprint: string;
  documentFingerprint: string;
  kind: 'invoice' | 'credit';
  amountMinor: number;
  currency: string;
  status: Step8CostStatus;
  approvalState: 'pending' | 'not_pending';
  accountingState: 'draft' | 'booked' | 'cancelled';
  settlementState: 'unpaid' | 'part_paid' | 'paid' | 'inconsistent';
  sourceChanged: boolean;
  creditRelationCoverage: 'not_applicable' | 'unresolved' | 'linked';
  creditRelationshipFingerprint: string | null;
  sourceAnchor: string | null;
  creditedSourceAnchor: string | null;
  unallocatedMinor: number;
  exceptions: Array<
    | 'source_changed_after_import'
    | 'credit_relation_unresolved'
    | 'unallocated_amount'
    | 'rejected_document'
  >;
}

export interface ProjectEconomyStep8Exception {
  category: 'personnel' | 'invoice';
  identity: string;
  code:
    | 'missing_rate'
    | 'source_changed_after_import'
    | 'credit_relation_unresolved'
    | 'unallocated_amount'
    | 'rejected_document';
  amountMinor: number | null;
}

export interface ProjectEconomyStep8ShadowRead {
  schema: 'operations-project-economy-step8-shadow.v1';
  organizationId: string;
  projectId: string;
  generatedAt: string;
  authority: 'operations_received_evidence';
  personnel: ProjectEconomyStep8PersonnelRow[];
  invoices: ProjectEconomyStep8InvoiceRow[];
  exceptions: ProjectEconomyStep8Exception[];
  coverage: { personnel: Step8Coverage; invoices: Step8Coverage };
  financeRecalculated: false;
  authoritativeTotals: false;
  replacesLegacyTotals: false;
  shadowOnly: true;
}

export interface ProjectEconomyStep8ShadowAuthority {
  actorId: string;
  accessToken: string;
  organizationId: string;
  projectId: string;
}

export interface ProjectEconomyStep8ShadowClient {
  auth: {
    getSession(): PromiseLike<{
      data: { session: { access_token: string; user: { id: string } } | null };
      error: unknown;
    }>;
  };
  rpc(
    name: 'read_operations_project_economy_step8_shadow_v1',
    args: {
      p_request: {
        schemaVersion: 'operations-project-economy-step8-shadow-read.v1';
        organizationId: string;
        projectId: string;
      };
    },
  ): {
    setHeader(name: string, value: string): {
      abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hashPattern = /^[0-9a-f]{64}$/;
const currencyPattern = /^[A-Z]{3}$/;
const invalid = (): never => {
  throw new Error('Det parallella projektekonomiunderlaget kunde inte verifieras.');
};
const exactObject = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key))) return invalid();
  return row;
};
const uuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);
const hash = (value: unknown): value is string => typeof value === 'string' && hashPattern.test(value);
const safeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const nonnegative = (value: unknown): value is number => safeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

const personnelKeys = [
  'organizationId','projectId','sourceBookingId','sourceTimeStreamKey','reportId','lineId','revision',
  'timeSnapshotVersion','workDate','minutes','amountMinor','currency','status','coverage',
] as const;
const invoiceKeys = [
  'organizationId','projectId','sourceOrganizationId','invoiceId','allocationId','revision','sourceProtocol',
  'sourceEconomicRevision','sourceEconomicFingerprint','sourceObservationId',
  'publicationFingerprint','documentFingerprint','kind','amountMinor','currency','status','approvalState',
  'accountingState','settlementState','sourceChanged','creditRelationCoverage','creditRelationshipFingerprint',
  'sourceAnchor','creditedSourceAnchor','unallocatedMinor','exceptions',
] as const;
const exceptionKeys = ['category','identity','code','amountMinor'] as const;
const rootKeys = [
  'schema','organizationId','projectId','generatedAt','authority','personnel','invoices','exceptions','coverage',
  'financeRecalculated','authoritativeTotals','replacesLegacyTotals','shadowOnly',
] as const;
const invoiceExceptionCodes = new Set([
  'source_changed_after_import','credit_relation_unresolved','unallocated_amount','rejected_document',
]);
const allExceptionCodes = new Set(['missing_rate',...invoiceExceptionCodes]);

export function validateProjectEconomyStep8ShadowRead(
  value: unknown,
  authority: ProjectEconomyStep8ShadowAuthority,
): ProjectEconomyStep8ShadowRead {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 262144) return invalid();
  const root = exactObject(value, rootKeys);
  if (
    root.schema !== 'operations-project-economy-step8-shadow.v1' ||
    root.organizationId !== authority.organizationId || root.projectId !== authority.projectId ||
    !timestamp(root.generatedAt) || root.authority !== 'operations_received_evidence' ||
    root.financeRecalculated !== false || root.authoritativeTotals !== false ||
    root.replacesLegacyTotals !== false || root.shadowOnly !== true ||
    !Array.isArray(root.personnel) || !Array.isArray(root.invoices) || !Array.isArray(root.exceptions) ||
    root.personnel.length > 500 || root.invoices.length > 500 || root.exceptions.length > 1500
  ) return invalid();

  const personnelIdentities = new Set<string>();
  for (const candidate of root.personnel) {
    const row = exactObject(candidate, personnelKeys);
    if (
      row.organizationId !== authority.organizationId || row.projectId !== authority.projectId ||
      (row.sourceBookingId !== null && !uuid(row.sourceBookingId)) || !hash(row.sourceTimeStreamKey) ||
      !uuid(row.reportId) || typeof row.lineId !== 'string' || row.lineId.length < 1 || row.lineId.length > 256 ||
      !nonnegative(row.revision) || row.revision < 1 || !nonnegative(row.timeSnapshotVersion) || row.timeSnapshotVersion < 1 ||
      !date(row.workDate) || !nonnegative(row.minutes) || typeof row.currency !== 'string' || !currencyPattern.test(row.currency) ||
      !['preliminary','confirmed','rejected'].includes(String(row.status)) ||
      !['complete','missing_rate'].includes(String(row.coverage)) ||
      (row.coverage === 'missing_rate' ? row.amountMinor !== null : !nonnegative(row.amountMinor))
    ) return invalid();
    const identity = `${row.sourceTimeStreamKey}:${row.lineId}`;
    if (personnelIdentities.has(identity)) return invalid();
    personnelIdentities.add(identity);
  }

  const invoiceIdentities = new Set<string>();
  for (const candidate of root.invoices) {
    const row = exactObject(candidate, invoiceKeys);
    if (
      row.organizationId !== authority.organizationId || row.projectId !== authority.projectId ||
      !uuid(row.sourceOrganizationId) || !uuid(row.invoiceId) || !uuid(row.allocationId) ||
      !nonnegative(row.revision) || row.revision < 1 || !['v1','v2'].includes(String(row.sourceProtocol)) ||
      !nonnegative(row.sourceEconomicRevision) || row.sourceEconomicRevision < 1 ||
      !hash(row.sourceEconomicFingerprint) || !uuid(row.sourceObservationId) ||
      !hash(row.publicationFingerprint) || !hash(row.documentFingerprint) ||
      !['invoice','credit'].includes(String(row.kind)) || !safeInteger(row.amountMinor) ||
      (row.kind === 'invoice' ? row.amountMinor <= 0 : row.amountMinor >= 0) ||
      typeof row.currency !== 'string' || !currencyPattern.test(row.currency) ||
      !['preliminary','confirmed','rejected'].includes(String(row.status)) ||
      !['pending','not_pending'].includes(String(row.approvalState)) ||
      !['draft','booked','cancelled'].includes(String(row.accountingState)) ||
      !['unpaid','part_paid','paid','inconsistent'].includes(String(row.settlementState)) ||
      typeof row.sourceChanged !== 'boolean' ||
      !['not_applicable','unresolved','linked'].includes(String(row.creditRelationCoverage)) ||
      (row.creditRelationshipFingerprint !== null && !hash(row.creditRelationshipFingerprint)) ||
      (row.sourceAnchor !== null && !hash(row.sourceAnchor)) ||
      (row.creditedSourceAnchor !== null && !hash(row.creditedSourceAnchor)) ||
      (row.sourceProtocol === 'v2' && row.sourceAnchor === null) ||
      (row.kind === 'invoice' && (
        row.creditRelationCoverage !== 'not_applicable' || row.creditRelationshipFingerprint !== null ||
        row.creditedSourceAnchor !== null
      )) ||
      (row.kind === 'credit' && !['unresolved','linked'].includes(String(row.creditRelationCoverage))) ||
      (row.creditRelationCoverage === 'linked' && (
        row.creditRelationshipFingerprint === null || row.sourceAnchor === null ||
        row.creditedSourceAnchor === null || row.sourceAnchor === row.creditedSourceAnchor
      )) ||
      !safeInteger(row.unallocatedMinor) || !Array.isArray(row.exceptions) || row.exceptions.length > 4 ||
      row.exceptions.some((code) => typeof code !== 'string' || !invoiceExceptionCodes.has(code)) ||
      new Set(row.exceptions).size !== row.exceptions.length ||
      row.sourceChanged !== row.exceptions.includes('source_changed_after_import') ||
      (row.kind === 'credit' && row.creditRelationCoverage !== 'linked') !== row.exceptions.includes('credit_relation_unresolved') ||
      (row.unallocatedMinor !== 0) !== row.exceptions.includes('unallocated_amount') ||
      (row.status === 'rejected') !== row.exceptions.includes('rejected_document')
    ) return invalid();
    const identity = `${row.invoiceId}:${row.allocationId}`;
    if (invoiceIdentities.has(identity)) return invalid();
    invoiceIdentities.add(identity);
  }

  const globalExceptionIdentities = new Set<string>();
  for (const candidate of root.exceptions) {
    const row = exactObject(candidate, exceptionKeys);
    if (
      !['personnel','invoice'].includes(String(row.category)) || typeof row.identity !== 'string' ||
      row.identity.length < 3 || row.identity.length > 400 || typeof row.code !== 'string' ||
      !allExceptionCodes.has(row.code) || (row.amountMinor !== null && !safeInteger(row.amountMinor)) ||
      (row.category === 'personnel' && row.code !== 'missing_rate') ||
      (row.category === 'invoice' && !invoiceExceptionCodes.has(row.code)) ||
      (row.code !== 'unallocated_amount' && row.amountMinor !== null)
    ) return invalid();
    const identity = `${row.category}:${row.identity}:${row.code}`;
    if (globalExceptionIdentities.has(identity)) return invalid();
    globalExceptionIdentities.add(identity);
  }

  const coverage = exactObject(root.coverage, ['personnel','invoices']);
  if (
    !['complete','incomplete','unavailable'].includes(String(coverage.personnel)) ||
    !['complete','incomplete','unavailable'].includes(String(coverage.invoices)) ||
    (root.personnel.length === 0) !== (coverage.personnel === 'unavailable') ||
    (root.invoices.length === 0) !== (coverage.invoices === 'unavailable')
  ) return invalid();
  return value as ProjectEconomyStep8ShadowRead;
}

export async function readProjectEconomyStep8Shadow(
  client: ProjectEconomyStep8ShadowClient,
  authority: ProjectEconomyStep8ShadowAuthority,
  signal: AbortSignal,
): Promise<ProjectEconomyStep8ShadowRead> {
  if (!uuid(authority.actorId) || !uuid(authority.organizationId) || !uuid(authority.projectId) || !authority.accessToken)
    return invalid();
  const controller = new AbortController();
  const started = performance.now();
  const relay = () => controller.abort(signal.reason);
  signal.addEventListener('abort', relay, { once: true });
  if (signal.aborted) relay();
  const deadline = setTimeout(() => controller.abort(new Error('Tidsgränsen passerades.')), 15000);
  const stopped = new Promise<never>((_, reject) => {
    const fail = () => reject(new Error('Läsningen avbröts.'));
    controller.signal.addEventListener('abort', fail, { once: true });
    if (controller.signal.aborted) fail();
  });
  const fresh = () => {
    if (controller.signal.aborted || performance.now() - started >= 15000) throw new Error('Läsningen avbröts.');
  };
  const verifySession = async () => {
    const session = await Promise.race([Promise.resolve(client.auth.getSession()), stopped]);
    fresh();
    if (
      session.error || session.data.session?.access_token !== authority.accessToken ||
      session.data.session.user.id !== authority.actorId
    ) throw new Error('Sessionen har ändrats.');
  };
  try {
    await verifySession();
    const response = await Promise.race([
      Promise.resolve(client.rpc('read_operations_project_economy_step8_shadow_v1', {
        p_request: {
          schemaVersion: 'operations-project-economy-step8-shadow-read.v1',
          organizationId: authority.organizationId,
          projectId: authority.projectId,
        },
      }).setHeader('Authorization', `Bearer ${authority.accessToken}`).abortSignal(controller.signal)),
      stopped,
    ]);
    fresh();
    if (response.error) throw new Error('Det parallella projektekonomiunderlaget kunde inte hämtas.');
    await verifySession();
    const result = validateProjectEconomyStep8ShadowRead(response.data, authority);
    fresh();
    return result;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', relay);
  }
}
