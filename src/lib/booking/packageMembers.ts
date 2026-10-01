import type { BookingProduct } from '@/types/booking';

/** Rad ur lagrets paketprojektion (endast paketmedlemmar + deras paketrad). */
export interface WmsPackageRow {
  id: string;
  name: string;
  quantity: number;
  sync_key: string | null;
  sort_index: number | null;
  inventory_package_id: string | null;
  parent_product_id: string | null;
  is_package_component: boolean | null;
}

const cleanName = (name: string) => name.replace(/^\s*(--|↳|└)\s*/, '').trim();

/**
 * Paketmedlemmar per Booking-huvudrad (nyckel = Booking-radens id).
 *
 * Orderraderna (huvudrad, tillbehör, antal, ordning) kommer ALLTID från Booking.
 * Paketets innehåll (t.ex. tältets ramdelar) är paketdefinition, inte orderrad:
 *  1. Booking-radens egna package_components (× radens antal) om de finns.
 *  2. Annars lagrets paketprojektion, matchad på paketdefinitionens id.
 * Lagrets fristående orderradskopior (t.ex. gamla antal) används aldrig.
 */
export const buildPackageMembers = (
  bookingProducts: BookingProduct[],
  wmsRows: WmsPackageRow[],
): Record<string, BookingProduct[]> => {
  const result: Record<string, BookingProduct[]> = {};

  const isWmsKey = (k: string | null) => (k ?? '').startsWith('wms:');
  const isComponentKey = (k: string | null) => (k ?? '').includes('::');

  const wmsParents = wmsRows
    .filter((r) => isWmsKey(r.sync_key) && !isComponentKey(r.sync_key) && r.inventory_package_id)
    .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
  const wmsComponentsByParent = new Map<string, WmsPackageRow[]>();
  for (const r of wmsRows) {
    if (!isWmsKey(r.sync_key) || !isComponentKey(r.sync_key) || !r.parent_product_id) continue;
    const list = wmsComponentsByParent.get(r.parent_product_id) ?? [];
    list.push(r);
    wmsComponentsByParent.set(r.parent_product_id, list);
  }

  const usedWmsParents = new Set<string>();

  for (const product of bookingProducts) {
    if (product.isPackageComponent || product.parentProductId) continue;

    if (product.packageComponents && product.packageComponents.length > 0) {
      result[product.id] = product.packageComponents.map((c, i) => ({
        id: `${product.id}::member::${i}`,
        name: c.name,
        quantity: (product.quantity || 1) * (c.quantity || 1),
        sku: c.sku,
        isPackageComponent: true,
        parentProductId: product.id,
      }));
      continue;
    }

    if (!product.inventoryPackageId) continue;
    const wmsParent = wmsParents.find(
      (p) => p.inventory_package_id === product.inventoryPackageId && !usedWmsParents.has(p.id),
    );
    if (!wmsParent) continue;
    usedWmsParents.add(wmsParent.id);

    const members = (wmsComponentsByParent.get(wmsParent.id) ?? [])
      .slice()
      .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
      .map((r) => ({
        id: r.id,
        name: cleanName(r.name),
        quantity: Number(r.quantity) || 0,
        isPackageComponent: true,
        parentProductId: product.id,
      }));
    if (members.length > 0) result[product.id] = members;
  }

  return result;
};
