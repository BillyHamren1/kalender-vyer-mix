export interface FortnoxInvoiceRow {
  Description: string;
  Quantity: number;
  Price: number;
  VAT: number;
  Discount?: number;
  Unit?: string;
  DiscountType?: 'PERCENT';
}

export interface FortnoxEmailInformation {
  InvoiceEmailAddress?: string;
}

export interface FortnoxInvoicePayload {
  CustomerNumber?: string;
  OurReference?: string;
  YourOrderNumber?: string;
  YourReference?: string;
  ExternalInvoiceReference1?: string;
  ExternalInvoiceReference2?: string;
  InvoiceDate: string;
  DueDate: string;
  DeliveryDate?: string;
  Currency?: string;
  TermsOfPayment?: string;
  VATIncluded?: boolean;
  Address1?: string;
  ZipCode?: string;
  City?: string;
  EmailInformation?: FortnoxEmailInformation;
  Remarks?: string;
  InvoiceRows: FortnoxInvoiceRow[];
}

export interface FortnoxClientData {
  id?: string;
  name: string;
  organization_number?: string;
  email?: string;
  billing_email?: string;
  phone?: string;
  address?: string;
  billing_address?: string;
  postal_code?: string;
  billing_postal_code?: string;
  city?: string;
  billing_city?: string;
}

export interface FortnoxInvoiceResponse {
  success: boolean;
  invoiceNumber?: string;
  fortnoxInvoiceId?: string;
  documentNumber?: string;
  customerNumber?: string;
  invoice?: Record<string, unknown>;
  error?: string;
}
