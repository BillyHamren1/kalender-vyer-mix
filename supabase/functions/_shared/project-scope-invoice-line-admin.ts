/** Structural validation only. The authenticated SQL boundary owns authorization and source locks. */
export interface ScopeInvoiceLineAdminRequest {
  schema_version: 'operations-scope-invoice-line-admin-read.v1';
  root_kind: 'project' | 'large_project' | 'packing_project';
  root_id: string;
  expected_composition_snapshot_id: string;
}

export interface ScopeInvoiceLineAdminLine {
  source_organization_id: string;
  project_id: string;
  invoice_id: string;
  source_allocation_id: string;
  amount_minor: number;
  currency: string;
  source_economic_revision: number;
  source_status: 'preliminary' | 'confirmed';
  source_economic_fingerprint: string;
}

export interface ScopeInvoiceLineAdminEvidence {
  schema_version: 'operations-scope-invoice-line-admin-evidence.v1';
  authority_scope: 'canonical_scope_invoice_line_capture';
  organization_id: string;
  root_kind: ScopeInvoiceLineAdminRequest['root_kind'];
  root_id: string;
  composition_snapshot_id: string;
  scope_revision: number;
  source_currentness: 'saved_receiver_heads_only';
  captured_inventory_matches_current: boolean;
  as_of: string;
  availability: 'available' | 'partial' | 'unavailable';
  lines: ScopeInvoiceLineAdminLine[];
  unavailable_source_count: number;
  source_coverage: 'unavailable';
  credit_eligible: false;
}

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const sameId = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const calendar = new Date(0);
  calendar.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return calendar.getUTCFullYear() === Number(match[1]) &&
    calendar.getUTCMonth() === Number(match[2]) - 1 && calendar.getUTCDate() === Number(match[3]);
}
const fail = (): never => { throw new Error('invalid_scope_invoice_line_evidence'); };

export function validateScopeInvoiceLineAdminRequest(value: unknown): ScopeInvoiceLineAdminRequest {
  if (!exact(value, ['schema_version', 'root_kind', 'root_id', 'expected_composition_snapshot_id']) ||
    value.schema_version !== 'operations-scope-invoice-line-admin-read.v1' ||
    typeof value.root_kind !== 'string' || !['project', 'large_project', 'packing_project'].includes(value.root_kind) ||
    !uuid(value.root_id) || !uuid(value.expected_composition_snapshot_id)) return fail();
  return value as unknown as ScopeInvoiceLineAdminRequest;
}

const evidenceKeys = [
  'schema_version', 'authority_scope', 'organization_id', 'root_kind', 'root_id',
  'composition_snapshot_id', 'scope_revision', 'source_currentness',
  'captured_inventory_matches_current', 'as_of', 'availability', 'lines',
  'unavailable_source_count', 'source_coverage', 'credit_eligible',
];
const lineKeys = [
  'source_organization_id', 'project_id', 'invoice_id', 'source_allocation_id',
  'amount_minor', 'currency', 'source_economic_revision', 'source_status',
  'source_economic_fingerprint',
];

export function validateScopeInvoiceLineAdminEvidence(
  raw: unknown,
  organizationId: string,
  request: ScopeInvoiceLineAdminRequest,
): ScopeInvoiceLineAdminEvidence {
  const expected = validateScopeInvoiceLineAdminRequest(request);
  if (!uuid(organizationId) || !exact(raw, evidenceKeys) ||
    raw.schema_version !== 'operations-scope-invoice-line-admin-evidence.v1' ||
    raw.authority_scope !== 'canonical_scope_invoice_line_capture' ||
    !uuid(raw.organization_id) || !sameId(raw.organization_id, organizationId) ||
    raw.root_kind !== expected.root_kind || !uuid(raw.root_id) || !sameId(raw.root_id, expected.root_id) ||
    !uuid(raw.composition_snapshot_id) || !sameId(raw.composition_snapshot_id, expected.expected_composition_snapshot_id) ||
    !positive(raw.scope_revision) || raw.source_currentness !== 'saved_receiver_heads_only' ||
    typeof raw.captured_inventory_matches_current !== 'boolean' || !timestamp(raw.as_of) ||
    typeof raw.availability !== 'string' || !['available', 'partial', 'unavailable'].includes(raw.availability) ||
    !Array.isArray(raw.lines) || raw.lines.length > 10_000 || !count(raw.unavailable_source_count) ||
    raw.unavailable_source_count > 10_000 || raw.lines.length + raw.unavailable_source_count > 10_000 ||
    raw.source_coverage !== 'unavailable' || raw.credit_eligible !== false ||
    new TextEncoder().encode(JSON.stringify(raw)).length > 262_144) return fail();

  const seen = new Set<string>();
  let previous = '';
  for (const line of raw.lines) {
    if (!exact(line, lineKeys) ||
      !uuid(line.source_organization_id) || !uuid(line.project_id) || !uuid(line.invoice_id) ||
      !uuid(line.source_allocation_id) || !positive(line.amount_minor) ||
      typeof line.currency !== 'string' || !/^[A-Z]{3}$/.test(line.currency) ||
      !positive(line.source_economic_revision) ||
      typeof line.source_status !== 'string' || !['preliminary', 'confirmed'].includes(line.source_status) ||
      !hash(line.source_economic_fingerprint)) return fail();
    const key = [line.source_organization_id, line.invoice_id, line.source_allocation_id, line.project_id]
      .map(value => (value as string).toLowerCase()).join(':');
    if (seen.has(key) || key <= previous) return fail();
    previous = key;
    seen.add(key);
  }
  const expectedAvailability = raw.lines.length === 0 ? 'unavailable' :
    raw.unavailable_source_count === 0 && raw.captured_inventory_matches_current ? 'available' : 'partial';
  if (raw.availability !== expectedAvailability) return fail();
  return raw as unknown as ScopeInvoiceLineAdminEvidence;
}
