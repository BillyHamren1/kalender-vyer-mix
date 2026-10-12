import { supabase } from '@/integrations/supabase/client';

export interface InternalWarehouseIdentity {
  id: string;
  organization_id: string;
  name: string;
  is_internal: boolean;
  booking_id: string | null;
}

/** The permanent Lager activity is identified by its warehouse booking, never its name. */
export async function fetchInternalWarehouseIdentity(): Promise<InternalWarehouseIdentity | null> {
  // RLS supplies the session's organization scope. An inner join is essential:
  // a filtered embedded booking alone would leave unrelated projects in the result.
  const { data, error } = await supabase
    .from('projects')
    .select('id, organization_id, name, is_internal, booking_id, warehouse_booking:bookings!projects_booking_id_fkey!inner(is_internal, internal_type)')
    .eq('is_internal', true)
    .is('deleted_at', null)
    .eq('warehouse_booking.is_internal', true)
    .eq('warehouse_booking.internal_type', 'warehouse')
    .limit(2);
  if (error) throw error;
  if ((data?.length ?? 0) > 1) {
    throw new Error('Flera Lagerprojekt hittades. Lagerkopplingen måste rättas innan arbetet kan fortsätta.');
  }
  return data?.[0] ?? null;
}
