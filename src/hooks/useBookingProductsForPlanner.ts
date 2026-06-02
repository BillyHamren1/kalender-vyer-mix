/**
 * useBookingProductsForPlanner
 * --------------------------------------------------------------------------
 * Read-only lista över orderrader (booking_products) för en specifik bokning,
 * avsedd för planeringsvyn inuti stora projekt. Möjliggör "+ To-do per rad".
 * Skriver ALDRIG till booking_products.
 *
 * Planeringsvyn visar valbara orderrader för todos.
 * parent_product_id betyder bara "har förälder" och får inte dölja tillbehör.
 * Endast riktiga paketmedlemmar/expanderade package_components filtreras bort.
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
  parent_package_id: string | null;
  is_package_component: boolean | null;
  sort_index: number | null;
  total_price: number | null;
  inventory_package_id: string | null;
  inventory_item_type_id: string | null;
  package_components: unknown | null;
}

const cleanProductName = (name: string | null | undefined): string =>
  (name ?? '').trim();

const isAccessoryName = (name: string | null | undefined): boolean => {
  const trimmed = cleanProductName(name);
  return (
    trimmed.startsWith('↳') ||
    trimmed.startsWith('└') ||
    trimmed.startsWith('L,') ||
    trimmed.startsWith('└,') ||
    trimmed.startsWith('→')
  );
};

const isExpandedPackageComponentName = (name: string | null | undefined): boolean => {
  const trimmed = cleanProductName(name);
  return (
    trimmed.startsWith('--') ||
    trimmed.startsWith('-- ') ||
    trimmed.startsWith('⦿') ||
    trimmed.startsWith('  --')
  );
};

const isPackageMemberForPlanning = (p: BookingProductForPlanner): boolean => {
  const accessory = isAccessoryName(p.name);
  const expandedName = isExpandedPackageComponentName(p.name);

  // Tillbehör ska alltid kunna planeras, även om de har parent_product_id.
  // Därför får parent_product_id aldrig ensam dölja raden.
  if (accessory) return false;

  // Rader expanderade från package_components ska inte vara valbara todos.
  if (expandedName) return true;

  // Om raden har parent_package_id är det en stark signal att den är paketmedlem.
  if (p.parent_package_id) return true;

  // Om is_package_component är true och raden inte är ett namngivet tillbehör
  // betraktar vi den som intern paketmedlem.
  if (p.is_package_component === true) return true;

  return false;
};

async function fetchBookingProducts(bookingId: string): Promise<BookingProductForPlanner[]> {
  const { data, error } = await supabase
    .from('booking_products')
    .select(
      'id,name,quantity,notes,sku,parent_product_id,parent_package_id,is_package_component,sort_index,total_price,inventory_package_id,inventory_item_type_id,package_components',
    )
    .eq('booking_id', bookingId)
    .order('sort_index', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as BookingProductForPlanner[];
  return rows.filter((p) => !isPackageMemberForPlanning(p));
}

export function useBookingProductsForPlanner(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ['booking-products-for-planner', bookingId ?? 'none'],
    queryFn: () => fetchBookingProducts(bookingId as string),
    enabled: !!bookingId,
    staleTime: 60_000,
  });
}
