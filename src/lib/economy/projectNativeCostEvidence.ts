import { validateProjectCostEvidence, type ProjectCostEvidence, type EvidenceStatus } from './projectCostEvidence';

export interface NativeCateringEvidenceRow {
 streamKey: string; obligationId: string; revision: number; sourceEntryVersion: number;
 workDate: string; minutes: number; amountMinor: number | null; currency: string;
 status: EvidenceStatus; coverage: 'complete' | 'missing_rate';
 sourceStatus: 'pending' | 'approved' | 'rejected'; publishedAt: string;
}
export interface ProjectNativeCostEvidence extends Omit<ProjectCostEvidence, 'schema'> {
 schema: 'operations-project-cost-evidence.v2'; catering: NativeCateringEvidenceRow[]; missingCateringCostCount: number;
}
const invalid = (): never => { throw new Error('Projektets Cateringunderlag kunde inte verifieras.'); };
const integer = (v: unknown, min = 0) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const stamp = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
 && Number.isFinite(Date.parse(v)) && new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10) === v.slice(0,10);
export function validateProjectNativeCostEvidence(value: unknown, organizationId: string, projectId: string): ProjectNativeCostEvidence {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
 const x = value as Record<string, unknown>;
 const keys = ['schema','organizationId','projectId','generatedAt','personnel','invoices','missingPersonnelCostCount','catering','missingCateringCostCount'];
 if (Object.keys(x).length !== keys.length || keys.some(k => !Object.hasOwn(x,k))
  || x.schema !== 'operations-project-cost-evidence.v2' || !stamp(x.generatedAt) || !Array.isArray(x.catering) || x.catering.length > 2000) return invalid();
 const { catering, missingCateringCostCount, ...base } = x;
 validateProjectCostEvidence({ ...base, schema: 'operations-project-cost-evidence.v1' }, organizationId, projectId);
 const rowKeys = ['streamKey','obligationId','revision','sourceEntryVersion','workDate','minutes','amountMinor','currency','status','coverage','sourceStatus','publishedAt'];
 let missing = 0; const seen = new Set<string>();
 for (const value of catering) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== rowKeys.length || rowKeys.some(k => !Object.hasOwn(r,k))
   || typeof r.streamKey !== 'string' || !/^[0-9a-f]{64}$/.test(r.streamKey)
   || typeof r.obligationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.obligationId)
   || !integer(r.revision,1) || !integer(r.sourceEntryVersion,1) || !integer(r.minutes)
   || typeof r.currency !== 'string' || !/^[A-Z]{3}$/.test(r.currency)
   || typeof r.status !== 'string' || !['preliminary','confirmed','rejected'].includes(r.status)
   || typeof r.sourceStatus !== 'string' || !['pending','approved','rejected'].includes(r.sourceStatus)
   || (r.sourceStatus === 'rejected' && r.status !== 'rejected') || !stamp(r.publishedAt)
   || typeof r.workDate !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(r.workDate)
   || !Number.isFinite(Date.parse(r.workDate+'T00:00:00Z'))
   || new Date(r.workDate+'T00:00:00Z').toISOString().slice(0,10) !== r.workDate) return invalid();
  if (r.coverage === 'missing_rate') { if (r.amountMinor !== null) return invalid(); if (r.status !== 'rejected') missing++; }
  else if (r.coverage !== 'complete' || !integer(r.amountMinor)) return invalid();
  if (seen.has(r.streamKey)) return invalid(); seen.add(r.streamKey);
 }
 if (!integer(missingCateringCostCount) || missingCateringCostCount !== missing) return invalid();
 return structuredClone(value) as ProjectNativeCostEvidence;
}
