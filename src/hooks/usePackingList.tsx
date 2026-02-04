import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PackingListItem, PackingWithBooking } from "@/types/packing";

const NEW_ITEMS_STORAGE_KEY = (packingId: string) => `packing_list:new_items:${packingId}`;

type NewItemsStoragePayload = {
  ts: number;
  productIds: string[];
};

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
      .select('id, client, eventdate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
      .eq('id', packing.booking_id)
      .maybeSingle();
    return { ...packing, booking } as PackingWithBooking;
  }

  return packing as PackingWithBooking;
};

// Fetch packing list items with product info
const fetchPackingListItems = async (packingId: string, bookingId: string | null): Promise<PackingListItem[]> => {
  // First check if items exist
  const { data: existingItems, error: checkError } = await supabase
    .from('packing_list_items')
    .select('id')
    .eq('packing_id', packingId)
    .limit(1);

  if (checkError) throw checkError;

  // If no items exist and we have a booking, generate them
  if (existingItems?.length === 0 && bookingId) {
    await generatePackingListItems(packingId, bookingId);
  }

  // Fetch items with product info
  const { data: items, error } = await supabase
    .from('packing_list_items')
    .select('*')
    .eq('packing_id', packingId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Get all current booking product IDs to detect orphaned items
  let currentProductIds = new Set<string>();
  if (bookingId) {
    const { data: currentProducts, error: currentError } = await supabase
      .from('booking_products')
      .select('id')
      .eq('booking_id', bookingId);

    if (currentError) throw currentError;
    currentProductIds = new Set((currentProducts || []).map(p => p.id));
  }

  // Fetch product info in ONE query (avoid N+1 for large lists)
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

  // Load newly-added IDs (written by sync) so we can highlight them deterministically
  let newlyAddedIds = new Set<string>();
  try {
    const raw = localStorage.getItem(NEW_ITEMS_STORAGE_KEY(packingId));
    if (raw) {
      const parsed = JSON.parse(raw) as NewItemsStoragePayload;
      // keep it short-lived (15 min)
      if (parsed?.ts && Date.now() - parsed.ts < 15 * 60 * 1000) {
        newlyAddedIds = new Set(parsed.productIds || []);
      }
      // clear after first read so it doesn't stick forever
      localStorage.removeItem(NEW_ITEMS_STORAGE_KEY(packingId));
    }
  } catch {
    // ignore storage errors
  }

  const itemsWithProducts: PackingListItem[] = (items || []).map((item) => {
    const product = productMap.get(item.booking_product_id);
    const isOrphaned = bookingId ? !currentProductIds.has(item.booking_product_id) : false;

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
      // If product row is missing, we still want to show the packing list item as orphaned
      isOrphaned: isOrphaned || !product,
      isNewlyAdded: newlyAddedIds.has(item.booking_product_id),
    } as PackingListItem;
  });

  return sortPackingListItemsWithStatus(itemsWithProducts);
};

// Sort items: new first, main products, accessories grouped, orphaned last
const sortPackingListItemsWithStatus = (items: PackingListItem[]): PackingListItem[] => {
  // Separate orphaned items
  const activeItems = items.filter(i => !i.isOrphaned);
  const orphanedItems = items.filter(i => i.isOrphaned);

  // Sort active items by parent hierarchy
  const mainProducts: PackingListItem[] = [];
  const accessoriesByParent: Record<string, PackingListItem[]> = {};

  activeItems.forEach(item => {
    const parentId = item.product?.parent_product_id;
    if (parentId) {
      if (!accessoriesByParent[parentId]) {
        accessoriesByParent[parentId] = [];
      }
      accessoriesByParent[parentId].push(item);
    } else {
      mainProducts.push(item);
    }
  });

  // Sort main products: new ones first
  mainProducts.sort((a, b) => {
    if (a.isNewlyAdded && !b.isNewlyAdded) return -1;
    if (!a.isNewlyAdded && b.isNewlyAdded) return 1;
    return 0;
  });

  // Build sorted list
  const sorted: PackingListItem[] = [];
  mainProducts.forEach(main => {
    sorted.push(main);
    if (main.product && accessoriesByParent[main.product.id]) {
      sorted.push(...accessoriesByParent[main.product.id]);
    }
  });

  // Append orphaned items at the very end
  sorted.push(...orphanedItems);

  return sorted;
};

// Generate packing list items from booking products
const generatePackingListItems = async (packingId: string, bookingId: string): Promise<void> => {
  // Fetch all products for this booking
  const { data: products, error: productsError } = await supabase
    .from('booking_products')
    .select('id, quantity')
    .eq('booking_id', bookingId);

  if (productsError) throw productsError;
  if (!products || products.length === 0) return;

  // Create packing list items for each product
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

// Sync packing list items with current booking products (add missing only)
// NOTE: Removed products should NOT be deleted from packing_list_items; they are shown at the bottom as orphaned.
const syncPackingListItems = async (
  packingId: string,
  bookingId: string
): Promise<{ added: number; addedProductIds: string[]; orphaned: number }> => {
  // Fetch all current booking products
  const { data: products, error: productsError } = await supabase
    .from('booking_products')
    .select('id, quantity')
    .eq('booking_id', bookingId);

  if (productsError) throw productsError;
  
  // Fetch existing packing list items
  const { data: existingItems, error: itemsError } = await supabase
    .from('packing_list_items')
    .select('id, booking_product_id')
    .eq('packing_id', packingId);

  if (itemsError) throw itemsError;

  const productIds = new Set((products || []).map(p => p.id));
  const existingProductIds = new Set((existingItems || []).map(i => i.booking_product_id));

  // Find products that need new packing list items
  const productsToAdd = (products || []).filter(p => !existingProductIds.has(p.id));
  
  // Count orphaned items (kept, but shown at bottom)
  const orphanedItems = (existingItems || []).filter(i => !productIds.has(i.booking_product_id));

  let added = 0;
  const addedProductIds: string[] = [];

  // Add missing items
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

  return { added, addedProductIds, orphaned: orphanedItems.length };
};

// Update a packing list item
const updatePackingListItem = async (id: string, updates: Partial<PackingListItem>): Promise<void> => {
  // Remove readonly fields
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

  // Fetch packing
  const { data: packing, isLoading: isLoadingPacking } = useQuery({
    queryKey: ['packing-for-list', packingId],
    queryFn: () => fetchPackingForList(packingId),
    enabled: !!packingId
  });

  // Fetch items - wait for packing to be loaded AND have a booking_id
  const bookingId = packing?.booking_id || null;
  const { data: items = [], isLoading: isLoadingItems } = useQuery({
    queryKey: ['packing-list-items', packingId, bookingId],
    queryFn: () => fetchPackingListItems(packingId, bookingId),
    enabled: !!packingId && !isLoadingPacking && !!bookingId
  });

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<PackingListItem> }) =>
      updatePackingListItem(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-list-items', packingId] });
    },
    onError: () => toast.error('Kunde inte uppdatera artikel')
  });

  // Mark all packed mutation
  const markAllPackedMutation = useMutation({
    mutationFn: (packedBy: string) => markAllItemsPacked(packingId, packedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-list-items', packingId] });
      toast.success('Alla artiklar markerade som packade');
    },
    onError: () => toast.error('Kunde inte markera alla som packade')
  });

  // Sync packing list mutation
  const syncPackingListMutation = useMutation({
    mutationFn: () => {
      if (!packing?.booking_id) throw new Error('No booking ID');
      return syncPackingListItems(packingId, packing.booking_id);
    },
    onSuccess: (result) => {
      // Store newly added IDs so the next fetch can highlight them
      if (result.addedProductIds.length > 0) {
        try {
          const payload: NewItemsStoragePayload = {
            ts: Date.now(),
            productIds: result.addedProductIds,
          };
          localStorage.setItem(NEW_ITEMS_STORAGE_KEY(packingId), JSON.stringify(payload));
        } catch {
          // ignore
        }
      }
      queryClient.invalidateQueries({ queryKey: ['packing-list-items', packingId] });
    },
    onError: () => toast.error('Kunde inte synka packlistan')
  });

  // Refetch items
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
