import { describe, expect, it, vi } from 'vitest';
import {
  BOOKING_PRODUCT_PAGE_SIZE,
  aggregateBookingProductEconomy,
  fetchAllBookingProductEconomyRows,
  mergeBookingProductEconomyFallback,
  type BookingProductEconomyRow,
} from './bookingProductEconomyFallback';

const row = (overrides: Partial<BookingProductEconomyRow> = {}): BookingProductEconomyRow => ({
  booking_id: 'booking-a',
  total_price: 100,
  unit_price: 0,
  quantity: 1,
  purchase_cost: 10,
  ...overrides,
});

describe('booking product economy fallback', () => {
  it('hämtar även rader efter Supabases första 1 000', async () => {
    const firstPage = Array.from({ length: BOOKING_PRODUCT_PAGE_SIZE }, () => row());
    const lastRow = row({ booking_id: 'booking-after-limit', total_price: 191500 });
    const fetchPage = vi.fn(async (from: number) => ({
      data: from === 0 ? firstPage : from === BOOKING_PRODUCT_PAGE_SIZE ? [lastRow] : [],
      error: null,
    }));

    const rows = await fetchAllBookingProductEconomyRows(fetchPage);
    const totals = aggregateBookingProductEconomy(rows);

    expect(rows).toHaveLength(1001);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 999);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(totals['booking-after-limit']?.revenue).toBe(191500);
  });

  it('använder totalpris och faller tillbaka till styckpris gånger antal', () => {
    const totals = aggregateBookingProductEconomy([
      row({ total_price: 17158, unit_price: 999, quantity: 2 }),
      row({ total_price: null, unit_price: 1200, quantity: 3 }),
    ]);

    expect(totals['booking-a']).toEqual({ revenue: 20758, costs: 50, count: 2 });
  });

  it('skriver inte över Booking-systemets positiva summa', () => {
    const batches = {
      'booking-a': {
        budget: null,
        time_reports: [],
        purchases: [],
        quotes: [],
        invoices: [],
        supplier_invoices: [],
        product_costs: { summary: { revenue: 42042, costs: 1000 } },
      },
    };

    const merged = mergeBookingProductEconomyFallback(batches, {
      'booking-a': { revenue: 99999, costs: 500, count: 1 },
    });

    expect(merged['booking-a']?.product_costs.summary.revenue).toBe(42042);
    expect(merged['booking-a']?.product_costs.summary.costs).toBe(1000);
  });
});