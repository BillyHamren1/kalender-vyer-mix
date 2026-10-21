import type { BatchEconomyData } from '@/services/planningApiService';
import { calculateEconomySummary } from '@/services/projectEconomyService';
import type { EconomySummary, StaffTimeReport } from '@/types/projectEconomy';
/**
 * Processes batch economy data for a single booking.
 * Returns summary + timeReports mapped to the standard StaffTimeReport shape.
 */
export function processEconomyBatchData(batchData: BatchEconomyData) {
  const budget = batchData.budget ?? null;
  const timeReportsRaw = batchData.time_reports ?? [];
  const purchases = batchData.purchases ?? [];
  const quotes = batchData.quotes ?? [];
  const invoices = batchData.invoices ?? [];
  const productCosts = batchData.product_costs ?? null;
  const supplierInvoices = Array.isArray(batchData.supplier_invoices) ? batchData.supplier_invoices : [];

  // Map time reports from external format to StaffTimeReport[]
  const staffMap = new Map<string, StaffTimeReport>();
  const reports = Array.isArray(timeReportsRaw) ? timeReportsRaw : [];

  reports.forEach((r: any) => {
    const staffId = r.staff_id || r.id || 'unknown';
    const staffName = r.staff_name || r.name || 'Okänd';
    const hours = Number(r.hours_worked) || Number(r.hours) || 0;
    const overtime = Number(r.overtime_hours) || 0;
    const rate = Number(r.hourly_rate) || 0;
    const overtimeRate = Number(r.overtime_rate) || rate * 1.5;

    const existing = staffMap.get(staffId);
    if (existing) {
      existing.total_hours += hours;
      existing.overtime_hours += overtime;
      existing.total_cost = existing.total_hours * existing.hourly_rate +
        existing.overtime_hours * existing.overtime_rate;
    } else {
      staffMap.set(staffId, {
        staff_id: staffId,
        staff_name: staffName,
        total_hours: hours,
        overtime_hours: overtime,
        hourly_rate: rate,
        overtime_rate: overtimeRate,
        total_cost: hours * rate + overtime * overtimeRate,
        approved: r.approved !== false,
        report_ids: [],
        detailed_reports: [],
      });
    }
  });

  const timeReports = Array.from(staffMap.values());

  // Map purchases to the expected shape
  const purchasesMapped = (Array.isArray(purchases) ? purchases : []).map((p: any) => ({
    ...p,
    amount: Number(p.amount) || 0,
  }));

  // Map quotes
  const quotesMapped = (Array.isArray(quotes) ? quotes : []).map((q: any) => ({
    ...q,
    quoted_amount: Number(q.quoted_amount) || 0,
  }));

  // Map invoices
  const invoicesMapped = (Array.isArray(invoices) ? invoices : []).map((i: any) => ({
    ...i,
    invoiced_amount: Number(i.invoiced_amount) || 0,
  }));

  const summary = calculateEconomySummary(
    budget,
    timeReports,
    purchasesMapped,
    quotesMapped,
    invoicesMapped,
    productCosts,
    Array.isArray(supplierInvoices) ? supplierInvoices : [],
  );

  // Economy is closed when all supplier invoices are final-linked (and at least one exists)
  const siList = Array.isArray(supplierInvoices) ? supplierInvoices : [];
  const economyClosed = siList.length > 0 && siList.every((si: any) => si.is_final_link === true);

  return { summary, timeReports, economyClosed };
}

export const emptySummary: EconomySummary = {
  budgetedHours: 0,
  actualHours: 0,
  hourlyRate: 0,
  staffBudget: 0,
  staffActual: 0,
  staffDeviation: 0,
  staffDeviationPercent: 0,
  purchasesTotal: 0,
  quotesTotal: 0,
  invoicesTotal: 0,
  invoiceDeviation: 0,
  supplierInvoicesTotal: 0,
  productCostBudget: 0,
  productRevenue: 0,
  totalBudget: 0,
  totalActual: 0,
  totalDeviation: 0,
  totalDeviationPercent: 0,
};


export function summarizeEconomyBatches(batches: BatchEconomyData[]) {
  const results = batches.map(processEconomyBatchData);
  if (results.length === 1) return results[0];
  const summary = { ...emptySummary };
  const additive = ['budgetedHours','actualHours','staffBudget','staffActual','purchasesTotal','quotesTotal','invoicesTotal','invoiceDeviation','supplierInvoicesTotal','productCostBudget','productRevenue','totalBudget','totalActual'] as const;
  for (const result of results) for (const field of additive) summary[field] += result.summary[field];
  summary.staffDeviation = summary.staffBudget - summary.staffActual;
  summary.staffDeviationPercent = summary.staffBudget > 0 ? summary.staffDeviation / summary.staffBudget * 100 : (summary.staffActual > 0 ? -100 : 0);
  summary.totalDeviation = summary.totalBudget - summary.totalActual;
  summary.totalDeviationPercent = summary.totalBudget > 0 ? summary.totalDeviation / summary.totalBudget * 100 : (summary.totalActual > 0 ? -100 : 0);
  return { summary, timeReports: results.flatMap(r => r.timeReports), economyClosed: results.length > 0 && results.every(r => r.economyClosed) };
}
