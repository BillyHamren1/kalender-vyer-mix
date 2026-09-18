import type { BatchEconomyData } from '@/services/planningApiService';

export const BOOKING_PRODUCT_PAGE_SIZE = 1000;

export interface BookingProductEconomyRow {
  booking_id: string | null;
  total_price: number | string | null;
  unit_price: number | string | null;
  quantity: number | string | null;
  purchase_cost: number | string | null;
}

export interface BookingProductEconomyTotal {
  revenue: number;
  costs: number;
  count: number;
}

type FetchPage = (
  from: number,
  to: number,
) => Promise<{ data: BookingProductEconomyRow[] | null; error: unknown }>;

const numberValue = (value: number | string | null): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function aggregateBookingProductEconomy(
  rows: BookingProductEconomyRow[],
): Record<string, BookingProductEconomyTotal> {
  const totals: Record<string, BookingProductEconomyTotal> = {};

  for (const row of rows) {
    if (!row.booking_id) continue;
    const quantity = numberValue(row.quantity);
    const totalPrice = numberValue(row.total_price);
    const revenue = totalPrice || numberValue(row.unit_price) * quantity;
    const costs = numberValue(row.purchase_cost) * quantity;
    const current = totals[row.booking_id] ?? { revenue: 0, costs: 0, count: 0 };

    current.revenue += revenue;
    current.costs += costs;
    current.count += 1;
    totals[row.booking_id] = current;
  }

  return totals;
}

export async function fetchAllBookingProductEconomyRows(
  fetchPage: FetchPage,
): Promise<BookingProductEconomyRow[]> {
  const rows: BookingProductEconomyRow[] = [];

  for (let from = 0; ; from += BOOKING_PRODUCT_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + BOOKING_PRODUCT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < BOOKING_PRODUCT_PAGE_SIZE) return rows;
  }
}

export function mergeBookingProductEconomyFallback(
  batches: Record<string, BatchEconomyData>,
  totals: Record<string, BookingProductEconomyTotal>,
): Record<string, BatchEconomyData> {
  const merged = { ...batches };

  for (const [bookingId, local] of Object.entries(totals)) {
    if (local.revenue <= 0) continue;
    const existing = merged[bookingId] ?? ({} as BatchEconomyData);
    const productCosts = existing.product_costs ?? null;
    const proxyRevenue = numberValue(productCosts?.summary?.revenue ?? null);
    if (proxyRevenue > 0) continue;

    merged[bookingId] = {
      ...existing,
      product_costs: {
        ...(productCosts || {}),
        summary: {
          ...(productCosts?.summary || {}),
          revenue: local.revenue,
          costs: local.costs,
          margin: local.revenue - local.costs,
        },
        products: productCosts?.products ?? [],
        _source: 'local_booking_products_fallback',
      },
    } as BatchEconomyData;
  }

  return merged;
}