import { supabase } from "@/integrations/supabase/client";
import { PackingWithBooking, PackingParcel } from "@/types/packing";

// ============== FETCH ==============

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

// ============== TOGGLE / DECREMENT ==============

/**
 * @deprecated Manual check-off (increment) MUST go through scanner-api
 * `toggle_item` so WMS / Bundle Builder can accept or reject the scan
 * BEFORE local `packing_list_items.quantity_packed` is mutated. This
 * legacy desktop helper bypassed WMS and is no longer used by
 * DesktopChecklistView. Use `togglePackingItemManually` from
 * `src/services/scannerService.ts` instead.
 *
 * Kept exported only to avoid breaking unrelated imports during the
 * migration window — DO NOT call from new code.
 */
export const togglePackingItemDesktop = async (
  _itemId: string,
  _currentlyPacked: boolean,
  _quantityToPack: number,
  _verifiedBy: string
): Promise<{ success: false; error: string }> => {
  return {
    success: false,
    error:
      'togglePackingItemDesktop är borttagen — använd togglePackingItemManually (scanner-api WMS-first) istället.',
  };
};

export const decrementPackingItemDesktop = async (
  itemId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: item, error: fetchErr } = await supabase
      .from('packing_list_items')
      .select('quantity_packed')
      .eq('id', itemId)
      .single();

    if (fetchErr || !item) return { success: false, error: 'Kunde inte hämta artikel' };

    const newQty = Math.max((item.quantity_packed || 0) - 1, 0);

    const { error } = await supabase
      .from('packing_list_items')
      .update({ quantity_packed: newQty })
      .eq('id', itemId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

// ============== PARCEL (KOLLI) ==============

export const createParcelDesktop = async (
  packingId: string,
  createdBy: string
): Promise<PackingParcel> => {
  // Get max parcel_number for this packing
  const { data: existing } = await supabase
    .from('packing_parcels')
    .select('parcel_number')
    .eq('packing_id', packingId)
    .order('parcel_number', { ascending: false })
    .limit(1);

  const nextNumber = (existing?.[0]?.parcel_number || 0) + 1;

  const { data, error } = await supabase
    .from('packing_parcels')
    .insert({
      packing_id: packingId,
      parcel_number: nextNumber,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data as PackingParcel;
};

export const assignItemToParcelDesktop = async (
  itemId: string,
  parcelId: string | null
): Promise<void> => {
  const { error } = await supabase
    .from('packing_list_items')
    .update({ parcel_id: parcelId })
    .eq('id', itemId);

  if (error) throw error;
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

// ============== SIGN ==============

export const signPackingDesktop = async (
  packingId: string,
  signedBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('packing_projects')
    .update({
      signed_by: signedBy,
      signed_at: new Date().toISOString(),
      status: 'packed',
    })
    .eq('id', packingId);

  if (error) throw error;
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
