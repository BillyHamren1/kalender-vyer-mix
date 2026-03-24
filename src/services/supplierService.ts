import { supabase } from "@/integrations/supabase/client";
import type { ProjectSupplier, SupplierStatus } from "@/types/supplier";

export const fetchProjectSuppliers = async (projectId: string): Promise<ProjectSupplier[]> => {
  const { data, error } = await supabase
    .from('project_suppliers')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ProjectSupplier[];
};

export const createProjectSupplier = async (supplier: {
  project_id: string;
  name: string;
  company_name?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  service_type?: string | null;
  quoted_price?: number | null;
  currency?: string;
  delivery_date?: string | null;
  notes?: string | null;
}): Promise<ProjectSupplier> => {
  const { data, error } = await supabase
    .from('project_suppliers')
    .insert(supplier)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as ProjectSupplier;
};

export const updateProjectSupplier = async (
  id: string,
  updates: Partial<Omit<ProjectSupplier, 'id' | 'project_id' | 'created_at' | 'updated_at'>>
): Promise<void> => {
  const { error } = await supabase
    .from('project_suppliers')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
};

export const deleteProjectSupplier = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('project_suppliers')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const updateSupplierStatus = async (id: string, status: SupplierStatus): Promise<void> => {
  return updateProjectSupplier(id, { status });
};
