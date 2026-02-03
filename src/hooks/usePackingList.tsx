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
    .single();

  if (error) throw error;
  if (!packing) return null;

  if (packing.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, client, eventdate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
      .eq('id', packing.booking_id)
      .single();
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

  // Fetch product info for each item
  const itemsWithProducts: PackingListItem[] = await Promise.all(
    (items || []).map(async (item) => {
      const { data: product } = await supabase
        .from('booking_products')
        .select('id, name, quantity, parent_product_id, sku, is_package_component, parent_package_id')
        .eq('id', item.booking_product_id)
        .single();

      return {
        ...item,
        product: product ? {
          id: product.id,
          name: product.name,
          quantity: product.quantity,
          parent_product_id: product.parent_product_id,
          sku: product.sku,
          is_package_component: product.is_package_component,
          parent_package_id: product.parent_package_id
        } : undefined
      } as PackingListItem;
    })
  );

  // Sort: main products first, then accessories grouped under their parent
  return sortPackingListItems(itemsWithProducts);
};

// Sort items: main products first, then children (both accessories and package components)
const sortPackingListItems = (items: PackingListItem[]): PackingListItem[] => {
  const mainProducts: PackingListItem[] = [];
  const childrenByParent: Record<string, PackingListItem[]> = {};

  items.forEach(item => {
    // Use parent_product_id for ALL child items (accessories + components)
    const parentId = item.product?.parent_product_id;

    if (parentId) {
      if (!childrenByParent[parentId]) {
        childrenByParent[parentId] = [];
      }
      childrenByParent[parentId].push(item);
    } else {
      mainProducts.push(item);
    }
  });

  // Build sorted list
  const sorted: PackingListItem[] = [];
  mainProducts.forEach(main => {
    sorted.push(main);
    if (main.product && childrenByParent[main.product.id]) {
      sorted.push(...childrenByParent[main.product.id]);
    }
  });

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

  // Fetch items
  const { data: items = [], isLoading: isLoadingItems } = useQuery({
    queryKey: ['packing-list-items', packingId],
    queryFn: () => fetchPackingListItems(packingId, packing?.booking_id || null),
    enabled: !!packingId && !!packing?.booking_id,
    staleTime: 30000,
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

  return {
    packing,
    items,
    isLoading: isLoadingPacking || isLoadingItems,
    updateItem: (id: string, updates: Partial<PackingListItem>) =>
      updateItemMutation.mutate({ id, updates }),
    markAllPacked: (packedBy: string) => markAllPackedMutation.mutate(packedBy)
  };
};
