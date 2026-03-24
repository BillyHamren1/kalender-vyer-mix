import type { WmsSupplier } from "@/services/sharedSupplierService";
import type { ProjectSupplierLink } from "@/services/projectSupplierLinkService";

export type SupplierStatus = 'draft' | 'request_sent' | 'quote_received' | 'negotiating' | 'confirmed' | 'cancelled';

/**
 * @deprecated Use MergedSupplier instead. Kept for backward compatibility during migration.
 */
export interface ProjectSupplier {
  id: string;
  project_id: string;
  name: string;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  service_type: string | null;
  quoted_price: number | null;
  confirmed_price: number | null;
  currency: string;
  status: SupplierStatus;
  delivery_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Merged view combining WMS supplier master data with project-specific link data.
 * This is the primary type used in all UI components.
 */
export interface MergedSupplier {
  // Link fields (project-specific)
  id: string;              // project_supplier_links.id
  link_id: string;         // same as id, explicit alias
  project_id: string;
  supplier_id: string;     // WMS supplier UUID
  contact_id: string | null;
  service_type: string | null;
  quoted_price: number | null;
  confirmed_price: number | null;
  currency: string;
  status: SupplierStatus;
  delivery_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // WMS master data (read-only display)
  name: string;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Merge a project link with WMS supplier data into a unified view.
 */
export function mergeSupplierData(
  link: ProjectSupplierLink,
  wmsSupplier: WmsSupplier | null
): MergedSupplier {
  const primaryContact = wmsSupplier?.contacts?.find(c => c.is_primary) || wmsSupplier?.contacts?.[0];

  return {
    id: link.id,
    link_id: link.id,
    project_id: link.project_id,
    supplier_id: link.supplier_id,
    contact_id: link.contact_id,
    service_type: link.service_type,
    quoted_price: link.quoted_price,
    confirmed_price: link.confirmed_price,
    currency: link.currency,
    status: link.status as SupplierStatus,
    delivery_date: link.delivery_date,
    notes: link.notes,
    created_at: link.created_at,
    updated_at: link.updated_at,

    // WMS data
    name: wmsSupplier?.name ?? 'Okänd leverantör',
    company_name: wmsSupplier?.name ?? null,
    contact_person: primaryContact?.name ?? null,
    email: wmsSupplier?.email ?? primaryContact?.email ?? null,
    phone: wmsSupplier?.phone ?? primaryContact?.phone ?? null,
  };
}

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  draft: 'Utkast',
  request_sent: 'Förfrågan skickad',
  quote_received: 'Offert mottagen',
  negotiating: 'Förhandling',
  confirmed: 'Bekräftad',
  cancelled: 'Avbokad',
};

export const SUPPLIER_STATUS_ORDER: SupplierStatus[] = [
  'draft',
  'request_sent',
  'quote_received',
  'negotiating',
  'confirmed',
  'cancelled',
];

export const SERVICE_TYPES = [
  'Ljud',
  'Ljus',
  'Bild',
  'Transport',
  'Catering',
  'Möbler',
  'Dekor',
  'Säkerhet',
  'El & kraft',
  'Rigg',
  'Övrigt',
];
