import { supabase } from "@/integrations/supabase/client";
import type { SupplierStatus } from "@/types/supplier";

export interface ProjectSupplierLink {
  id: string;
  project_id: string;
  supplier_id: string;
  contact_id: string | null;
  service_type: string | null;
  quoted_price: number | null;
  confirmed_price: number | null;
  currency: string;
  status: SupplierStatus;
  delivery_date: string | null;
  notes: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export const fetchProjectSupplierLinks = async (projectId: string): Promise<ProjectSupplierLink[]> => {
  const { data, error } = await supabase
    .from('project_supplier_links')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ProjectSupplierLink[];
};

export const createProjectSupplierLink = async (link: {
  project_id: string;
  supplier_id: string;
  contact_id?: string | null;
  service_type?: string | null;
  quoted_price?: number | null;
  confirmed_price?: number | null;
  currency?: string;
  status?: SupplierStatus;
  delivery_date?: string | null;
  notes?: string | null;
}): Promise<ProjectSupplierLink> => {
  // organization_id is auto-filled by the set_organization_id trigger
  const { data, error } = await supabase
    .from('project_supplier_links')
    .insert({ ...link, organization_id: '' } as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as ProjectSupplierLink;
};

export const updateProjectSupplierLink = async (
  id: string,
  updates: Partial<Omit<ProjectSupplierLink, 'id' | 'project_id' | 'supplier_id' | 'organization_id' | 'created_at' | 'updated_at'>>
): Promise<void> => {
  const { error } = await supabase
    .from('project_supplier_links')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
};

export const deleteProjectSupplierLink = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('project_supplier_links')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const updateSupplierLinkStatus = async (id: string, status: SupplierStatus): Promise<void> => {
  return updateProjectSupplierLink(id, { status });
};
