export type SupplierStatus = 'draft' | 'request_sent' | 'quote_received' | 'negotiating' | 'confirmed' | 'cancelled';

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
