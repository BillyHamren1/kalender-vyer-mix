import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PackingListItem, PackingWithBooking } from "@/types/packing";

// Fetch packing with booking info
const fetchPackingForList = async (packingId: string): Promise<PackingWithBooking | null> => {
  const { data: packing, error } = await supabase
    .from('packing_projects')
    .select('*')
    .eq('id', packingId)
    .maybeSingle();

  if (error) throw error;
  if (!packing) return null;

  if (packing.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
      .eq('id', packing.booking_id)
      .maybeSingle();
    return { ...packing, booking } as PackingWithBooking;
  }

  return packing as PackingWithBooking;
};

/**
 * Full sync: packing_list_items must exactly mirror booking_products.
 * - New products → insert
 * - Removed products → delete
 * - Changed quantity → update quantity_to_pack
 */
const fullSyncPackingListItems = async (
  packingId: string,
  bookingId: string
): Promise<{ added: number; removed: number; updated: number; addedProductIds: string[] }> => {
  // Fetch current booking products
  const { data: products, error: productsError } = await supabase
    .from('booking_products')
    .select('id, quantity')
    .eq('booking_id', bookingId);

  if (productsError) throw productsError;

  // Fetch existing packing list items
  const { data: existingItems, error: itemsError } = await supabase
    .from('packing_list_items')
    .select('id, booking_product_id, quantity_to_pack')
    .eq('packing_id', packingId);

  if (itemsError) throw itemsError;

  const productMap = new Map((products || []).map(p => [p.id, p]));
  const existingByProductId = new Map((existingItems || []).map(i => [i.booking_product_id, i]));

  let added = 0;
  let removed = 0;
  let updated = 0;
  const addedProductIds: string[] = [];

  // 1. Add missing items (new products)
  const productsToAdd = (products || []).filter(p => !existingByProductId.has(p.id));
  if (productsToAdd.length > 0) {
    const itemsToInsert = productsToAdd.map(product => ({
      packing_id: packingId,
      booking_product_id: product.id,
      quantity_to_pack: product.quantity,
      quantity_packed: 0
    }));

    const { error: insertError } = await supabase
      .from('packing_list_items')
      .insert(itemsToInsert);

    if (insertError) throw insertError;
    added = productsToAdd.length;
    addedProductIds.push(...productsToAdd.map(p => p.id));
  }

  // 2. Remove items whose product no longer exists in booking
  const itemsToRemove = (existingItems || []).filter(i => !productMap.has(i.booking_product_id));
  if (itemsToRemove.length > 0) {
    const idsToRemove = itemsToRemove.map(i => i.id);
    const { error: deleteError } = await supabase
      .from('packing_list_items')
      .delete()
      .in('id', idsToRemove);

    if (deleteError) throw deleteError;
    removed = itemsToRemove.length;
  }

  // 3. Update quantity_to_pack where product quantity changed
  for (const [productId, item] of existingByProductId) {
    const product = productMap.get(productId);
    if (product && product.quantity !== item.quantity_to_pack) {
      const { error: updateError } = await supabase
        .from('packing_list_items')
        .update({ quantity_to_pack: product.quantity })
        .eq('id', item.id);

      if (!updateError) updated++;
    }
  }

  return { added, removed, updated, addedProductIds };
};

// Fetch packing list items with product info
const fetchPackingListItems = async (packingId: string, bookingId: string | null): Promise<PackingListItem[]> => {
  // Always do a full sync before fetching to ensure packing list matches booking
  if (bookingId) {
    await fullSyncPackingListItems(packingId, bookingId);
  }

  // Fetch items
  const { data: items, error } = await supabase
    .from('packing_list_items')
    .select('*')
    .eq('packing_id', packingId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Fetch product info in ONE query
  const itemProductIds = Array.from(new Set((items || []).map(i => i.booking_product_id)));
  const productMap = new Map<string, { id: string; name: string; quantity: number; parent_product_id: string | null; sku: string | null }>();

  if (itemProductIds.length > 0) {
    const { data: products, error: productsError } = await supabase
      .from('booking_products')
      .select('id, name, quantity, parent_product_id, sku')
      .in('id', itemProductIds);

    if (productsError) throw productsError;
    (products || []).forEach((p) => productMap.set(p.id, p));
  }

  const itemsWithProducts: PackingListItem[] = (items || []).map((item) => {
    const product = productMap.get(item.booking_product_id);

    return {
      ...item,
      product: product
        ? {
            id: product.id,
            name: product.name,
            quantity: product.quantity,
            parent_product_id: product.parent_product_id,
            sku: product.sku,
          }
        : undefined,
      isOrphaned: false, // No more orphans - deleted items are removed
      isNewlyAdded: false,
    } as PackingListItem;
  });

  return itemsWithProducts;
};

// Update a packing list item
const updatePackingListItem = async (id: string, updates: Partial<PackingListItem>): Promise<void> => {
  const { product, created_at, ...updateData } = updates as PackingListItem;
  
  const { error } = await supabase
    .from('packing_list_items')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;
};

// Mark all items as packed
const markAllItemsPacked = async (packingId: string, packedBy: string): Promise<void> => {
  const { data: items, error: fetchError } = await supabase
    .from('packing_list_items')
    .select('id, quantity_to_pack')
    .eq('packing_id', packingId);

  if (fetchError) throw fetchError;

  const updates = (items || []).map(item => ({
    id: item.id,
    quantity_packed: item.quantity_to_pack,
    packed_by: packedBy,
    packed_at: new Date().toISOString()
  }));

  for (const update of updates) {
    const { id, ...data } = update;
    await supabase
      .from('packing_list_items')
      .update(data)
      .eq('id', id);
  }
};

export const usePackingList = (packingId: string) => {
  const queryClient = useQueryClient();

  const { data: packing, isLoading: isLoadingPacking } = useQuery({
    queryKey: ['packing-for-list', packingId],
    queryFn: () => fetchPackingForList(packingId),
    enabled: !!packingId
  });

  const bookingId = packing?.booking_id || null;
  const { data: items = [], isLoading: isLoadingItems } = useQuery({
    queryKey: ['packing-list-items', packingId, bookingId],
    queryFn: () => fetchPackingListItems(packingId, bookingId),
    enabled: !!packingId && !isLoadingPacking && !!bookingId
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<PackingListItem> }) =>
      updatePackingListItem(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-list-items', packingId] });
    },
    onError: () => toast.error('Kunde inte uppdatera artikel')
  });

  const markAllPackedMutation = useMutation({
    mutationFn: (packedBy: string) => markAllItemsPacked(packingId, packedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-list-items', packingId] });
      toast.success('Alla artiklar markerade som packade');
    },
    onError: () => toast.error('Kunde inte markera alla som packade')
  });

  // Sync now does a full sync (add + remove + update quantities)
  const syncPackingListMutation = useMutation({
    mutationFn: () => {
      if (!packing?.booking_id) throw new Error('No booking ID');
      return fullSyncPackingListItems(packingId, packing.booking_id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['packing-list-items', packingId] });
      const parts: string[] = [];
      if (result.added > 0) parts.push(`${result.added} tillagda`);
      if (result.removed > 0) parts.push(`${result.removed} borttagna`);
      if (result.updated > 0) parts.push(`${result.updated} uppdaterade`);
      if (parts.length > 0) {
        toast.success(`Packlista synkad: ${parts.join(', ')}`);
      } else {
        toast.success('Packlistan är redan uppdaterad');
      }
    },
    onError: () => toast.error('Kunde inte synka packlistan')
  });

  const refetchItems = async () => {
    await queryClient.invalidateQueries({ queryKey: ['packing-list-items', packingId] });
    await queryClient.invalidateQueries({ queryKey: ['packing-for-list', packingId] });
  };

  return {
    packing,
    items,
    isLoading: isLoadingPacking || isLoadingItems,
    updateItem: (id: string, updates: Partial<PackingListItem>) =>
      updateItemMutation.mutate({ id, updates }),
    markAllPacked: (packedBy: string) => markAllPackedMutation.mutate(packedBy),
    syncPackingList: () => syncPackingListMutation.mutate(),
    isSyncing: syncPackingListMutation.isPending,
    refetchItems
  };
};
