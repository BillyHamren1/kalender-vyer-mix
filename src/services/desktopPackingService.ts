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
      .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
      .eq('id', packing.booking_id)
      .single();
    return { ...packing, booking } as PackingWithBooking;
  }

  return packing as PackingWithBooking;
};

export const fetchPackingListItemsForDesktop = async (packingId: string) => {
  const { data, error } = await supabase
    .from('packing_list_items')
    .select('id, quantity_to_pack, quantity_packed, verified_at, verified_by, parcel_id, excluded, manual_name, booking_product_id, booking_products(id, name, quantity, sku, notes, parent_product_id, parent_package_id, is_package_component, booking_id, inventory_item_type_id)')
    .eq('packing_id', packingId);

  if (error) throw error;
  return sortPackingItems(data || []);
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

const sortPackingItems = (items: any[]) => {
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
      const aName = a.booking_products?.name || '';
      const bName = b.booking_products?.name || '';
      const aIsAccessory = aName.startsWith('↳') || aName.startsWith('└') || aName.startsWith('L,');
      const bIsAccessory = bName.startsWith('↳') || bName.startsWith('└') || bName.startsWith('L,');
      if (!aIsAccessory && bIsAccessory) return -1;
      if (aIsAccessory && !bIsAccessory) return 1;
      return 0;
    });
  });

  mainProducts.sort((a, b) => {
    const aName = a.booking_products?.name || '';
    const bName = b.booking_products?.name || '';
    return aName.localeCompare(bName, 'sv');
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
