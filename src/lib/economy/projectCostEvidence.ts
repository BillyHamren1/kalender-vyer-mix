export type EvidenceStatus = 'preliminary' | 'confirmed' | 'rejected';
export interface PersonnelEvidenceRow {
  streamKey: string; reportId: string; lineId: string; revision: number; timeVersion: number;
  workDate: string; minutes: number; amountMinor: number | null; currency: string;
  status: EvidenceStatus; coverage: 'complete' | 'missing_rate'; publishedAt: string;
  financeDeliveryState: 'queued' | 'retry' | 'delivered' | 'superseded' | 'blocked' | null;
  financeCurrentRevision: number | null;
}
export interface InvoiceEvidenceRow {
  sourceOrganizationId: string; invoiceId: string; allocationId: string; revision: number;
  documentNumber: string; kind: 'invoice' | 'credit'; amountMinor: number; currency: string;
  status: EvidenceStatus; accountingState: 'draft' | 'booked' | 'cancelled';
  settlementState: 'unpaid' | 'part_paid' | 'paid' | 'inconsistent';
  providerApprovalState: 'pending' | 'not_pending'; providerSourceChanged: boolean;
  creditRelationCoverage: 'not_applicable' | 'unresolved'; receivedAt: string;
}
export interface ProjectCostEvidence {
  schema: 'operations-project-cost-evidence.v1'; organizationId: string; projectId: string;
  generatedAt: string; personnel: PersonnelEvidenceRow[]; invoices: InvoiceEvidenceRow[];
  missingPersonnelCostCount: number;
}
const invalid = (): never => { throw new Error('Projektets kostnadsunderlag kunde inte verifieras.'); };
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid();
  return v as Record<string, unknown>;
};
const exact = (x: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(x).length !== keys.length || keys.some(k => !(k in x))) invalid();
};
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown, min = 0) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const text = (v: unknown, max = 256) => typeof v === 'string' && v.length > 0 && v.length <= max;
const timestamp = (v: unknown) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const currency = (v: unknown) => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const status = (v: unknown) => typeof v === 'string' && ['preliminary', 'confirmed', 'rejected'].includes(v);
export function formatEvidenceMinorAmount(amount: number, currency: string): string {
  if (!Number.isSafeInteger(amount) || !/^[A-Z]{3}$/.test(currency)) return invalid();
  const minor = BigInt(amount), whole = minor / 100n;
  const cents = (minor < 0n ? -minor : minor) % 100n;
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .formatToParts(whole === 0n && minor < 0n ? -0 : whole)
    .map(part => part.type === 'fraction' ? cents.toString().padStart(2,'0') : part.value).join('');
}
export function validateProjectCostEvidence(value: unknown, organizationId: string, projectId: string): ProjectCostEvidence {
  const x = object(value);
  exact(x, ['schema','organizationId','projectId','generatedAt','personnel','invoices','missingPersonnelCostCount']);
  if (x.schema !== 'operations-project-cost-evidence.v1' || !uuid(organizationId) || !uuid(projectId)
    || x.organizationId !== organizationId || x.projectId !== projectId || !timestamp(x.generatedAt)
    || !Array.isArray(x.personnel) || !Array.isArray(x.invoices) || x.personnel.length > 2000 || x.invoices.length > 2000) invalid();
  const personnel = x.personnel as unknown[], invoices = x.invoices as unknown[];
  const personnelIds = new Set<string>(), invoiceIds = new Set<string>();
  let missing = 0;
  for (const value of personnel) {
    const r = object(value);
    exact(r, ['streamKey','reportId','lineId','revision','timeVersion','workDate','minutes','amountMinor','currency','status','coverage','publishedAt','financeDeliveryState','financeCurrentRevision']);
    if (typeof r.streamKey !== 'string' || !/^[0-9a-f]{64}$/.test(r.streamKey) || !uuid(r.reportId) || !text(r.lineId) || !integer(r.revision, 1) || !integer(r.timeVersion, 1)
      || !integer(r.minutes) || !currency(r.currency) || !status(r.status) || !timestamp(r.publishedAt)
      || typeof r.workDate !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(r.workDate)
      || !Number.isFinite(Date.parse(r.workDate+'T00:00:00Z'))
      || new Date(r.workDate+'T00:00:00Z').toISOString().slice(0,10) !== r.workDate) invalid();
    if (r.coverage === 'missing_rate') {
      if (r.amountMinor !== null) invalid();
      if (r.status !== 'rejected') missing++;
    } else if (r.coverage !== 'complete' || !integer(r.amountMinor)) invalid();
    if (r.financeDeliveryState !== null && (typeof r.financeDeliveryState !== 'string'
      || !['queued','retry','delivered','superseded','blocked'].includes(r.financeDeliveryState))) invalid();
    if (r.financeCurrentRevision !== null && !integer(r.financeCurrentRevision,1)) invalid();
    if (r.financeDeliveryState === null && r.financeCurrentRevision !== null) invalid();
    if (r.financeDeliveryState === 'delivered' || r.financeDeliveryState === 'superseded') {
      if (typeof r.financeCurrentRevision !== 'number' || typeof r.revision !== 'number'
        || r.financeCurrentRevision < r.revision || (r.financeDeliveryState === 'superseded' && r.financeCurrentRevision === r.revision)) invalid();
    }
    const id = JSON.stringify([r.streamKey,r.lineId]);
    if (personnelIds.has(id)) invalid();
    personnelIds.add(id);
  }
  for (const value of invoices) {
    const r = object(value);
    exact(r, ['sourceOrganizationId','invoiceId','allocationId','revision','documentNumber','kind','amountMinor','currency','status','accountingState','settlementState','providerApprovalState','providerSourceChanged','creditRelationCoverage','receivedAt']);
    if (!uuid(r.sourceOrganizationId) || !uuid(r.invoiceId) || !uuid(r.allocationId) || !integer(r.revision, 1)
      || !text(r.documentNumber) || !currency(r.currency) || !status(r.status) || !timestamp(r.receivedAt)
      || typeof r.amountMinor !== 'number' || !Number.isSafeInteger(r.amountMinor)
      || (r.kind !== 'invoice' && r.kind !== 'credit') || (r.kind === 'invoice' && r.amountMinor < 0) || (r.kind === 'credit' && r.amountMinor > 0)
      || typeof r.accountingState !== 'string' || !['draft','booked','cancelled'].includes(r.accountingState)
      || typeof r.settlementState !== 'string' || !['unpaid','part_paid','paid','inconsistent'].includes(r.settlementState)
      || typeof r.providerApprovalState !== 'string' || !['pending','not_pending'].includes(r.providerApprovalState)
      || typeof r.providerSourceChanged !== 'boolean'
      || typeof r.creditRelationCoverage !== 'string' || !['not_applicable','unresolved'].includes(r.creditRelationCoverage)
      || (r.kind === 'invoice' && r.creditRelationCoverage !== 'not_applicable')
      || (r.kind === 'credit' && r.creditRelationCoverage !== 'unresolved')
      || (r.status === 'confirmed' && r.providerSourceChanged)) invalid();
    const id = JSON.stringify([r.sourceOrganizationId,r.invoiceId,r.allocationId]);
    if (invoiceIds.has(id)) invalid();
    invoiceIds.add(id);
  }
  if (!integer(x.missingPersonnelCostCount) || x.missingPersonnelCostCount !== missing) invalid();
  // No rate multiplication or combination with legacy totals occurs in this reader.
  return structuredClone(value) as ProjectCostEvidence;
}
