import { describe, it, expect } from 'vitest';
import { assessCateringValuationCoverage as valuation, calculateCateringPersonnelEvidence as calculate,
  fingerprintCateringSource, reviseCateringProjectReview, type CateringTimeEntry,
  type CateringTimeReview, type CateringProjectBinding, type CateringValuationLine } from './catering-project-evidence.ts';
import type { HistoricalPersonnelRate } from './project-personnel-cost.ts';
import { calculateProjectCostObligation } from './project-cost-obligations.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry: CateringTimeEntry = { id: id(1), organization_id: id(2), person_id: id(3), workplace_id: id(4),
  started_at: '2026-09-30T08:00:00Z', ended_at: '2026-09-30T10:00:00Z', break_minutes: 15,
  status: 'pending', approved_by: null, approved_at: null, version: 1, source: 'manual',
  shift_id: null, employee_note: 'genuine source note' };
const binding: CateringProjectBinding = { catering_organization_id: id(2), catering_person_id: id(3),
  organization_id: id(5), worker_id: id(6), project_id: id(7), obligation_id: id(8),
  mapping_revision: 'mapping-v1', work_date: '2026-09-30', time_zone: 'Europe/Stockholm',
  currency: 'SEK', publication_revision: 1, project_review_status: 'preliminary' };
const rate: HistoricalPersonnelRate = { organization_id: id(5), worker_id: id(6), category: 'work',
  currency: 'SEK', rate_revision: 'historic-september', hourly_rate_minor: 30001,
  effective_from: '2026-09-01', effective_to: '2026-10-01' };
const approved = (): { entry: CateringTimeEntry; review: CateringTimeReview } => {
  const after = { ...entry, version: 2, status: 'approved' as const, approved_by: id(9), approved_at: '2026-10-01T09:00:00Z' };
  return { entry: after, review: { id: id(10), organization_id: id(2), time_entry_id: id(1),
    from_status: 'pending', to_status: 'approved', before_payload: entry, after_payload: after,
    reviewed_by: id(9), reviewed_at: '2026-10-01T09:00:00Z' } };
};
const line: CateringValuationLine = { organization_id: id(5), source_organization_id: id(2), source_id: id(11), source_version: '1', source_fingerprint: 'a'.repeat(64),
  project_id: id(7), obligation_id: id(8), currency: 'SEK', amount_minor: 1200,
  basis: 'purchase_estimate', movement_id: null, valuation_document_id: null };
describe('native Catering read-only project evidence', () => {
  it('isolated native entry → Operations obligation leaves missing ingredient and purchase coverage explicit', async () => {
    const time = await calculate(entry, null, binding, [rate]);
    const scope = { organization_id: binding.organization_id, project_id: binding.project_id,
      obligation_id: binding.obligation_id, currency: binding.currency };
    const forecast = calculateProjectCostObligation({ ...scope, cost_basis: 'time',
      estimate_minor: 50000, committed_minor: 50000, relation_coverage: 'complete', sources: [{
        ...scope, source_id: time.source_time_entry_id, kind: 'time', status: time.project_review_status,
        amount_minor: time.amount_minor, replaces_estimate_minor: 50000, consumes_commitment_minor: 50000,
        credited_source_id: null, relation_coverage: 'complete',
      }] });
    expect(forecast).toMatchObject({ known_cost_minor: 52502, eac_minor: 52502, remaining_minor: 0 });
    const purchase = valuation([line, { ...line, source_id: id(12), amount_minor: null }], binding, 'purchase_estimate');
    const ingredient = valuation([{ ...line, basis: 'ingredient_estimate', amount_minor: null }], binding, 'ingredient_estimate');
    expect(purchase).toMatchObject({ known_subtotal_minor: 1200, total_minor: null });
    expect(ingredient.total_minor).toBeNull();
    // No project grand total is fabricated by adding incomplete groups to time.
    const confirmed = reviseCateringProjectReview(time, 2, 'confirmed');
    expect(confirmed.source_time_entry_id).toBe(time.source_time_entry_id);
    expect(confirmed.amount_minor).toBe(time.amount_minor);
  });
  it('costs actual native identity with the shared historical rate and exact rounding', async () => {
    const result = await calculate(entry, null, binding, [rate]);
    expect(result).toMatchObject({ source_time_entry_id: entry.id, source_time_entry_version: 1,
      minutes: 105, amount_minor: 52502, rate_revision: 'historic-september', source_review_id: null });
    expect(Object.keys(result).some(k => k.includes('submission'))).toBe(false);
  });
  it('keeps approved source separate from Operations project review and preserves saved amount on confirmation', async () => {
    const source = approved();
    const result = await calculate(source.entry, source.review, binding, [rate]);
    expect(result.source_status).toBe('approved'); expect(result.project_review_status).toBe('preliminary');
    const confirmed = reviseCateringProjectReview(result, 2, 'confirmed');
    expect(confirmed).toEqual({ ...result, publication_revision: 2, project_review_status: 'confirmed' });
  });
  it('requires immutable approval evidence instead of trusting approved status', async () => {
    await expect(calculate(approved().entry, null, binding, [rate])).rejects.toThrow('native_approval_evidence_missing');
  });
  it('fails mismatched review payload and review version', async () => {
    const s = approved();
    await expect(calculate(s.entry, { ...s.review, after_payload: { ...s.entry, break_minutes: 1 } }, binding, [rate])).rejects.toThrow('native_review_mismatch');
    await expect(calculate(s.entry, { ...s.review, before_payload: { ...entry, version: 2 } }, binding, [rate])).rejects.toThrow('native_review_mismatch');
  });
  it('binds exact source personnel and Operations project explicitly', async () => {
    await expect(calculate(entry, null, { ...binding, catering_person_id: id(44) }, [rate])).rejects.toThrow('native_source_identity_mismatch');
    await expect(calculate(entry, null, { ...binding, project_id: '' }, [rate])).rejects.toThrow('invalid_catering_binding');
  });
  it('rejects foreign and ambiguous rates without current-rate fallback', async () => {
    await expect(calculate(entry, null, binding, [rate, { ...rate, rate_revision: 'other' }])).rejects.toThrow('ambiguous_historical_rate');
    await expect(calculate(entry, null, binding, [{ ...rate, worker_id: id(99) }])).rejects.toThrow('invalid_historical_rate');
  });
  it('makes absent and exclusive-ended rates unavailable rather than zero', async () => {
    const r = await calculate(entry, null, binding, [{ ...rate, effective_to: '2026-09-30' }]);
    expect(r).toMatchObject({ coverage: 'missing_rate', amount_minor: null, hourly_rate_minor: null });
  });
  it('refuses silently rounded seconds, overnight dates and excessive breaks', async () => {
    await expect(calculate({ ...entry, ended_at: '2026-09-30T10:00:30Z' }, null, binding, [rate])).rejects.toThrow('unsupported_native_interval');
    await expect(calculate({ ...entry, ended_at: '2026-10-01T08:00:00Z' }, null, binding, [rate])).rejects.toThrow('native_work_date_mismatch');
    await expect(calculate({ ...entry, break_minutes: 121 }, null, binding, [rate])).rejects.toThrow('unsupported_native_interval');
  });
  it('fingerprints all raw source fields with deterministic key ordering', async () => {
    expect(await fingerprintCateringSource({ b: 2, a: 1 })).toBe(await fingerprintCateringSource({ a: 1, b: 2 }));
    expect(await fingerprintCateringSource(entry)).not.toBe(await fingerprintCateringSource({ ...entry, employee_note: 'changed' }));
  });
  it('confirms persisted pending native time independently from payroll but never charges rejected source', async () => {
    const saved = await calculate(entry, null, binding, [rate]);
    expect(reviseCateringProjectReview(saved, 2, 'confirmed')).toMatchObject({ source_status: 'pending', project_review_status: 'confirmed', amount_minor: 52502 });
    expect(await calculate(entry, null, { ...binding, project_review_status: 'confirmed' }, [rate])).toMatchObject({ source_status: 'pending', project_review_status: 'confirmed' });
    await expect(calculate({ ...entry, status: 'rejected' }, null, binding, [rate])).rejects.toThrow('native_rejected_cost');
  });
  it('mixed priced and unpriced purchase groups expose only known subtotal', () => {
    expect(valuation([line, { ...line, source_id: id(12), amount_minor: null }], binding, 'purchase_estimate'))
      .toMatchObject({ known_subtotal_minor: 1200, total_minor: null, coverage: 'unavailable' });
  });
  it('ingredient missing coverage is independent of complete purchases', () => {
    expect(valuation([line], binding, 'purchase_estimate').total_minor).toBe(1200);
    expect(valuation([{ ...line, basis: 'ingredient_estimate', amount_minor: null }], binding, 'ingredient_estimate').total_minor).toBeNull();
  });
  it('unallocated or unvalued stock does not become project actual cost', () => {
    expect(valuation([{ ...line, basis: 'stock_consumption' }], binding, 'stock_consumption'))
      .toMatchObject({ known_subtotal_minor: 0, total_minor: null });
    expect(valuation([{ ...line, project_id: null }], binding, 'purchase_estimate').total_minor).toBeNull();
  });
  it('requires exact historic movement valuation and never relabels an estimate as stock', () => {
    expect(valuation([{ ...line, basis: 'stock_consumption', movement_id: id(20), valuation_document_id: id(21) }], binding, 'stock_consumption').total_minor).toBe(1200);
    expect(() => valuation([{ ...line, movement_id: id(20) }], binding, 'purchase_estimate')).toThrow('estimate_is_not_stock_actual');
  });
  it('rejects foreign project, duplicated lines and currency mixing', () => {
    expect(() => valuation([{ ...line, project_id: id(99) }], binding, 'purchase_estimate')).toThrow('foreign_valuation_binding');
    expect(() => valuation([{ ...line, source_organization_id: id(99) }], binding, 'purchase_estimate')).toThrow('foreign_valuation_binding');
    expect(() => valuation([{ ...line, organization_id: id(99) }], binding, 'purchase_estimate')).toThrow('foreign_valuation_binding');
    expect(() => valuation([line, line], binding, 'purchase_estimate')).toThrow('invalid_valuation_line');
    expect(() => valuation([{ ...line, currency: 'EUR' }], binding, 'purchase_estimate')).toThrow('invalid_valuation_line');
  });
  it('rejects array/object coercion for runtime currency, fingerprint and version inputs', async () => {
    const wrongCurrency = ['SEK'] as unknown as string;
    await expect(calculate(entry, null, { ...binding, currency: wrongCurrency }, [rate])).rejects.toThrow('invalid_catering_binding');
    expect(() => valuation([{ ...line, currency: wrongCurrency }], { ...binding, currency: wrongCurrency }, 'purchase_estimate')).toThrow('invalid_valuation_binding');
    expect(() => valuation([{ ...line, source_fingerprint: ['a'.repeat(64)] as unknown as string }], binding, 'purchase_estimate')).toThrow('invalid_valuation_line');
    for (const version of [1, {}, ['1']])
      expect(() => valuation([{ ...line, source_version: version as unknown as string }], binding, 'purchase_estimate')).toThrow('invalid_valuation_line');
  });
  it('absence is explicit unavailable, while a genuinely priced zero is complete', () => {
    expect(valuation([], binding, 'purchase_estimate').total_minor).toBeNull();
    expect(valuation([{ ...line, amount_minor: 0 }], binding, 'purchase_estimate').total_minor).toBe(0);
  });
});
