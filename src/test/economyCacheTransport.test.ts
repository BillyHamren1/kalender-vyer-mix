import { beforeEach, describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { fetchAllEconomyData, fetchAllEconomyDataMulti, fetchSupplierInvoices } from '@/services/planningApiService';
const batch = { budget: null, time_reports: [], purchases: [], quotes: [], invoices: [], supplier_invoices: [], product_costs: {} };
describe('authoritative cache transport', () => {
  beforeEach(() => invoke.mockReset());
  it('uses exactly the same cache endpoint for detail and aggregate', async () => {
    invoke.mockResolvedValue({ data: { a: batch }, error: null });
    expect(await fetchAllEconomyData('a')).toEqual(batch);
    expect(invoke).toHaveBeenCalledWith('planning-api-proxy', { body: { type: 'multi_batch', booking_ids: ['a'] } });
  });
  it('chunks all 501 affected bookings without silently dropping any', async () => {
    for (const [start, end] of [[0,200],[200,400],[400,501]]) {
      invoke.mockResolvedValueOnce({ data: Object.fromEntries(Array.from({length:end-start},(_,i) => [`b-${start+i}`,batch])), error: null });
    }
    const result = await fetchAllEconomyDataMulti(Array.from({length:501},(_,i) => `b-${i}`));
    expect(Object.keys(result)).toHaveLength(501);
    expect(invoke.mock.calls.map(c => c[1].body.booking_ids.length)).toEqual([200,200,101]);
  });
  it('propagates missing, incomplete and supplier invoice errors instead of empty amounts', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(fetchAllEconomyData('a')).rejects.toThrow();
    invoke.mockResolvedValue({ data: { a: { ...batch, _errors: { budget: {code:'failed'} } } }, error: null });
    await expect(fetchAllEconomyData('a')).rejects.toThrow();
    invoke.mockResolvedValue({ data: null, error: new Error('unavailable') });
    await expect(fetchSupplierInvoices('a')).rejects.toThrow('unavailable');
  });
});