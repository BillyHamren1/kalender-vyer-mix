// Lagrad ekonomi per bokning. Cacheuppdateringar claimas och skrivs med en
// generationsnyckel i databasen så att äldre parallella hämtningar inte kan
// skriva över en nyare uppdatering.
import { fetchEconomyBatch } from './economy-fetch.ts';

type Db = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

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

/**
 * Claim refresh generations and invalidate old rows in one database
 * transaction. A later claim advances the generation and wins over any older
 * fetch still in flight.
 */
export async function claimEconomyCacheRefresh(db: Db, organizationId: string, bookingIds: string[]) {
  const uniqueIds = [...new Set(bookingIds)];
  if (uniqueIds.length === 0) return {};
  const { data, error } = await db.rpc('claim_economy_cache_refresh', {
    p_organization_id: organizationId,
    p_booking_ids: uniqueIds,
  });
  if (error) throw error;
  const generations: Record<string, number> = {};
  for (const row of data ?? []) {
    if (uniqueIds.includes(row.booking_id)) generations[row.booking_id] = Number(row.generation);
  }
  if (Object.keys(generations).length !== uniqueIds.length) {
    throw new Error('Failed to claim every economy cache refresh');
  }
  return generations;
}

/** Save only if this refresh still owns the latest per-booking generation. */
export async function writeEconomyCacheIfCurrent(
  db: Db,
  organizationId: string,
  bookingId: string,
  generation: number,
  data: Record<string, unknown>,
) {
  if (!isCacheableBatch(data)) return false;
  const { data: written, error } = await db.rpc('write_economy_cache_if_current', {
    p_organization_id: organizationId,
    p_booking_id: bookingId,
    p_generation: generation,
    p_data: data,
  });
  if (error) throw error;
  return written === true;
}

/** Hämtar färsk ekonomi för bara de angivna bokningarna. */
export async function refreshEconomyCache(
  db: Db, efUrl: string, apiKey: string, organizationId: string, bookingIds: string[], parallel = 10,
) {
  const affectedIds = [...new Set(bookingIds)];
  if (affectedIds.length === 0) return {};
  const generations = await claimEconomyCacheRefresh(db, organizationId, affectedIds);
  const fresh: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < affectedIds.length; i += parallel) {
    const chunk = affectedIds.slice(i, i + parallel);
    const res = await Promise.all(chunk.map((id) => fetchEconomyBatch(fetch, efUrl, apiKey, id, organizationId)));
    await Promise.all(chunk.map(async (id, k) => {
      fresh[id] = res[k];
      await writeEconomyCacheIfCurrent(db, organizationId, id, generations[id], res[k]);
    }));
  }
  return fresh;
}
