import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PackingListItem, PackingWithBooking } from "@/types/packing";
import { isMultiBookingPacking, resolvePackingSyncBookingIds } from "@/lib/packing/resolvePackingSyncBookingIds";
import {
  comparePackingSnapshot,
  type PackingIntegrityProduct,
  type PackingIntegrityResult,
} from "@/lib/packing/packingIntegrity";

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

const fetchLinkedBookingIds = async (packingId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('packing_project_bookings')
    .select('booking_id')
    .eq('packing_id', packingId);

  if (error) throw error;
  return (data || []).map((row) => row.booking_id);
};

const fetchBookingGroups = async (linkedBookingIds: string[]): Promise<Map<string, { id: string; client: string; booking_number: string | null; eventdate: string | null; rigdaydate: string | null; rigdowndate: string | null }>> => {
  if (linkedBookingIds.length === 0) return new Map();

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, client, booking_number, eventdate, rigdaydate, rigdowndate')
    .in('id', linkedBookingIds);

  if (error) throw error;
  return new Map((bookings || []).map((booking) => [booking.id, booking]));
};

export interface BookingGroup {
  bookingId: string;
  client: string;
  bookingNumber: string | null;
  eventdate: string | null;
  rigdaydate: string | null;
  rigdowndate: string | null;
  items: PackingListItem[];
}

interface PackingListReadModel {
  items: PackingListItem[];
  bookingGroups: BookingGroup[];
  integrity: PackingIntegrityResult;
}

const PACKING_DIRECT_WRITE_ERROR = 'Packningsändringar måste gå via skannerappen';

// Compatibility guards kept intentionally: any legacy caller attempting a direct
// write fails closed. Operational mutations belong to scanner/control-count APIs.
const updatePackingListItem = async (_id: string, _updates: Partial<PackingListItem>): Promise<never> => {
  throw new Error(PACKING_DIRECT_WRITE_ERROR);
};

const markAllItemsPacked = async (): Promise<never> => {
  throw new Error(PACKING_DIRECT_WRITE_ERROR);
};

/**
 * READ-ONLY loader.
 *
 * IMPORTANT: Opening a packlist must never insert/update/delete operational
 * packing rows. We compare the current booking source with the frozen packing
 * snapshot and surface drift instead. Any real sync belongs to the official
 * booking→packing pipeline, never to a read query.
 */
const fetchPackingListReadModel = async (
  packingId: string,
  bookingIds: string[],
): Promise<PackingListReadModel> => {
  const { data: items, error: itemsError } = await supabase
    .from('packing_list_items')
    .select('*')
    .eq('packing_id', packingId)
    .order('created_at', { ascending: true });

  if (itemsError) throw itemsError;

  let products: PackingIntegrityProduct[] = [];
  if (bookingIds.length > 0) {
    const { data: sourceProducts, error: productsError } = await supabase
      .from('booking_products')
      .select('id, name, quantity, parent_product_id, sku, booking_id, source_missing_since')
      .in('booking_id', bookingIds);

    if (productsError) throw productsError;
    products = (sourceProducts || []) as PackingIntegrityProduct[];
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const itemsWithProducts: PackingListItem[] = (items || []).map((item) => {
    const product = item.booking_product_id ? productMap.get(item.booking_product_id) : undefined;
    return {
      ...item,
      product: product
        ? {
            id: product.id,
            name: product.name,
            quantity: product.quantity,
            parent_product_id: product.parent_product_id || null,
            sku: product.sku || null,
          }
        : undefined,
    } as PackingListItem;
  });

  let bookingGroups: BookingGroup[] = [];
  if (bookingIds.length > 1) {
    const bookingInfoMap = await fetchBookingGroups(bookingIds);
    const groupMap = new Map<string, PackingListItem[]>();

    itemsWithProducts.forEach((item) => {
      const product = item.booking_product_id ? productMap.get(item.booking_product_id) : undefined;
      const bookingId = product?.booking_id;
      if (!bookingId) return;
      const bucket = groupMap.get(bookingId) || [];
      bucket.push(item);
      groupMap.set(bookingId, bucket);
    });

    bookingGroups = bookingIds.map((bookingId) => {
      const info = bookingInfoMap.get(bookingId);
      return {
        bookingId,
        client: info?.client || 'Okänd',
        bookingNumber: info?.booking_number || null,
        eventdate: info?.eventdate || null,
        rigdaydate: info?.rigdaydate || null,
        rigdowndate: info?.rigdowndate || null,
        items: groupMap.get(bookingId) || [],
      };
    });
  }

  return {
    items: itemsWithProducts,
    bookingGroups,
    integrity: comparePackingSnapshot(products, items || [], bookingIds.length > 0),
  };
};

export const usePackingList = (packingId: string) => {
  const queryClient = useQueryClient();

  const { data: packing, isLoading: isLoadingPacking } = useQuery({
    queryKey: ['packing-for-list', packingId],
    queryFn: () => fetchPackingForList(packingId),
    enabled: !!packingId,
  });

  const { data: linkedBookingIds = [], isLoading: isLoadingLinks } = useQuery({
    queryKey: ['packing-linked-bookings', packingId],
    queryFn: () => fetchLinkedBookingIds(packingId),
    enabled: !!packingId,
  });

  const bookingId = packing?.booking_id || null;
  const bookingIds = resolvePackingSyncBookingIds(bookingId, linkedBookingIds);
  const isMultiBooking = isMultiBookingPacking(bookingId, linkedBookingIds);

  const { data: listData, isLoading: isLoadingItems, error: listError } = useQuery({
    queryKey: ['packing-list-read-model', packingId, ...bookingIds],
    queryFn: () => fetchPackingListReadModel(packingId, bookingIds),
    enabled: !!packingId && !isLoadingPacking && !isLoadingLinks,
  });

  const refetchItems = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['packing-list-read-model', packingId] }),
      queryClient.invalidateQueries({ queryKey: ['packing-for-list', packingId] }),
      queryClient.invalidateQueries({ queryKey: ['packing-linked-bookings', packingId] }),
    ]);
  };

  return {
    packing,
    items: listData?.items || [],
    bookingGroups: listData?.bookingGroups || [],
    integrity: listData?.integrity || null,
    integrityError: listError instanceof Error ? listError : listError ? new Error(String(listError)) : null,
    isMultiBooking,
    linkedBookingIds,
    isLoading: isLoadingPacking || isLoadingLinks || isLoadingItems,
    // Legacy verification route is intentionally fail-closed. It must not write
    // directly to packing_list_items outside scanner/control-count sessions.
    updateItem: (id: string, updates: Partial<PackingListItem>) => {
      void updatePackingListItem(id, updates).catch(() => {
        toast.error('Verifiering måste göras via kontrollräkning/skannerflödet.');
      });
    },
    refetchItems,
  };
};
