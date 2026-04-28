import { supabase } from '@/integrations/supabase/client';

export type CostCategory = 'purchase' | 'handling' | 'assembly' | 'other';

export interface CostLine {
  id: string;
  large_project_id: string;
  category: CostCategory;
  description: string;
  supplier: string | null;
  cost_date: string | null;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchCostLines(largeProjectId: string): Promise<CostLine[]> {
  const { data, error } = await supabase
    .from('large_project_cost_lines' as any)
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as CostLine[];
}

export async function createCostLine(input: {
  large_project_id: string;
  category: CostCategory;
  description?: string;
  supplier?: string | null;
  cost_date?: string | null;
  amount?: number;
  notes?: string | null;
}): Promise<CostLine> {
  const { data, error } = await supabase
    .from('large_project_cost_lines' as any)
    .insert({
      large_project_id: input.large_project_id,
      category: input.category,
      description: input.description ?? '',
      supplier: input.supplier ?? null,
      cost_date: input.cost_date ?? null,
      amount: input.amount ?? 0,
      notes: input.notes ?? null,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as CostLine;
}

export async function updateCostLine(id: string, updates: Partial<Omit<CostLine, 'id' | 'large_project_id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const { error } = await supabase
    .from('large_project_cost_lines' as any)
    .update(updates as any)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCostLine(id: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_cost_lines' as any)
    .delete()
    .eq('id', id);
  if (error) throw error;
}
