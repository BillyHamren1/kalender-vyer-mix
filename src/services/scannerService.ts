import { supabase } from "@/integrations/supabase/client";
import { PackingWithBooking, PackingParcel } from "@/types/packing";

export interface ScanResult {
  type: 'packing_id' | 'product_sku' | 'unknown';
  value: string;
  packingId?: string;
}

// ============== PARCEL (KOLLI) FUNCTIONS ==============

// Create a new parcel for a packing
export const createParcel = async (
  packingId: string, 
  createdBy: string
): Promise<PackingParcel> => {
  // Get current max parcel number
  const { data: existing } = await supabase
    .from('packing_parcels')
    .select('parcel_number')
    .eq('packing_id', packingId)
    .order('parcel_number', { ascending: false })
    .limit(1);

  const nextNumber = (existing && existing.length > 0) ? existing[0].parcel_number + 1 : 1;

  const { data, error } = await supabase
    .from('packing_parcels')
    .insert({
      packing_id: packingId,
      parcel_number: nextNumber,
      created_by: createdBy
    })
    .select()
    .single();

  if (error) throw error;
  return data as PackingParcel;
};

// Assign a packing list item to a parcel
export const assignItemToParcel = async (
  itemId: string, 
  parcelId: string | null
): Promise<void> => {
  const { error } = await supabase
    .from('packing_list_items')
    .update({ parcel_id: parcelId })
    .eq('id', itemId);

  if (error) throw error;
};

// Get all parcels for a packing
export const getParcelsByPacking = async (packingId: string): Promise<PackingParcel[]> => {
  const { data, error } = await supabase
    .from('packing_parcels')
    .select('*')
    .eq('packing_id', packingId)
    .order('parcel_number', { ascending: true });

  if (error) throw error;
  return (data || []) as PackingParcel[];
};

// Get parcel info for all items in a packing
export const getItemParcels = async (packingId: string): Promise<Record<string, number>> => {
  const { data: items } = await supabase
    .from('packing_list_items')
    .select('id, parcel_id')
    .eq('packing_id', packingId)
    .not('parcel_id', 'is', null);

  if (!items || items.length === 0) return {};

  const parcelIds = [...new Set(items.map(i => i.parcel_id).filter(Boolean))];
  
  const { data: parcels } = await supabase
    .from('packing_parcels')
    .select('id, parcel_number')
    .in('id', parcelIds);

  const parcelMap: Record<string, number> = {};
  (parcels || []).forEach((p: any) => {
    parcelMap[p.id] = p.parcel_number;
  });

  const itemParcelNumbers: Record<string, number> = {};
  items.forEach(item => {
    if (item.parcel_id && parcelMap[item.parcel_id]) {
      itemParcelNumbers[item.id] = parcelMap[item.parcel_id];
    }
  });

  return itemParcelNumbers;
};

// ============== EXISTING FUNCTIONS ==============

// Parse a scanned value to determine what type it is
export const parseScanResult = (scannedValue: string): ScanResult => {
  // Check if it's a packing verification URL
  const packingUrlMatch = scannedValue.match(/\/warehouse\/packing\/([a-f0-9-]+)\/verify/);
  if (packingUrlMatch) {
    return {
      type: 'packing_id',
      value: packingUrlMatch[1],
      packingId: packingUrlMatch[1]
    };
  }

  // Check if it's a UUID (packing ID directly)
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (uuidPattern.test(scannedValue)) {
    return {
      type: 'packing_id',
      value: scannedValue,
      packingId: scannedValue
    };
  }

  // Otherwise treat as product SKU
  return {
    type: 'product_sku',
    value: scannedValue
  };
};

// Fetch active packing projects (planning and in_progress)
export const fetchActivePackings = async (): Promise<PackingWithBooking[]> => {
  const { data: packings, error } = await supabase
    .from('packing_projects')
    .select('*')
    .in('status', ['planning', 'in_progress'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Fetch booking info for each packing
  const packingsWithBookings: PackingWithBooking[] = await Promise.all(
    (packings || []).map(async (packing) => {
      if (packing.booking_id) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
          .eq('id', packing.booking_id)
          .single();
        return { ...packing, booking } as PackingWithBooking;
      }
      return packing as PackingWithBooking;
    })
  );

  // Sort: in_progress first, then by nearest date, then the rest
  packingsWithBookings.sort((a, b) => {
    // in_progress first
    if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
    if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
    
    // Then by nearest date
    const dateA = a.booking?.rigdaydate || a.booking?.eventdate;
    const dateB = b.booking?.rigdaydate || b.booking?.eventdate;
    if (dateA && dateB) return new Date(dateA).getTime() - new Date(dateB).getTime();
    if (dateA) return -1;
    if (dateB) return 1;
    
    return 0;
  });

  return packingsWithBookings;
};

// Fetch packing list items for a specific packing (auto-generates if needed)
export const fetchPackingListItems = async (packingId: string) => {
  // First, get the packing to find booking_id
  const { data: packing, error: packingError } = await supabase
    .from('packing_projects')
    .select('booking_id')
    .eq('id', packingId)
    .single();

  if (packingError || !packing?.booking_id) {
    // No booking linked, just fetch existing items
    const { data, error } = await supabase
      .from('packing_list_items')
      .select(`
        *,
        booking_products (
          id, name, quantity, sku, notes,
          parent_product_id, parent_package_id, is_package_component
        )
      `)
      .eq('packing_id', packingId);
    
    if (error) throw error;
    return sortPackingItems(data || []);
  }

  const bookingId = packing.booking_id;

  // Check existing items count vs products count
  const [itemsCountResult, productsCountResult] = await Promise.all([
    supabase.from('packing_list_items').select('id', { count: 'exact', head: true }).eq('packing_id', packingId),
    supabase.from('booking_products').select('id', { count: 'exact', head: true }).eq('booking_id', bookingId)
  ]);

  const existingCount = itemsCountResult.count || 0;
  const productCount = productsCountResult.count || 0;

  // Auto-generate if no items exist
  if (existingCount === 0 && productCount > 0) {
    await generatePackingListItems(packingId, bookingId);
  } else if (existingCount < productCount) {
    // Sync missing items
    await syncMissingPackingItems(packingId, bookingId);
  }

  // Now fetch all items
  const { data, error } = await supabase
    .from('packing_list_items')
    .select(`
      *,
      booking_products (
        id, name, quantity, sku, notes,
        parent_product_id, parent_package_id, is_package_component
      )
    `)
    .eq('packing_id', packingId);

  if (error) throw error;
  return sortPackingItems(data || []);
};

// Generate packing list items from booking products
const generatePackingListItems = async (packingId: string, bookingId: string): Promise<void> => {
  const { data: products, error: productsError } = await supabase
    .from('booking_products')
    .select('id, quantity')
    .eq('booking_id', bookingId);

  if (productsError) throw productsError;
  if (!products || products.length === 0) return;

  const itemsToInsert = products.map(product => ({
    packing_id: packingId,
    booking_product_id: product.id,
    quantity_to_pack: product.quantity,
    quantity_packed: 0
  }));

  const { error: insertError } = await supabase
    .from('packing_list_items')
    .insert(itemsToInsert);

  if (insertError) throw insertError;
};

// Sync missing packing items (add new products without removing existing)
const syncMissingPackingItems = async (packingId: string, bookingId: string): Promise<void> => {
  const { data: products } = await supabase
    .from('booking_products')
    .select('id, quantity')
    .eq('booking_id', bookingId);

  const { data: existingItems } = await supabase
    .from('packing_list_items')
    .select('booking_product_id')
    .eq('packing_id', packingId);

  const existingProductIds = new Set((existingItems || []).map(i => i.booking_product_id));
  const productsToAdd = (products || []).filter(p => !existingProductIds.has(p.id));

  if (productsToAdd.length > 0) {
    const itemsToInsert = productsToAdd.map(product => ({
      packing_id: packingId,
      booking_product_id: product.id,
      quantity_to_pack: product.quantity,
      quantity_packed: 0
    }));

    await supabase.from('packing_list_items').insert(itemsToInsert);
  }
};

// Sort packing items: parents first with children underneath
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
  
  // Sort children: package components first, then accessories (↳)
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
  
  // Build ordered list: main product followed by its children
  const orderedItems: typeof items = [];
  mainProducts.forEach(main => {
    orderedItems.push(main);
    const parentId = main.booking_products?.id;
    if (parentId && childrenByParent[parentId]) {
      orderedItems.push(...childrenByParent[parentId]);
    }
  });
  
  // Add any orphaned children (parent not in list)
  const mainProductIds = new Set(mainProducts.map(m => m.booking_products?.id).filter(Boolean));
  Object.entries(childrenByParent).forEach(([parentId, children]) => {
    if (!mainProductIds.has(parentId)) {
      orderedItems.push(...children);
    }
  });
  
  return orderedItems;
};

// Verify a product by SKU
export const verifyProductBySku = async (
  packingId: string,
  sku: string,
  verifiedBy: string
): Promise<{ success: boolean; productName?: string; error?: string }> => {
  // Find the booking product with this SKU
  const { data: packingItems, error: fetchError } = await supabase
    .from('packing_list_items')
    .select(`
      id,
      quantity_to_pack,
      quantity_packed,
      verified_at,
      booking_products (
        id,
        name,
        sku
      )
    `)
    .eq('packing_id', packingId);

  if (fetchError) {
    return { success: false, error: 'Kunde inte hämta packlista' };
  }

  // Find item matching SKU
  const matchingItem = packingItems?.find(
    (item: any) => item.booking_products?.sku?.toLowerCase() === sku.toLowerCase()
  );

  if (!matchingItem) {
    return { success: false, error: `Ingen produkt med SKU "${sku}" hittades` };
  }

  // Check if already fully packed
  const currentPacked = matchingItem.quantity_packed || 0;
  if (currentPacked >= matchingItem.quantity_to_pack) {
    return { 
      success: false, 
      error: `${(matchingItem as any).booking_products?.name} är redan fullständigt packad (${currentPacked}/${matchingItem.quantity_to_pack})`,
      productName: (matchingItem as any).booking_products?.name
    };
  }

  // Increment quantity_packed by 1
  const newQuantity = currentPacked + 1;
  const isNowFull = newQuantity >= matchingItem.quantity_to_pack;
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('packing_list_items')
    .update({
      quantity_packed: newQuantity,
      packed_at: now,
      packed_by: verifiedBy,
      ...(isNowFull ? { verified_at: now, verified_by: verifiedBy } : {})
    })
    .eq('id', matchingItem.id);

  if (updateError) {
    return { success: false, error: 'Kunde inte uppdatera status' };
  }

  return { 
    success: true, 
    productName: `${(matchingItem as any).booking_products?.name} (${newQuantity}/${matchingItem.quantity_to_pack})`
  };
};

// Toggle a packing item manually (check/uncheck)
export const togglePackingItemManually = async (
  itemId: string,
  currentlyPacked: boolean,
  quantityToPack: number,
  verifiedBy: string
): Promise<{ success: boolean; error?: string }> => {
  const now = new Date().toISOString();
  
  if (currentlyPacked) {
    // Uncheck - reset to 0
    const { error } = await supabase
      .from('packing_list_items')
      .update({
        quantity_packed: 0,
        packed_at: null,
        packed_by: null,
        verified_at: null,
        verified_by: null
      })
      .eq('id', itemId);
    
    if (error) return { success: false, error: 'Kunde inte avmarkera' };
  } else {
    // Increment by 1
    // We need to fetch current value first
    const { data: currentItem } = await supabase
      .from('packing_list_items')
      .select('quantity_packed')
      .eq('id', itemId)
      .single();
    
    const currentPacked = currentItem?.quantity_packed || 0;
    const newQuantity = Math.min(currentPacked + 1, quantityToPack);
    const isNowFull = newQuantity >= quantityToPack;

    const { error } = await supabase
      .from('packing_list_items')
      .update({
        quantity_packed: newQuantity,
        packed_at: now,
        packed_by: verifiedBy,
        ...(isNowFull ? { verified_at: now, verified_by: verifiedBy } : {})
      })
      .eq('id', itemId);
    
    if (error) return { success: false, error: 'Kunde inte markera som packad' };
  }
  
  return { success: true };
};

// Get verification progress
export const getVerificationProgress = async (packingId: string) => {
  const { data, error } = await supabase
    .from('packing_list_items')
    .select('id, verified_at')
    .eq('packing_id', packingId);

  if (error) throw error;

  const total = data?.length || 0;
  const verified = data?.filter(item => item.verified_at !== null).length || 0;

  return {
    total,
    verified,
    percentage: total > 0 ? Math.round((verified / total) * 100) : 0
  };
};
