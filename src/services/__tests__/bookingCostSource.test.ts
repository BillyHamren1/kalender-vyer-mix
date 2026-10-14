import { beforeEach, describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { updateBookingProductCosts, updateBookingExtraCosts, fetchBookingExtraCosts } from '../planningApiService';

describe('canonical Booking costs transport', () => {
  beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ data: { success: true }, error: null }); });
  it('writes only the edited fields with their expected values and exact Booking IDs', async () => {
    await updateBookingProductCosts('booking-a', 'product-a', { handling_cost: 0 }, { handling_cost: 45 });
    expect(invoke).toHaveBeenCalledExactlyOnceWith('planning-api-proxy', { body: {
      type: 'product_costs', method: 'PUT', booking_id: 'booking-a',
      data: { product_id: 'product-a', costs: { handling_cost: 0 }, expected: { handling_cost: 45 } },
    } });
  });
  it('preserves every manual field and a null initial CAS snapshot', async () => {
    const rows = [{ id: 'row-a', label: 'Transport', amount: 20, quantity: 2, unit_price: 15, discount: 10, assembly_cost: 5, handling_cost: 3, purchase_cost: 2 }];
    await updateBookingExtraCosts('booking-a', rows, null);
    expect(invoke.mock.calls[0][1].body.data).toEqual({ extra_costs: rows, expected_extra_costs: null });
  });
  it('does not report success after a concurrency conflict', async () => {
    invoke.mockResolvedValue({ data: { error: 'cost_conflict' }, error: null });
    await expect(updateBookingProductCosts('b', 'p', { purchase_cost: 8 }, { purchase_cost: 7 })).rejects.toThrow('cost_conflict');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('preserves null reads rather than fabricating an empty saved snapshot', async () => {
    invoke.mockResolvedValue({ data: { extra_costs: null }, error: null });
    expect(await fetchBookingExtraCosts('booking-a')).toEqual({ extra_costs: null });
  });
});

import { calculateEconomySummary } from '../projectEconomyService';
it('counts canonical product and manual estimates exactly once without changing actuals', () => {
  const costs = { products: [], summary: { revenue: 1000, costs: 100, margin: 900 }, extra_costs: [{ id: 'extra', label: 'Freight', amount: 25 }] };
  const summary = calculateEconomySummary(null, [], [], [], [], costs, []);
  expect(summary.productCostBudget).toBe(125);
  expect(summary.totalBudget).toBe(125);
  expect(summary.totalActual).toBe(0);
  expect(costs.summary.costs).toBe(100);
});
