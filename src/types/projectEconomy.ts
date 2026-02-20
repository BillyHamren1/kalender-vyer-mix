export interface ProjectBudget {
  id: string;
  project_id: string;
  budgeted_hours: number;
  hourly_rate: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPurchase {
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
}

export interface ProjectQuote {
  id: string;
  project_id: string;
  supplier: string;
  description: string;
  quoted_amount: number;
  quote_date: string | null;
  valid_until: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'invoiced';
  quote_file_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectInvoice {
  id: string;
  project_id: string;
  quote_id: string | null;
  supplier: string;
  invoice_number: string | null;
  invoiced_amount: number;
  invoice_date: string | null;
  due_date: string | null;
  status: 'unpaid' | 'paid' | 'disputed';
  invoice_file_url: string | null;
  notes: string | null;
  created_at: string;
}

export type LinkedCostType = 'product' | 'purchase' | 'budget' | null;

export interface SupplierInvoice {
  id: string;
  booking_id: string;
  given_number: string;
  invoice_data: {
    GivenNumber: string;
    SupplierName: string;
    InvoiceDate: string;
    DueDate: string;
    Total: number;
    Balance: number;
    Currency: string;
    YourReference: string;
  };
  linked_product_id: string | null;
  linked_cost_type: LinkedCostType;
  linked_cost_id: string | null;
  is_final_link: boolean;
  fetched_at: string;
}

export interface DetailedTimeReport {
  id: string;
  staff_id: string;
  staff_name: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  overtime_hours: number;
  hourly_rate: number;
  cost: number;
  approved: boolean;
}

export interface StaffTimeReport {
  staff_id: string;
  staff_name: string;
  total_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  overtime_rate: number;
  total_cost: number;
  approved: boolean;
  report_ids: string[];
  detailed_reports: DetailedTimeReport[];
}

export interface EconomySummary {
  budgetedHours: number;
  actualHours: number;
  hourlyRate: number;
  staffBudget: number;
  staffActual: number;
  staffDeviation: number;
  staffDeviationPercent: number;
  purchasesTotal: number;
  quotesTotal: number;
  invoicesTotal: number;
  invoiceDeviation: number;
  supplierInvoicesTotal: number;
  // Product cost budget (from Booking summary.costs)
  productCostBudget: number;
  totalBudget: number;
  totalActual: number;
  totalDeviation: number;
  totalDeviationPercent: number;
}

export type DeviationStatus = 'ok' | 'warning' | 'danger';

export const getDeviationStatus = (deviationPercent: number): DeviationStatus => {
  // Positive = under budget (good), negative = over budget (bad)
  if (deviationPercent >= 0) return 'ok';
  if (deviationPercent >= -10) return 'warning';
  return 'danger';
};

export const getDeviationColor = (status: DeviationStatus): string => {
  switch (status) {
    case 'ok': return 'text-green-600';
    case 'warning': return 'text-yellow-600';
    case 'danger': return 'text-red-600';
  }
};

export const getDeviationBgColor = (status: DeviationStatus): string => {
  switch (status) {
    case 'ok': return 'bg-green-100';
    case 'warning': return 'bg-yellow-100';
    case 'danger': return 'bg-red-100';
  }
};
