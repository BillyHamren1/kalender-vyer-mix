/**
 * useBookingProductsForPlanner
 * --------------------------------------------------------------------------
 * Read-only lista över orderrader (booking_products) för en specifik bokning,
 * avsedd för planeringsvyn inuti stora projekt. Möjliggör "+ To-do per rad".
 * Skriver ALDRIG till booking_products.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BookingProductForPlanner {
  id: string;
  name: string;
  quantity: number | null;
  notes: string | null;
  sku: string | null;
  parent_product_id: string | null;
  is_package_component: boolean | null;
  sort_index: number | null;
  total_price: number | null;
}

async function fetchBookingProducts(bookingId: string): Promise<BookingProductForPlanner[]> {
  const { data, error } = await supabase
    .from('booking_products')
    .select(
      'id,name,quantity,notes,sku,parent_product_id,is_package_component,sort_index,total_price',
    )
    .eq('booking_id', bookingId)
    .order('sort_index', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BookingProductForPlanner[];
}

export function useBookingProductsForPlanner(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ['booking-products-for-planner', bookingId ?? 'none'],
    queryFn: () => fetchBookingProducts(bookingId as string),
    enabled: !!bookingId,
    staleTime: 60_000,
  });
}
