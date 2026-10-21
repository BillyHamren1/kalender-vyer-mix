import type { QueryClient } from '@tanstack/react-query';
import type { BatchEconomyData } from '@/services/planningApiService';
import type { ProjectWithEconomy } from '@/hooks/useEconomyOverviewData';
import { assertCompleteEconomy, economyBookingKey } from './cacheContract';
import { summarizeEconomyBatches } from './batchSummary';

const rowIds = (row: ProjectWithEconomy) => row.booking_ids ?? (row.booking_id ? [row.booking_id] : []);
export function knownEconomyBookingIds(client: QueryClient, org: string): Set<string> {
  const ids = new Set<string>();
  for (const query of client.getQueryCache().getAll()) {
    const key = query.queryKey;
    if (key[0] === 'economy-booking' && key[1] === org && typeof key[2] === 'string') ids.add(key[2]);
    if (key[0] === 'large-project-booking-economy' && key[1] === org && Array.isArray(key[3])) key[3].forEach(id => ids.add(id));
    if (key[0] === 'economy-overview' && key[1] === org) {
      (query.state.data as ProjectWithEconomy[] | undefined)?.forEach(row => rowIds(row).forEach(id => ids.add(id)));
    }
  }
  return ids;
}

/** Patch only registered same-tenant projections; never invalidate the historical overview loader. */
export function applyEconomyChanges(client: QueryClient, org: string, batches: Record<string, BatchEconomyData>, staleIds: string[] = []) {
  const changed = new Set([...Object.keys(batches), ...staleIds]);
  Object.values(batches).forEach(assertCompleteEconomy);
  for (const [id, batch] of Object.entries(batches)) {
    client.setQueryData(economyBookingKey(org, id), batch);
    client.setQueryData<boolean>(['economy-stale', org, id], false);
  }
  client.setQueryData<ProjectWithEconomy[]>(['economy-overview', org], rows => rows?.map(row => {
    const ids = rowIds(row);
    if (!ids.some(id => changed.has(id))) return row;
    const merged = { ...row.economyBatches, ...Object.fromEntries(ids.filter(id => batches[id]).map(id => [id, batches[id]])) };
    if (ids.some(id => staleIds.includes(id)) || ids.some(id => !merged[id])) {
      return { ...row, economyBatches: merged, economyError: 'Ekonomin kunde inte uppdateras; tidigare belopp är inaktuella.', revenueAvailable: false };
    }
    return { ...row, ...summarizeEconomyBatches(ids.map(id => merged[id])), economyClosed: row.status === 'completed' || summarizeEconomyBatches(ids.map(id => merged[id])).economyClosed,
      economyBatches: merged, economyError: undefined, revenueAvailable: true };
  }));
  for (const query of client.getQueryCache().getAll()) {
    const key = query.queryKey;
    if (key[0] !== 'large-project-booking-economy' || key[1] !== org || !Array.isArray(key[3]) || !key[3].some(id => changed.has(id))) continue;
    const ids: string[] = key[3];
    if (ids.some(id => staleIds.includes(id))) {
      client.setQueryData<boolean>(['economy-aggregate-stale', org, key[2]], true);
      // Mark only this aggregate stale without automatically loading its sibling bookings.
      void client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
    } else {
      client.setQueryData<boolean>(['economy-aggregate-stale', org, key[2]], false);
      client.setQueryData(key, (old: Record<string, BatchEconomyData> | undefined) => old && {
        ...old, ...Object.fromEntries(ids.filter(id => batches[id]).map(id => [id, batches[id]])),
      });
    }
  }
}