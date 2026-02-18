
export interface BookingProduct {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  unitPrice?: number;
  totalPrice?: number;
  parentProductId?: string;
  isPackageComponent?: boolean;
  parentPackageId?: string;
  sku?: string;
  // Cost fields for budget calculation
  laborCost?: number;
  materialCost?: number;
  setupHours?: number;
  externalCost?: number;
  costNotes?: string;
}

export interface BookingAttachment {
  id: string;
  url: string;
  fileName: string;
  fileType: string;
}

export interface BookingEconomicsLineItem {
  product_name: string;
  quantity: number;
  total_revenue: number;
  assembly_cost: number;
  handling_cost: number;
  purchase_cost: number;
  total_cost: number;
}

export interface BookingEconomics {
  // New API format
  revenue?: { total_ex_vat?: number; currency?: string };
  costs?: { assembly?: number; handling?: number; purchase?: number; total?: number };
  margin?: { gross?: number; pct?: number };
  line_items?: BookingEconomicsLineItem[];
  // Legacy format (backward compat)
  total_revenue_ex_vat?: number;
  total_assembly_cost?: number;
  total_handling_cost?: number;
  total_purchase_cost?: number;
  total_costs?: number;
  gross_margin?: number;
  margin_pct?: number;
}

export interface Booking {
  id: string;
  bookingNumber?: string;
  client: string;
  rigDayDate: string;
  eventDate: string;
  rigDownDate: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryPostalCode?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  carryMoreThan10m?: boolean;
  groundNailsAllowed?: boolean;
  exactTimeNeeded?: boolean;
  exactTimeInfo?: string;
  products?: BookingProduct[];
  internalNotes?: string;
  attachments?: BookingAttachment[];
  viewed: boolean;
  status: string;
  assignedProjectId?: string;
  assignedProjectName?: string;
  assignedToProject?: boolean;
  largeProjectId?: string;
  mapDrawingUrl?: string;
  economics?: BookingEconomics | null;
}
