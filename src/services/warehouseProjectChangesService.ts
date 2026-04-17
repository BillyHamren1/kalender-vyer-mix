import { supabase } from '@/integrations/supabase/client';
import { WarehouseProjectChange } from '@/types/warehouseProjectChanges';

export const fetchWarehouseChanges = async (
  options: { warehouseProjectId?: string; onlyUnacknowledged?: boolean } = {}
): Promise<WarehouseProjectChange[]> => {
  let q = supabase
    .from('warehouse_project_changes' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (options.warehouseProjectId) q = q.eq('warehouse_project_id', options.warehouseProjectId);
  if (options.onlyUnacknowledged) q = q.eq('acknowledged', false);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as WarehouseProjectChange[];
};

export const acknowledgeWarehouseChange = async (id: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('warehouse_project_changes' as any)
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user?.id ?? null,
    } as any)
    .eq('id', id);
  if (error) throw error;
};

export const acknowledgeAllForProject = async (warehouseProjectId: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('warehouse_project_changes' as any)
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user?.id ?? null,
    } as any)
    .eq('warehouse_project_id', warehouseProjectId)
    .eq('acknowledged', false);
  if (error) throw error;
};
