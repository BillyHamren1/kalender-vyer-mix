export const ECONOMY_DATA_TYPES = [
  'budget',
  'time_reports',
  'purchases',
  'quotes',
  'invoices',
  'product_costs',
  'supplier_invoices',
] as const;

export type EconomyDataType = typeof ECONOMY_DATA_TYPES[number];
export type EconomyBatch = Record<string, unknown> & {
  product_costs: unknown;
  _errors?: Record<string, { code: string; status?: number }>;
};

export class UpstreamEconomyError extends Error {
  constructor(
    public readonly dataType: EconomyDataType,
    public readonly code: 'upstream_http_error' | 'upstream_invalid_json' | 'upstream_error_payload',
    public readonly status?: number,
  ) {
    super(`${dataType}:${code}`);
    this.name = 'UpstreamEconomyError';
  }
}

export function hasValidProductCosts(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const batch = data as Record<string, unknown>;
  if (batch._errors && typeof batch._errors === 'object' && 'product_costs' in batch._errors) return false;
  const productCosts = batch.product_costs;
  return productCosts !== null && typeof productCosts === 'object';
}

export async function fetchEconomyType(
  fetcher: typeof fetch,
  efUrl: string,
  planningApiKey: string,
  type: EconomyDataType,
  bookingId: string,
): Promise<unknown> {
  const qs = new URLSearchParams({ type, booking_id: bookingId });
  const response = await fetcher(`${efUrl}/functions/v1/planning-api?${qs.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'x-api-key': planningApiKey },
  });

  if (!response.ok) {
    throw new UpstreamEconomyError(type, 'upstream_http_error', response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new UpstreamEconomyError(type, 'upstream_invalid_json', response.status);
  }

  if (payload && typeof payload === 'object' && 'error' in payload) {
    throw new UpstreamEconomyError(type, 'upstream_error_payload', response.status);
  }
  return payload;
}

export async function fetchEconomyBatch(
  fetcher: typeof fetch,
  efUrl: string,
  planningApiKey: string,
  bookingId: string,
): Promise<EconomyBatch> {
  const settled = await Promise.allSettled(
    ECONOMY_DATA_TYPES.map((type) => fetchEconomyType(fetcher, efUrl, planningApiKey, type, bookingId)),
  );
  const batch: EconomyBatch = { product_costs: null };
  const errors: Record<string, { code: string; status?: number }> = {};

  settled.forEach((result, index) => {
    const type = ECONOMY_DATA_TYPES[index];
    if (result.status === 'fulfilled') {
      batch[type] = result.value;
      return;
    }
    const error = result.reason;
    errors[type] = error instanceof UpstreamEconomyError
      ? { code: error.code, ...(error.status ? { status: error.status } : {}) }
      : { code: 'upstream_http_error' };
    batch[type] = null;
  });

  if (Object.keys(errors).length > 0) batch._errors = errors;
  return batch;
}
