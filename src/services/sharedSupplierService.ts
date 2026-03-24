import { supabase } from "@/integrations/supabase/client";

/**
 * WMS Supplier from the central supplier-registry.
 * This is the source of truth for all supplier master data.
 */
export interface WmsSupplier {
  id: string;
  name: string;
  organization_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  organization_id: string;
  created_at: string;
  updated_at: string;
  contacts?: WmsSupplierContact[];
}

export interface WmsSupplierContact {
  id: string;
  supplier_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

type Action =
  | { action: "list_suppliers" }
  | { action: "search_suppliers"; q: string }
  | { action: "get_supplier"; supplier_id: string }
  | { action: "create_supplier"; payload: Partial<WmsSupplier> }
  | { action: "update_supplier"; supplier_id: string; payload: Partial<WmsSupplier> }
  | { action: "create_supplier_contact"; supplier_id: string; payload: Partial<WmsSupplierContact> }
  | { action: "update_supplier_contact"; contact_id: string; payload: Partial<WmsSupplierContact> };

async function callRegistry<T = any>(body: Action): Promise<T> {
  const { data, error } = await supabase.functions.invoke("supplier-registry-proxy", {
    body,
  });

  if (error) {
    throw new Error(`supplier-registry error: ${error.message}`);
  }

  return data as T;
}

export const listSuppliers = () =>
  callRegistry<WmsSupplier[]>({ action: "list_suppliers" });

export const searchSuppliers = (q: string) =>
  callRegistry<WmsSupplier[]>({ action: "search_suppliers", q });

export const getSupplier = (supplierId: string) =>
  callRegistry<WmsSupplier>({ action: "get_supplier", supplier_id: supplierId });

export const createSupplier = (payload: Partial<WmsSupplier>) =>
  callRegistry<WmsSupplier>({ action: "create_supplier", payload });

export const updateSupplier = (supplierId: string, payload: Partial<WmsSupplier>) =>
  callRegistry<WmsSupplier>({ action: "update_supplier", supplier_id: supplierId, payload });

export const createSupplierContact = (supplierId: string, payload: Partial<WmsSupplierContact>) =>
  callRegistry<WmsSupplierContact>({ action: "create_supplier_contact", supplier_id: supplierId, payload });

export const updateSupplierContact = (contactId: string, payload: Partial<WmsSupplierContact>) =>
  callRegistry<WmsSupplierContact>({ action: "update_supplier_contact", contact_id: contactId, payload });
