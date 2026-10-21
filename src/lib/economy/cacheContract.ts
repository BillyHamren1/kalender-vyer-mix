import type { BatchEconomyData } from '@/services/planningApiService';

export const economyBookingKey = (organizationId: string | null, bookingId: string | null | undefined) =>
  ['economy-booking', organizationId, bookingId] as const;

export function assertCompleteEconomy(batch: BatchEconomyData | undefined): asserts batch is BatchEconomyData {
  if (!batch || batch._errors && Object.keys(batch._errors).length > 0 || !batch.product_costs || typeof batch.product_costs !== 'object') {
    throw new Error('Bokningens ekonomidata kunde inte uppdateras. Tidigare belopp kan vara inaktuella.');
  }
  for (const field of ['purchases', 'quotes', 'invoices', 'supplier_invoices', 'time_reports'] as const) {
    if (!Array.isArray(batch[field])) throw new Error(`Ofullständigt ekonomiunderlag: ${field}`);
  }
}

type Scope = { organizationId: string; userId: string };
let scope: Scope | null = null;
export function bindEconomyScope(next: Scope) {
  scope = next;
  return () => { if (scope === next) scope = null; };
}
export const currentEconomyScope = () => scope;
export const ECONOMY_CHANGED = 'eventflow:economy-changed';
export function emitEconomyChanged(organizationId: string, bookingId: string, stale = false) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED, {
    detail: { organizationId, bookingId, stale },
  }));
}