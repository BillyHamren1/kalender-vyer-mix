const ECONOMY_WRITE_TYPES = new Set([
  'budget',
  'time_reports',
  'purchases',
  'quotes',
  'invoices',
  'product_costs',
  'extra_costs',
  'supplier_invoices',
]);

const BOOKING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EconomyWrite = {
  type: unknown;
  method: unknown;
  ok: boolean;
  params?: Record<string, unknown>;
  responseData?: unknown;
};

/** Resolve the booking whose cached economy must be refreshed after a source write. */
export function economyCacheRefreshBookingId({
  type,
  method,
  ok,
  params = {},
  responseData,
}: EconomyWrite): string | null {
  if (!ok || typeof type !== 'string' || !ECONOMY_WRITE_TYPES.has(type)) return null;
  if (typeof method !== 'string' || method.toUpperCase() === 'GET') return null;

  const responseBookingId = responseData && typeof responseData === 'object'
    ? (responseData as Record<string, unknown>).booking_id
    : null;
  const candidates = [params.booking_id, (params.data as Record<string, unknown> | undefined)?.booking_id, responseBookingId];
  return candidates.find((value): value is string => typeof value === 'string' && BOOKING_ID.test(value)) ?? null;
}
