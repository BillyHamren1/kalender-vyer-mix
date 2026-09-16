import { supabase } from "@/integrations/supabase/client";
import { PackingWithBooking } from "@/types/packing";

// ============================================================================
// READ-ONLY desktop packing service.
//
// SÄKERHETSREGEL: All packningsmuterande logik MÅSTE gå via scanner-api med
// aktiv `packing_work_session` så att audit-historiken inte tappas. Tidigare
// fanns lokala mutators här (decrement/createParcel/assign/sign) som gick förbi
// scanner-api — de är nu neutraliserade och returnerar/kastar tydligt fel.
//
// Helpers som lever kvar är ENDAST läs-helpers för att hydrera UI:t.
// ============================================================================

const DESKTOP_PACKING_BLOCKED_MESSAGE =
  'Packningsändringar måste gå via scanner-api med aktiv session.';

// ============== FETCH (read-only) ==============

export const fetchPackingForDesktop = async (id: string): Promise<PackingWithBooking | null> => {
  const { data: packing, error } = await supabase
    .from('packing_projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!packing) return null;

  if (packing.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number, internalnotes')
      .eq('id', packing.booking_id)
      .single();
    return { ...packing, booking } as PackingWithBooking;
  }

  return packing as PackingWithBooking;
};

export const fetchPackingListItemsForDesktop = async (packingId: string) => {
  const { data, error } = await supabase
    .from('packing_list_items')
    .select('id, created_at, source_booking_id, wms_line_id, wms_sku, notes, quantity_to_pack, quantity_packed, verified_at, verified_by, parcel_id, excluded, manual_name, planning_excluded_at, packed_at, booking_product_id, product_packable_default, booking_packability_override, warehouse_packability_override, is_packable, packability_source, packability_revision, booking_products(id, name, quantity, sku, notes, sort_index, parent_product_id, parent_package_id, is_package_component, booking_id, inventory_item_type_id)')
    .eq('packing_id', packingId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return sortPackingItems(data || []);
};

/**
 * Explicit reparation från desktop: genererar SAKNADE packrader via edge-funktionen
 * repair-packing-items. Endast planning/in_progress; raderar aldrig något.
 */
export const repairPackingItemsDesktop = async (
  packingId: string,
): Promise<{ inserted: number; total: number; source?: 'wms' | 'booking_products' }> => {
  const { data, error } = await supabase.functions.invoke('repair-packing-items', {
    body: { packing_id: packingId },
  });
  if (error) {
    let details = '';
    const response = (error as unknown as { context?: Response })?.context;
    if (response && typeof response.clone === 'function') {
      try {
        const body = await response.clone().json();
        details = body?.error || body?.message || body?.code || '';
      } catch {
        try { details = await response.clone().text(); } catch { /* no response body */ }
      }
    }
    throw new Error(details || error.message || 'Kunde inte generera packlistan');
  }
  if (data?.error) throw new Error(data.error);
  return {
    inserted: data?.inserted ?? 0,
    total: data?.total ?? 0,
    source: data?.source,
  };
};

export const getItemParcelsDesktop = async (
  packingId: string
): Promise<Record<string, number>> => {
  const { data, error } = await supabase
    .from('packing_list_items')
    .select('id, parcel_id')
    .eq('packing_id', packingId)
    .not('parcel_id', 'is', null);

  if (error) throw error;

  const parcelIds = [...new Set((data || []).map(d => d.parcel_id).filter(Boolean))] as string[];
  if (parcelIds.length === 0) return {};

  const { data: parcels } = await supabase
    .from('packing_parcels')
    .select('id, parcel_number')
    .in('id', parcelIds);

  const parcelMap = new Map((parcels || []).map(p => [p.id, p.parcel_number]));
  const result: Record<string, number> = {};
  (data || []).forEach(item => {
    if (item.parcel_id && parcelMap.has(item.parcel_id)) {
      result[item.id] = parcelMap.get(item.parcel_id)!;
    }
  });
  return result;
};

// ============================================================================
// BLOCKED legacy mutators
// ============================================================================
// Dessa fyra funktioner är medvetet kvar för att gamla imports inte ska
// krascha bygget. De gör INTE några ändringar — de returnerar/kastar fel med
// exakt texten "Packningsändringar måste gå via scanner-api med aktiv session."
//
// Säkraste vägen är att helt sluta importera dem. Vid förändring → använd
// scanner-api action `toggle_item` / `decrement_item` / `create_parcel` /
// `assign_item_to_parcel` / `sign_packing` med activeSessionId.
// ============================================================================

/** @deprecated Använd scanner-api `toggle_item` (decrement-path) med activeSessionId. */
export const legacyTogglePackingItemDesktopLocalOnly = async (
  _itemId: string,
  _currentlyPacked: boolean,
  _quantityToPack: number,
  _verifiedBy: string,
): Promise<{ success: false; error: string }> => ({
  success: false,
  error: DESKTOP_PACKING_BLOCKED_MESSAGE,
});

/** @deprecated Renamed och neutraliserad. */
export const togglePackingItemDesktop = legacyTogglePackingItemDesktopLocalOnly;

/** @deprecated Använd scanner-api `decrement_item` med activeSessionId. */
export const decrementPackingItemDesktop = async (
  _itemId: string,
): Promise<{ success: false; error: string }> => ({
  success: false,
  error: DESKTOP_PACKING_BLOCKED_MESSAGE,
});

/** @deprecated Använd scanner-api `create_parcel` med activeSessionId. */
export const createParcelDesktop = async (
  _packingId: string,
  _createdBy: string,
): Promise<never> => {
  throw new Error(DESKTOP_PACKING_BLOCKED_MESSAGE);
};

/** @deprecated Använd scanner-api `assign_item_to_parcel` med activeSessionId. */
export const assignItemToParcelDesktop = async (
  _itemId: string,
  _parcelId: string | null,
): Promise<never> => {
  throw new Error(DESKTOP_PACKING_BLOCKED_MESSAGE);
};

/** @deprecated Använd scanner-api `sign_packing` (när session-stödet finns där). */
export const signPackingDesktop = async (
  _packingId: string,
  _signedBy: string,
): Promise<never> => {
  throw new Error(DESKTOP_PACKING_BLOCKED_MESSAGE);
};

// ============== SORT UTILITY ==============

export const sortPackingItems = (items: any[]) => {
  const inputOrder = new Map(items.map((item, index) => [item.id, index]));
  const mainProducts: typeof items = [];
  const childrenByParent: Record<string, typeof items> = {};

  items.forEach(item => {
    const parentId = item.booking_products?.parent_product_id;
    if (!parentId) {
      mainProducts.push(item);
    } else {
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(item);
    }
  });

  Object.values(childrenByParent).forEach(children => {
    children.sort((a, b) => {
      const aSort = a.booking_products?.sort_index;
      const bSort = b.booking_products?.sort_index;
      if (aSort != null || bSort != null) {
        return (aSort ?? Number.MAX_SAFE_INTEGER) - (bSort ?? Number.MAX_SAFE_INTEGER);
      }
      return (inputOrder.get(a.id) ?? 0) - (inputOrder.get(b.id) ?? 0);
    });
  });

  mainProducts.sort((a, b) => {
    const aSort = a.booking_products?.sort_index;
    const bSort = b.booking_products?.sort_index;
    if (aSort != null || bSort != null) {
      return (aSort ?? Number.MAX_SAFE_INTEGER) - (bSort ?? Number.MAX_SAFE_INTEGER);
    }
    // WMS rows have no booking_products.sort_index. Their created_at query
    // order is the durable projection order and must never be alphabetized.
    return (inputOrder.get(a.id) ?? 0) - (inputOrder.get(b.id) ?? 0);
  });

  const orderedItems: typeof items = [];
  mainProducts.forEach(main => {
    orderedItems.push(main);
    const parentId = main.booking_products?.id;
    if (parentId && childrenByParent[parentId]) {
      orderedItems.push(...childrenByParent[parentId]);
    }
  });

  const mainProductIds = new Set(mainProducts.map(m => m.booking_products?.id).filter(Boolean));
  Object.entries(childrenByParent).forEach(([parentId, children]) => {
    if (!mainProductIds.has(parentId)) {
      orderedItems.push(...children);
    }
  });

  return orderedItems;
};

/**
 * Lagermodulens enda skrivväg för en packrads effektiva packningsbarhet.
 *
 * Går via den autentiserade edge-funktionen `edit-packing-list`, som skriver
 * enbart `warehouse_packability_override` genom en atomisk, tenant-scopead RPC.
 * Klienten accepterar inte ändringen förrän WMS-kvittot matchar operationen,
 * raden, den önskade effektiva statusen och en heltalsrevision.
 */
export const setWarehousePackingListItemPackability = async (
  packingId: string,
  itemId: string,
  mode: 'set_packable' | 'set_non_packable' | 'reset_packability',
  expectedRevision: number,
  operationId = crypto.randomUUID(),
): Promise<{
  operation_id: string;
  item_id: string;
  affected_item_ids: string[];
  affected_count: number;
  changed_count: number;
  warehouse_packability_override: boolean | null;
  is_packable: boolean;
  packability_source: 'warehouse_override' | 'booking_override' | 'product_default';
  packability_revision: number;
  booking_unchanged: true;
}> => {
  const { data, error } = await supabase.functions.invoke('edit-packing-list', {
    body: {
      packing_id: packingId,
      item_id: itemId,
      mode,
      operation_id: operationId,
      expected_revision: expectedRevision,
    },
  });
  if (error) {
    let errorBody = data as any;
    const response = (error as unknown as { context?: Response })?.context;
    if (response && typeof response.clone === 'function') {
      try {
        errorBody = await response.clone().json();
      } catch {
        // Keep the SDK error below when the response is not JSON.
      }
    }
    const detail = errorBody?.error || errorBody?.message;
    const code = errorBody?.code;
    if (code === 'revision_conflict') {
      throw new Error('Raden ändrades av någon annan. Ladda om packlistan och försök igen.');
    }
    if (code === 'row_touched') {
      throw new Error('Raden är redan packad, kontrollerad eller lagd i kolli och kan inte ändras.');
    }
    throw new Error(detail || error.message || 'Kunde inte uppdatera packlistan.');
  }
  if ((data as any)?.error) throw new Error((data as any).error);

  const receipt = data as any;
  const expectedPackable = mode === 'set_packable' ? true : mode === 'set_non_packable' ? false : null;
  if (
    !receipt?.ok ||
    !receipt ||
    receipt.operation_id !== operationId ||
    receipt.item_id !== itemId ||
    receipt.booking_unchanged !== true ||
    (expectedPackable !== null && receipt.is_packable !== expectedPackable) ||
    !Number.isInteger(receipt.packability_revision)
  ) {
    throw new Error('WMS kunde inte verifiera packningsstatusen. Vyn har inte ändrats.');
  }

  return {
    operation_id: receipt.operation_id,
    item_id: receipt.item_id,
    affected_item_ids: Array.isArray(receipt.affected_item_ids) ? receipt.affected_item_ids : [],
    affected_count: Number(receipt.affected_count ?? 0),
    changed_count: Number(receipt.changed_count ?? 0),
    warehouse_packability_override: receipt.warehouse_packability_override ?? null,
    is_packable: receipt.is_packable,
    packability_source: receipt.packability_source,
    packability_revision: receipt.packability_revision,
    booking_unchanged: true,
  };
};
