import { supabase } from "@/integrations/supabase/client";

/**
 * WMS Supplier from the central supplier-registry.
 * Mirrors the EXACT response from the WMS supplier-registry edge function.
 */
export interface WmsSupplier {
  id: string;
  name: string;
  short_name: string | null;
  color: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  contacts: WmsSupplierContact[];
}

export interface WmsSupplierContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
}

type Action =
  | { action: "list_suppliers" }
  | { action: "search_suppliers"; q: string }
  | { action: "get_supplier"; supplier_id: string }
  | { action: "create_supplier"; payload: Record<string, unknown> }
  | { action: "update_supplier"; supplier_id: string; payload: Record<string, unknown> }
  | { action: "create_supplier_contact"; supplier_id: string; payload: Record<string, unknown> }
  | { action: "update_supplier_contact"; contact_id: string; payload: Record<string, unknown> };

async function callRegistry<T = unknown>(body: Action): Promise<T> {
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

export const createSupplier = (payload: Record<string, unknown>) =>
  callRegistry<WmsSupplier>({ action: "create_supplier", payload });

export const updateSupplier = (supplierId: string, payload: Record<string, unknown>) =>
  callRegistry<WmsSupplier>({ action: "update_supplier", supplier_id: supplierId, payload });

export const createSupplierContact = (supplierId: string, payload: Record<string, unknown>) =>
  callRegistry<WmsSupplierContact>({ action: "create_supplier_contact", supplier_id: supplierId, payload });

export const updateSupplierContact = (contactId: string, payload: Record<string, unknown>) =>
  callRegistry<WmsSupplierContact>({ action: "update_supplier_contact", contact_id: contactId, payload });
