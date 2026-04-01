import { supabase } from '@/integrations/supabase/client';

export interface ProductCostOverride {
  id: string;
  project_id: string;
  product_id: string;
  booking_id: string | null;
  assembly_cost: number | null;
  handling_cost: number | null;
  purchase_cost: number | null;
  updated_at: string;
}

export async function fetchProductCostOverrides(projectId: string): Promise<ProductCostOverride[]> {
  const { data, error } = await supabase
    .from('product_cost_overrides' as any)
    .select('*')
    .eq('project_id', projectId);

  if (error) throw error;
  return (data || []) as any;
}

export async function upsertProductCostOverride(
  projectId: string,
  productId: string,
  costs: { assembly_cost?: number | null; handling_cost?: number | null; purchase_cost?: number | null },
  bookingId?: string | null,
): Promise<ProductCostOverride> {
  const { data, error } = await supabase
    .from('product_cost_overrides' as any)
    .upsert(
      {
        project_id: projectId,
        product_id: productId,
        booking_id: bookingId ?? null,
        ...costs,
      },
      { onConflict: 'project_id,product_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as any;
}

export async function deleteProductCostOverride(projectId: string, productId: string): Promise<void> {
  const { error } = await supabase
    .from('product_cost_overrides' as any)
    .delete()
    .eq('project_id', projectId)
    .eq('product_id', productId);

  if (error) throw error;
}
