import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { applyEconomyChanges, knownEconomyBookingIds } from './cacheUpdates';
import { assertCompleteEconomy, economyBookingKey } from './cacheContract';
import { summarizeEconomyBatches } from './batchSummary';

const batch = (amount: number) => ({ budget: null, time_reports: [], purchases: [{ id: 'purchase', amount }], quotes: [], invoices: [], supplier_invoices: [],
  product_costs: { products: [], summary: { costs: 100, revenue: 1000 } } });
const row = (id: string, ids: string[], batches: Record<string, ReturnType<typeof batch>>) => ({ id, name: id, status: 'planning', booking_id: ids[0], booking_ids: ids,
  eventdate: null, rigdaydate: null, rigdowndate: null, bookingCreatedAt: null, projectSize: 'medium' as const, navigateTo: id, revenueAvailable: true,
  economyBatches: batches, ...summarizeEconomyBatches(ids.map(id => batches[id])) });

describe('scoped incremental economy projections', () => {
  it.each([35, 0])('updates corrected/deleted purchase to %s without historical refetch or unrelated changes', amount => {
    const client = new QueryClient();
    const untouched = row('other', ['b'], { b: batch(20) });
    const foreign = [row('foreign', ['a'], { a: batch(999) })];
    client.setQueryData(['economy-overview', 'org-a'], [row('single', ['a'], { a: batch(10) }), row('large', ['a','b'], { a: batch(10), b: batch(20) }), untouched]);
    client.setQueryData(['economy-overview', 'org-b'], foreign);
    client.setQueryData(['large-project-booking-economy', 'org-a', 'lp', ['a','b']], { a: batch(10), b: batch(20) });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    applyEconomyChanges(client, 'org-a', { a: batch(amount) });
    const result = client.getQueryData<ReturnType<typeof row>[]>(['economy-overview', 'org-a']);
    expect(result?.[0].summary.purchasesTotal).toBe(amount);
    expect(result?.[1].summary.purchasesTotal).toBe(amount + 20);
    expect(result?.[2]).toBe(untouched);
    expect(client.getQueryData(['economy-overview', 'org-b'])).toBe(foreign);
    expect(client.getQueryData(economyBookingKey('org-a','a'))).toEqual(batch(amount));
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('preserves old amounts but explicitly marks failed affected rows unavailable', () => {
    const client = new QueryClient();
    client.setQueryData(['economy-overview','org-a'], [row('single',['a'],{ a: batch(125) })]);
    applyEconomyChanges(client,'org-a',{},['a']);
    const result = client.getQueryData<Array<ReturnType<typeof row> & { economyError?: string }>>(['economy-overview','org-a']);
    expect(result?.[0].summary.purchasesTotal).toBe(125);
    expect(result?.[0].revenueAvailable).toBe(false);
    expect(result?.[0].economyError).toBeTruthy();
  });
  it('rejects partial batches before changing any amounts', () => {
    expect(() => assertCompleteEconomy({ ...batch(5), _errors: { invoices: { code: 'failed' } } })).toThrow();
    expect(() => assertCompleteEconomy({ ...batch(5), invoices: null })).toThrow();
  });
  it('registers booking interests only within the authorized tenant', () => {
    const client = new QueryClient();
    client.setQueryData(economyBookingKey('org-a','a'), batch(1));
    client.setQueryData(economyBookingKey('org-b','secret'), batch(1));
    expect([...knownEconomyBookingIds(client,'org-a')]).toEqual(['a']);
  });
});