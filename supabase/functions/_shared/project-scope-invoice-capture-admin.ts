/** Strict copied evidence; hashes and client identity checks never grant access. */
import {
  validateScopeInvoiceKernelEvidence,
  type ScopeInvoiceKernelEvidence,
} from './project-scope-invoice-kernel-evidence.ts';

export interface ScopeInvoiceCaptureAdminRequest {
  schema_version: 'operations-scope-invoice-capture-admin-read.v1';
  root_kind: 'project' | 'large_project' | 'packing_project';
  root_id: string;
  expected_composition_snapshot_id: string;
}
export interface ScopeInvoiceCaptureAdminEvidence {
  schema_version: 'operations-scope-invoice-capture-admin-evidence.v1';
  authority_scope: 'canonical_scope_invoice_capture';
  evidence: ScopeInvoiceKernelEvidence;
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fail = (): never => { throw new Error('invalid_scope_invoice_admin_evidence'); };

export function validateScopeInvoiceCaptureAdminRequest(value: unknown): ScopeInvoiceCaptureAdminRequest {
  if (!exact(value, ['schema_version', 'root_kind', 'root_id', 'expected_composition_snapshot_id']) ||
    value.schema_version !== 'operations-scope-invoice-capture-admin-read.v1' ||
    typeof value.root_kind !== 'string' || !['project', 'large_project', 'packing_project'].includes(value.root_kind) ||
    !uuid(value.root_id) || !uuid(value.expected_composition_snapshot_id)) return fail();
  return value as unknown as ScopeInvoiceCaptureAdminRequest;
}

export async function validateScopeInvoiceCaptureAdminEvidence(
  value: unknown,
  organizationId: string,
  request: ScopeInvoiceCaptureAdminRequest,
): Promise<ScopeInvoiceCaptureAdminEvidence> {
  const expected = validateScopeInvoiceCaptureAdminRequest(request);
  if (!uuid(organizationId) ||
    !exact(value, ['schema_version', 'authority_scope', 'evidence']) ||
    value.schema_version !== 'operations-scope-invoice-capture-admin-evidence.v1' ||
    value.authority_scope !== 'canonical_scope_invoice_capture' ||
    new TextEncoder().encode(JSON.stringify(value)).length > 262144) return fail();
  const evidence = await validateScopeInvoiceKernelEvidence(value.evidence);
  if (evidence.organization_id.toLowerCase() !== organizationId.toLowerCase() ||
    evidence.root_kind !== expected.root_kind ||
    evidence.root_id.toLowerCase() !== expected.root_id.toLowerCase() ||
    evidence.composition_snapshot_id.toLowerCase() !== expected.expected_composition_snapshot_id.toLowerCase()) return fail();
  return value as unknown as ScopeInvoiceCaptureAdminEvidence;
}
