import { supabase } from '@/integrations/supabase/client';

// ===== Project Budget (local Supabase) =====

export interface LocalProjectBudget {
  id: string;
  project_id: string;
  budgeted_hours: number;
  hourly_rate: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchLocalProjectBudget(projectId: string): Promise<LocalProjectBudget | null> {
  const { data, error } = await supabase
    .from('project_budget' as any)
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as any;
}

export async function upsertLocalProjectBudget(budget: {
  project_id: string;
  budgeted_hours: number;
  hourly_rate: number;
  description?: string;
}): Promise<LocalProjectBudget> {
  const { data, error } = await supabase
    .from('project_budget' as any)
    .upsert(budget, { onConflict: 'project_id' })
    .select()
    .single();

  if (error) throw error;
  return data as any;
}

// ===== Project Purchases (local Supabase) =====

export interface LocalProjectPurchase {
  id: string;
  project_id: string;
  description: string;
  supplier: string | null;
  amount: number;
  purchase_date: string | null;
  receipt_url: string | null;
  category: string | null;
  created_by: string | null;
  created_at: string;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
}

export async function fetchLocalProjectPurchases(projectId: string): Promise<LocalProjectPurchase[]> {
  const { data, error } = await supabase
    .from('project_purchases' as any)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as any;
}

export async function createLocalProjectPurchase(purchase: {
  project_id: string;
  description: string;
  amount: number;
  supplier?: string;
  category?: string;
  purchase_date?: string;
  receipt_url?: string;
  created_by?: string;
}): Promise<LocalProjectPurchase> {
  const { data, error } = await supabase
    .from('project_purchases' as any)
    .insert(purchase)
    .select()
    .single();

  if (error) throw error;
  return data as any;
}

export async function updateLocalProjectPurchase(
  id: string,
  updates: Partial<{
    description: string;
    amount: number;
    supplier: string | null;
    category: string | null;
    purchase_date: string | null;
    receipt_url: string | null;
  }>
): Promise<void> {
  const { error } = await supabase
    .from('project_purchases' as any)
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteLocalProjectPurchase(id: string): Promise<void> {
  const { error } = await supabase
    .from('project_purchases' as any)
    .delete()
    .eq('id', id);

  if (error) throw error;
}
