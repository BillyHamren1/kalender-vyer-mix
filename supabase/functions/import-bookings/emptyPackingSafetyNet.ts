/**
 * Säkerhetsnät för tomma aktiva packningsprojekt vid already_current.
 *
 * Bakgrund: revisionsguarden kan returnera `already_current` innan den
 * ordinarie produkt-/packningssynken körs. En aktiv packing_project med
 * exakt 0 packing_list_items ska då självläka via repairPackingItems.
 *
 * Regler:
 * - Endast exakt booking_id + organization_id inspekteras.
 * - Ingen packing eller inaktiv status (ej planning/in_progress) => no-op.
 * - Båda läsningarna är fail-closed: ett läsfel tolkas ALDRIG som noll.
 * - count > 0 => no-op (repair anropas inte).
 * - count === 0 => repairPackingItems (WMS först, befintliga rader rörs ej).
 * - Inga delete/update/replace av packingrader finns på denna väg.
 */

import { repairPackingItems } from '../_shared/packingRepair.ts';

const ACTIVE_PACKING_STATUSES = ['planning', 'in_progress'] as const;

export type EmptyPackingSafetyNetResult =
  | {
      kind: 'noop';
      reason: 'no_packing_project' | 'inactive_status' | 'nonempty';
      packingId: string | null;
      status?: string | null;
      count?: number;
    }
  | { kind: 'failed'; code: string; error: string }
  | {
      kind: 'repaired';
      packingId: string;
      inserted: number;
      total: number;
      source: string | null;
    };

type RepairDeps = {
  repairPackingItems: typeof repairPackingItems;
};

const defaultDeps: RepairDeps = { repairPackingItems };

export async function ensureActivePackingNotEmpty(
  supabase: any,
  bookingId: string,
  organizationId: string,
  deps: RepairDeps = defaultDeps,
): Promise<EmptyPackingSafetyNetResult> {
  const { data: packing, error: packingError } = await supabase
    .from('packing_projects')
    .select('id, status')
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (packingError) {
    const message = packingError.message || String(packingError);
    return { kind: 'failed', code: 'packing_project_read_failed', error: message };
  }
  if (!packing) {
    return { kind: 'noop', reason: 'no_packing_project', packingId: null };
  }
  if (!ACTIVE_PACKING_STATUSES.includes(packing.status)) {
    return {
      kind: 'noop',
      reason: 'inactive_status',
      packingId: packing.id,
      status: packing.status,
    };
  }

  const { count, error: countError } = await supabase
    .from('packing_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('packing_id', packing.id)
    .eq('organization_id', organizationId);

  if (countError) {
    const message = countError.message || String(countError);
    return { kind: 'failed', code: 'packing_row_count_failed', error: message };
  }
  const rowCount = count ?? 0;
  if (rowCount > 0) {
    return { kind: 'noop', reason: 'nonempty', packingId: packing.id, count: rowCount };
  }

  const repair = await deps.repairPackingItems(supabase, packing.id, organizationId);
  if (!repair.ok) {
    return {
      kind: 'failed',
      code: `packing_repair_failed:${repair.code ?? 'unknown'}`,
      error: repair.error ?? repair.code ?? 'unknown_error',
    };
  }
  return {
    kind: 'repaired',
    packingId: packing.id,
    inserted: repair.inserted ?? 0,
    total: repair.total ?? 0,
    source: repair.source ?? null,
  };
}
