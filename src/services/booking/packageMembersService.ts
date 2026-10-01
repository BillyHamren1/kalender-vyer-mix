import { supabase } from '@/integrations/supabase/client';
import type { WmsPackageRow } from '@/lib/booking/packageMembers';

/**
 * Läser ENDAST lagrets paketrader (paketrad + dess medlemmar) för bokningen.
 * Används bara för att visa paketinnehåll — aldrig som orderrader.
 */
export const fetchWmsPackageRows = async (bookingId: string): Promise<WmsPackageRow[]> => {
  const { data, error } = await supabase
    .from('booking_products')
    .select('id, name, quantity, sync_key, sort_index, inventory_package_id, parent_product_id, is_package_component')
    .eq('booking_id', bookingId)
    .like('sync_key', 'wms:%')
    .not('inventory_package_id', 'is', null)
    .is('source_missing_since', null);
  if (error) throw error;
  return (data ?? []) as WmsPackageRow[];
};
