/** Native Catering read-only adapter. Authorization and exact identity mappings
 * must be resolved by a server before calling this pure contract. No fabricated
 * Time reports, supplier writes, rates in Catering or production totals. */
import {
  calculatePersonnelAmountMinor,
  resolveHistoricalPersonnelRate,
  type HistoricalPersonnelRate,
} from './project-personnel-cost.ts';

export interface CateringTimeEntry {
  id: string;
  organization_id: string;
  person_id: string;
  workplace_id: string;
  started_at: string;
  ended_at: string;
  break_minutes: number;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  version: number;
  source: 'ledger' | 'manual';
  [key: string]: unknown;
}
export interface CateringTimeReview {
  id: string;
  organization_id: string;
  time_entry_id: string;
  from_status: 'pending' | 'approved' | 'rejected';
  to_status: 'pending' | 'approved' | 'rejected';
  before_payload: CateringTimeEntry;
  after_payload: CateringTimeEntry;
  reviewed_by: string;
  reviewed_at: string;
}
export interface CateringProjectBinding {
  catering_organization_id: string;
  catering_person_id: string;
  organization_id: string;
  worker_id: string;
  project_id: string;
  obligation_id: string;
  mapping_revision: string;
  work_date: string;
  /** Explicit server configuration; never inferred from the browser. */
  time_zone: string;
  currency: string;
  publication_revision: number;
  project_review_status: 'preliminary' | 'confirmed' | 'rejected';
}
export interface CateringPersonnelEvidence {
  schema_version: 'operations-catering-personnel-v1';
  calculation_version: 'operations-personnel-cost.v1.half-up';
  organization_id: string;
  worker_id: string;
  project_id: string;
  obligation_id: string;
  currency: string;
  work_date: string;
  time_zone: string;
  mapping_revision: string;
  source_organization_id: string;
  source_person_id: string;
  source_time_entry_id: string;
  source_time_entry_version: number;
  source_fingerprint: string;
  source_review_id: string | null;
  source_review_fingerprint: string | null;
  source_status: CateringTimeEntry['status'];
  publication_revision: number;
  project_review_status: CateringProjectBinding['project_review_status'];
  minutes: number;
  rate_revision: string | null;
  hourly_rate_minor: number | null;
  amount_minor: number | null;
  coverage: 'complete' | 'missing_rate';
}
const fail = (code: string): never => { throw new Error(code); };
const uuid = (v: unknown): v is string => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown, min = 0): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const iso = (v: unknown): v is string => typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)]));
  if (v === undefined || typeof v === 'function' || typeof v === 'bigint' ||
      (typeof v === 'number' && !Number.isFinite(v))) fail('non_json_source');
  return v;
};
const serialized = (v: unknown) => JSON.stringify(canonical(v));
/** Fingerprint preserves all genuine source fields, including notes and IDs. */
export async function fingerprintCateringSource(v: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized(v)));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
const localDate = (at: number, zone: string): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(at));
    const part = (name: string) => parts.find((p) => p.type === name)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return fail('invalid_time_zone'); }
};
export async function calculateCateringPersonnelEvidence(
  entry: CateringTimeEntry,
  review: CateringTimeReview | null,
  binding: CateringProjectBinding,
  rates: readonly HistoricalPersonnelRate[],
): Promise<CateringPersonnelEvidence> {
  if (!entry || ![entry.id, entry.organization_id, entry.person_id, entry.workplace_id].every(uuid) ||
      !integer(entry.version, 1) || !integer(entry.break_minutes) ||
      !iso(entry.started_at) || !iso(entry.ended_at) ||
      !['pending', 'approved', 'rejected'].includes(entry.status) ||
      !['manual', 'ledger'].includes(entry.source)) fail('invalid_native_time_entry');
  if (![binding.catering_organization_id, binding.catering_person_id,
    binding.organization_id, binding.worker_id, binding.project_id, binding.obligation_id].every(uuid) ||
    typeof binding.currency !== 'string' || !/^[A-Z]{3}$/.test(binding.currency) || !integer(binding.publication_revision, 1) ||
    typeof binding.mapping_revision !== 'string' || !binding.mapping_revision.trim() ||
    binding.mapping_revision.length > 200 || !['preliminary', 'confirmed', 'rejected'].includes(binding.project_review_status)) {
    fail('invalid_catering_binding');
  }
  if (entry.organization_id !== binding.catering_organization_id ||
      entry.person_id !== binding.catering_person_id) fail('native_source_identity_mismatch');
  const start = Date.parse(entry.started_at), end = Date.parse(entry.ended_at);
  // This first adapter deliberately refuses overnight and sub-minute entries.
  // No unstated date allocation or payroll rounding policy may enter Finance.
  if (end <= start || (end - start) % 60000 !== 0 ||
      entry.break_minutes > (end - start) / 60000) fail('unsupported_native_interval');
  if (typeof binding.time_zone !== 'string' || !binding.time_zone || typeof binding.work_date !== 'string' || localDate(start, binding.time_zone) !== binding.work_date ||
      localDate(end - 1, binding.time_zone) !== binding.work_date) fail('native_work_date_mismatch');
  if (review) {
    if (![review.id, review.reviewed_by].every(uuid) || !iso(review.reviewed_at) ||
        review.organization_id !== entry.organization_id || review.time_entry_id !== entry.id ||
        review.to_status !== entry.status || !['pending', 'approved', 'rejected'].includes(review.from_status) ||
        review.before_payload.id !== entry.id || review.before_payload.organization_id !== entry.organization_id ||
        review.before_payload.version + 1 !== entry.version ||
        review.before_payload.status !== review.from_status ||
        serialized(review.after_payload) !== serialized(entry)) fail('native_review_mismatch');
  }
  if (entry.status === 'approved') {
    if (!review || review.to_status !== 'approved' || entry.approved_by !== review.reviewed_by ||
        !iso(entry.approved_at)) fail('native_approval_evidence_missing');
  } else if (entry.approved_by !== null || entry.approved_at !== null) fail('native_approval_state_mismatch');
  if (entry.status === 'rejected' && binding.project_review_status !== 'rejected') fail('native_rejected_cost');
  const rate = resolveHistoricalPersonnelRate(rates, {
    organization_id: binding.organization_id, worker_id: binding.worker_id,
    category: 'work', currency: binding.currency, work_date: binding.work_date,
  });
  const minutes = (end - start) / 60000 - entry.break_minutes;
  return {
    schema_version: 'operations-catering-personnel-v1',
    calculation_version: 'operations-personnel-cost.v1.half-up',
    organization_id: binding.organization_id, worker_id: binding.worker_id,
    project_id: binding.project_id, obligation_id: binding.obligation_id,
    currency: binding.currency, work_date: binding.work_date, time_zone: binding.time_zone,
    mapping_revision: binding.mapping_revision,
    source_organization_id: entry.organization_id, source_person_id: entry.person_id,
    source_time_entry_id: entry.id, source_time_entry_version: entry.version,
    source_fingerprint: await fingerprintCateringSource(entry),
    source_review_id: review?.id ?? null,
    source_review_fingerprint: review ? await fingerprintCateringSource(review) : null,
    source_status: entry.status, publication_revision: binding.publication_revision,
    project_review_status: binding.project_review_status, minutes,
    rate_revision: rate?.rate_revision ?? null, hourly_rate_minor: rate?.hourly_rate_minor ?? null,
    amount_minor: rate ? calculatePersonnelAmountMinor(minutes, rate.hourly_rate_minor) : null,
    coverage: rate ? 'complete' : 'missing_rate',
  };
}
/** Attest republishes saved monetary evidence. Never look up a newer rate. */
export function reviseCateringProjectReview(
  saved: CateringPersonnelEvidence, revision: number,
  status: CateringProjectBinding['project_review_status'],
): CateringPersonnelEvidence {
  if (!integer(revision, 1) || revision <= saved.publication_revision) fail('stale_publication_revision');
  if (!['preliminary', 'confirmed', 'rejected'].includes(status) ||
      (saved.source_status === 'rejected' && status !== 'rejected')) fail('invalid_project_review');
  return { ...saved, publication_revision: revision, project_review_status: status };
}
export interface CateringValuationLine {
  organization_id: string;
  source_organization_id: string;
  source_id: string;
  source_version: string;
  source_fingerprint: string;
  currency: string;
  project_id: string | null;
  obligation_id: string | null;
  amount_minor: number | null;
  basis: 'ingredient_estimate' | 'purchase_estimate' | 'stock_consumption';
  /** Actual stock valuation requires explicit movement AND historic valuation. */
  movement_id: string | null;
  valuation_document_id: string | null;
}
export interface CateringValuationCoverage {
  basis: CateringValuationLine['basis'];
  known_subtotal_minor: number;
  total_minor: number | null;
  coverage: 'complete' | 'unavailable';
  issues: string[];
  source_ids: string[];
}
/** Coverage only: supplied source valuations, no duplicate ingredient engine.
 * Keep theoretical ingredients, purchasing estimates and stock actuals separate. */
export function assessCateringValuationCoverage(
  lines: readonly CateringValuationLine[],
  binding: { organization_id: string; catering_organization_id: string; project_id: string; obligation_id: string; currency: string },
  basis: CateringValuationLine['basis'],
): CateringValuationCoverage {
  if (![binding.organization_id, binding.catering_organization_id, binding.project_id, binding.obligation_id].every(uuid) || typeof binding.currency !== 'string' || !/^[A-Z]{3}$/.test(binding.currency) ||
      !['ingredient_estimate', 'purchase_estimate', 'stock_consumption'].includes(basis)) fail('invalid_valuation_binding');
  const issues: string[] = [], ids = new Set<string>();
  let known = 0n;
  if (lines.length === 0) issues.push('source_coverage_unavailable');
  for (const line of lines) {
    if (!uuid(line.organization_id) || !uuid(line.source_organization_id) || !uuid(line.source_id) || ids.has(line.source_id) || typeof line.source_version !== 'string' || !line.source_version.trim() || line.source_version.length > 200 ||
        typeof line.source_fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(line.source_fingerprint) || typeof line.currency !== 'string' || line.currency !== binding.currency || line.basis !== basis ||
        (line.amount_minor !== null && !integer(line.amount_minor)) ||
        (line.project_id !== null && !uuid(line.project_id)) ||
        (line.obligation_id !== null && !uuid(line.obligation_id))) fail('invalid_valuation_line');
    ids.add(line.source_id);
    if (line.organization_id !== binding.organization_id || line.source_organization_id !== binding.catering_organization_id || (line.project_id !== null && line.project_id !== binding.project_id) ||
        (line.obligation_id !== null && line.obligation_id !== binding.obligation_id)) fail('foreign_valuation_binding');
    if (!line.project_id || !line.obligation_id) { issues.push(`missing_binding:${line.source_id}`); continue; }
    if (basis === 'stock_consumption' && (!uuid(line.movement_id) || !uuid(line.valuation_document_id))) {
      issues.push(`missing_actual_valuation:${line.source_id}`); continue;
    }
    if (basis !== 'stock_consumption' && (line.movement_id !== null || line.valuation_document_id !== null)) fail('estimate_is_not_stock_actual');
    if (line.amount_minor === null) issues.push(`missing_price:${line.source_id}`);
    else known += BigInt(line.amount_minor);
  }
  if (known > BigInt(Number.MAX_SAFE_INTEGER)) fail('valuation_overflow');
  return { basis, known_subtotal_minor: Number(known), total_minor: issues.length ? null : Number(known),
    coverage: issues.length ? 'unavailable' : 'complete', issues, source_ids: [...ids].sort() };
}
