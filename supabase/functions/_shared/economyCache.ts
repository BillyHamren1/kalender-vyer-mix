// Lagrad ekonomi per bokning. Hämtas EN gång från Booking och sparas i
// economy_cache. Booking-ändringar (import-bookings) och Planning-skrivningar
// uppdaterar raden i bakgrunden – ingen tidsbaserad utgång.
import { fetchEconomyBatch } from './economy-fetch.ts';

type Db = { from: (t: string) => any };

/** Endast kompletta svar (utan upstream-fel) får sparas. */
export function isCacheableBatch(batch: Record<string, unknown> | null | undefined): boolean {
  return !!batch && !batch._errors && batch.product_costs != null;
}

export async function readEconomyCache(db: Db, organizationId: string, bookingIds: string[]) {
  const out: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < bookingIds.length; i += 100) {
    const { data, error } = await db.from('economy_cache').select('booking_id,data')
      .eq('organization_id', organizationId).in('booking_id', bookingIds.slice(i, i + 100));
    if (error) throw error;
    for (const r of data ?? []) if (isCacheableBatch(r.data)) out[r.booking_id] = r.data;
  }
  return out;
}

export async function writeEconomyCache(db: Db, organizationId: string, rows: Record<string, Record<string, unknown>>) {
  const payload = Object.entries(rows).filter(([, d]) => isCacheableBatch(d))
    .map(([booking_id, data]) => ({ booking_id, organization_id: organizationId, data, cached_at: new Date().toISOString() }));
  if (payload.length === 0) return;
  const { error } = await db.from('economy_cache').upsert(payload, { onConflict: 'booking_id' });
  if (error) console.warn('[economy-cache] write failed', error.message);
}

/** Hämtar färsk ekonomi från Booking för givna bokningar och sparar den. */
export async function refreshEconomyCache(
  db: Db, efUrl: string, apiKey: string, organizationId: string, bookingIds: string[], parallel = 10,
) {
  const fresh: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < bookingIds.length; i += parallel) {
    const chunk = bookingIds.slice(i, i + parallel);
    const res = await Promise.all(chunk.map((id) => fetchEconomyBatch(fetch, efUrl, apiKey, id, organizationId)));
    chunk.forEach((id, k) => { fresh[id] = res[k]; });
  }
  await writeEconomyCache(db, organizationId, fresh);
  return fresh;
}
