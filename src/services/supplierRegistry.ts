import { supabase } from "@/integrations/supabase/client";

export interface SupplierContact {
  id?: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  is_primary?: boolean;
  notes?: string | null;
}

export interface Supplier {
  id: string;
  external_id: string | null;
  name: string;
  short_name: string | null;
  color: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  primary_contact: SupplierContact | null;
  contacts: SupplierContact[];
  last_synced_at: string | null;
}

async function callProxy<T = any>(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("supplier-registry-proxy", {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (!data?.success) {
    const msg = data?.code || data?.error || "Okänt fel";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as { success: true; data: T };
}

export async function listLocalSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Supplier[];
}

export async function importSuppliersFromRegistry(): Promise<number> {
  const res = await callProxy<any[]>("list_suppliers", { limit: 1000 });
  return Array.isArray(res.data) ? res.data.length : 0;
}

export async function searchRemoteSuppliers(q: string) {
  return callProxy<any[]>("search_suppliers", { q, limit: 50 });
}

export async function createSupplier(payload: Partial<Supplier>) {
  return callProxy("create_supplier", { payload });
}

export async function updateSupplier(supplier_id: string, payload: Partial<Supplier>) {
  return callProxy("update_supplier", { supplier_id, payload });
}

export async function createContact(supplier_id: string, payload: SupplierContact) {
  return callProxy("create_supplier_contact", { supplier_id, payload });
}

export async function updateContact(contact_id: string, payload: Partial<SupplierContact>) {
  return callProxy("update_supplier_contact", { contact_id, payload });
}
