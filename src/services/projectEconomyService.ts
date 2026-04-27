import { supabase } from '@/integrations/supabase/client';
import type { 
  ProjectBudget, 
  ProjectPurchase, 
  ProjectQuote, 
  ProjectInvoice,
  StaffTimeReport,
  EconomySummary
} from '@/types/projectEconomy';
import type { ProductCostSummary } from '@/services/productCostService';

// Budget operations
export const fetchProjectBudget = async (projectId: string): Promise<ProjectBudget | null> => {
  const { data, error } = await supabase
    .from('project_budget')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  
  if (error) throw error;
  return data;
};

export const upsertProjectBudget = async (
  projectId: string, 
  budget: { budgeted_hours: number; hourly_rate: number; description?: string }
): Promise<ProjectBudget> => {
  const { data, error } = await supabase
    .from('project_budget')
    .upsert({
      project_id: projectId,
      budgeted_hours: budget.budgeted_hours,
      hourly_rate: budget.hourly_rate,
      description: budget.description || null,
    }, { onConflict: 'project_id' })
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

// Purchase operations
export const fetchProjectPurchases = async (projectId: string): Promise<ProjectPurchase[]> => {
  const { data, error } = await supabase
    .from('project_purchases')
    .select('*')
    .eq('project_id', projectId)
    .order('purchase_date', { ascending: false });
  
  if (error) throw error;
  return data || [];
};

export const createProjectPurchase = async (
  purchase: Omit<ProjectPurchase, 'id' | 'created_at'>
): Promise<ProjectPurchase> => {
  const { data, error } = await supabase
    .from('project_purchases')
    .insert(purchase)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const deleteProjectPurchase = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('project_purchases')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// Quote operations
export const fetchProjectQuotes = async (projectId: string): Promise<ProjectQuote[]> => {
  const { data, error } = await supabase
    .from('project_quotes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data || []) as ProjectQuote[];
};

export const createProjectQuote = async (
  quote: Omit<ProjectQuote, 'id' | 'created_at' | 'updated_at'>
): Promise<ProjectQuote> => {
  const { data, error } = await supabase
    .from('project_quotes')
    .insert(quote)
    .select()
    .single();
  
  if (error) throw error;
  return data as ProjectQuote;
};

export const updateProjectQuote = async (
  id: string, 
  updates: Partial<ProjectQuote>
): Promise<void> => {
  const { error } = await supabase
    .from('project_quotes')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
};

export const deleteProjectQuote = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('project_quotes')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// Invoice operations
export const fetchProjectInvoices = async (projectId: string): Promise<ProjectInvoice[]> => {
  const { data, error } = await supabase
    .from('project_invoices')
    .select('*')
    .eq('project_id', projectId)
    .order('invoice_date', { ascending: false });
  
  if (error) throw error;
  return (data || []) as ProjectInvoice[];
};

export const createProjectInvoice = async (
  invoice: Omit<ProjectInvoice, 'id' | 'created_at'>
): Promise<ProjectInvoice> => {
  const { data, error } = await supabase
    .from('project_invoices')
    .insert(invoice)
    .select()
    .single();
  
  if (error) throw error;
  return data as ProjectInvoice;
};

export const updateProjectInvoice = async (
  id: string, 
  updates: Partial<ProjectInvoice>
): Promise<void> => {
  const { error } = await supabase
    .from('project_invoices')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
};

export const deleteProjectInvoice = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('project_invoices')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// Time reports - fetched via booking_id
// Rate priority: completion_staff snapshot > staff_members current rate
export const fetchProjectTimeReports = async (bookingId: string): Promise<StaffTimeReport[]> => {
  // Fetch time reports with current staff rates
  const { data, error } = await supabase
    .from('time_reports')
    .select(`
      id,
      staff_id,
      hours_worked,
      overtime_hours,
      approved,
      report_date,
      start_time,
      end_time,
      staff_members!inner(name, hourly_rate, overtime_rate)
    `)
    .eq('booking_id', bookingId)
    .eq('is_subdivision', false)
    .order('report_date', { ascending: true });
  
  if (error) throw error;

  // Fetch historical rate snapshots from completion_staff (if any exist for this booking)
  const { data: completionStaff } = await supabase
    .from('completion_staff')
    .select('staff_id, hourly_rate, work_date')
    .eq('completion_id', bookingId);

  // Build a map of staff_id → snapshot hourly_rate (use the latest entry per staff)
  const snapshotRates = new Map<string, number>();
  if (completionStaff && completionStaff.length > 0) {
    // Sort by work_date descending so the latest snapshot wins
    const sorted = [...completionStaff].sort((a, b) =>
      (b.work_date || '').localeCompare(a.work_date || '')
    );
    for (const cs of sorted) {
      if (cs.hourly_rate != null && !snapshotRates.has(cs.staff_id)) {
        snapshotRates.set(cs.staff_id, Number(cs.hourly_rate));
      }
    }
  }
  
  // Aggregate by staff member, keeping detailed reports
  const staffMap = new Map<string, StaffTimeReport>();
  
  (data || []).forEach((report: any) => {
    const staffId = report.staff_id;
    const existing = staffMap.get(staffId);
    
    const staffData = report.staff_members;
    const currentRate = Number(staffData?.hourly_rate) || 0;
    const snapshotRate = snapshotRates.get(staffId);

    // Use snapshot rate if available; otherwise fall back to current staff rate
    const hourlyRate = snapshotRate ?? currentRate;
    if (snapshotRate != null && snapshotRate !== currentRate) {
      console.log(
        `[TimeReports] Using snapshot rate ${snapshotRate} instead of current ${currentRate} for staff ${staffId}`
      );
    } else if (snapshotRate == null) {
      console.warn(
        `[TimeReports] No snapshot rate for staff ${staffId} on ${report.report_date} — using current rate ${currentRate}. Cost may drift if rate changes.`
      );
    }

    const currentOvertimeRate = Number(staffData?.overtime_rate) || 0;
    // Overtime rate: use current if stored, otherwise derive from the resolved hourly rate
    const overtimeRate = currentOvertimeRate > 0 ? currentOvertimeRate : hourlyRate * 1.5;
    if (currentOvertimeRate === 0) {
      console.warn(
        `[TimeReports] No stored overtime_rate for staff ${staffId} — using derived ${overtimeRate} (${hourlyRate} × 1.5)`
      );
    }
    const hoursWorked = Number(report.hours_worked) || 0;
    const overtimeHours = Number(report.overtime_hours) || 0;
    
    const detailedReport = {
      id: report.id,
      staff_id: staffId,
      staff_name: staffData?.name || 'Okänd',
      report_date: report.report_date,
      start_time: report.start_time,
      end_time: report.end_time,
      hours_worked: hoursWorked,
      overtime_hours: overtimeHours,
      hourly_rate: hourlyRate,
      cost: (hoursWorked * hourlyRate) + (overtimeHours * overtimeRate),
      approved: report.approved === true,
    };
    
    if (existing) {
      existing.report_ids.push(report.id);
      existing.detailed_reports.push(detailedReport);
      existing.total_hours += hoursWorked;
      existing.overtime_hours += overtimeHours;
      existing.total_cost = (existing.total_hours * existing.hourly_rate) + 
                           (existing.overtime_hours * existing.overtime_rate);
      if (!report.approved) {
        existing.approved = false;
      }
    } else {
      staffMap.set(staffId, {
        staff_id: staffId,
        staff_name: staffData?.name || 'Okänd',
        total_hours: hoursWorked,
        overtime_hours: overtimeHours,
        hourly_rate: hourlyRate,
        overtime_rate: overtimeRate,
        total_cost: (hoursWorked * hourlyRate) + (overtimeHours * overtimeRate),
        approved: report.approved === true,
        report_ids: [report.id],
        detailed_reports: [detailedReport],
      });
    }
  });
  
  return Array.from(staffMap.values());
};

// Safe numeric coercion — returns 0 for NaN/undefined/null
const safeNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Safe reduce over potentially undefined/null arrays
const safeSum = <T>(arr: T[] | undefined | null, fn: (item: T) => number): number =>
  (arr ?? []).reduce((sum, item) => sum + safeNum(fn(item)), 0);

// Calculate economy summary
export const calculateEconomySummary = (
  budget: ProjectBudget | null,
  timeReports: StaffTimeReport[],
  purchases: ProjectPurchase[],
  quotes: ProjectQuote[],
  invoices: ProjectInvoice[],
  productCosts?: ProductCostSummary | null,
  supplierInvoices?: any[]
): EconomySummary => {
  // ── Input guards ──
  const safeTimeReports = timeReports ?? [];
  const safePurchases = purchases ?? [];
  const safeQuotes = quotes ?? [];
  const safeInvoices = invoices ?? [];
  const safeSupplierInvoices = supplierInvoices ?? [];

  if (!Array.isArray(timeReports)) console.warn('[Economy] timeReports is not an array, defaulting to []');
  if (!Array.isArray(purchases)) console.warn('[Economy] purchases is not an array, defaulting to []');
  if (!Array.isArray(quotes)) console.warn('[Economy] quotes is not an array, defaulting to []');
  if (!Array.isArray(invoices)) console.warn('[Economy] invoices is not an array, defaulting to []');

  // ── Staff budget ──
  const budgetedHours = safeNum(budget?.budgeted_hours);
  const hourlyRate = safeNum(budget?.hourly_rate) || 350;
  const staffBudget = budgetedHours * hourlyRate;

  // ── Staff actual ──
  const actualHours = safeSum(safeTimeReports, r => r.total_hours + r.overtime_hours);
  const staffActual = safeSum(safeTimeReports, r => r.total_cost);
  const staffDeviation = staffBudget - staffActual;
  const staffDeviationPercent = staffBudget > 0
    ? ((staffBudget - staffActual) / staffBudget) * 100
    : (staffActual > 0 ? -100 : 0);

  // ── Purchases / Quotes / Invoices ──
  const purchasesTotal = safeSum(safePurchases, p => p.amount);
  const quotesTotal = safeSum(safeQuotes, q => q.quoted_amount);
  const invoicesTotal = safeSum(safeInvoices, i => i.invoiced_amount);

  const invoiceDeviation = safeInvoices.reduce((sum, invoice) => {
    if (invoice.quote_id) {
      const quote = safeQuotes.find(q => q.id === invoice.quote_id);
      if (quote) {
        return sum + (safeNum(invoice.invoiced_amount) - safeNum(quote.quoted_amount));
      }
    }
    return sum;
  }, 0);

  // ── Supplier invoices: skip linked ones to prevent double counting ──
  let linkedCount = 0;
  const supplierInvoicesTotal = safeSupplierInvoices.reduce(
    (sum: number, si: any) => {
      const amount = safeNum(si.invoice_data?.Total);
      if (si.is_final_link && si.linked_cost_id) {
        console.warn(
          `[Economy] Skipping linked supplier invoice ${si.id} (${amount} kr) — already linked to ${si.linked_cost_type}:${si.linked_cost_id}`
        );
        linkedCount++;
        return sum;
      }
      return sum + amount;
    }, 0
  );

  if (linkedCount > 0) {
    console.log(`[Economy] ${linkedCount} supplier invoice(s) excluded from total to prevent double counting`);
  }

  // ── Product costs ──
  const productCostBudget = safeNum(productCosts?.summary?.costs);
  const productRevenue = safeNum(productCosts?.summary?.revenue)
    || safeSum(productCosts?.products, p => safeNum(p.total) || safeNum(p.unit_price) * safeNum(p.quantity));

  // ── Totals ──
  const totalBudget = staffBudget + quotesTotal + productCostBudget;
  const totalActual = staffActual + purchasesTotal + invoicesTotal + supplierInvoicesTotal;
  const totalDeviation = totalBudget - totalActual;
  const totalDeviationPercent = totalBudget > 0
    ? ((totalBudget - totalActual) / totalBudget) * 100
    : (totalActual > 0 ? -100 : 0);

  // ── Final NaN guard on output ──
  const result = {
    budgetedHours,
    actualHours,
    hourlyRate,
    staffBudget,
    staffActual,
    staffDeviation,
    staffDeviationPercent,
    purchasesTotal,
    quotesTotal,
    invoicesTotal,
    invoiceDeviation,
    supplierInvoicesTotal,
    productCostBudget,
    productRevenue,
    totalBudget,
    totalActual,
    totalDeviation,
    totalDeviationPercent,
  };

  // Verify no NaN leaked into the output
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      console.error(`[Economy] NaN detected in summary.${key} — resetting to 0`);
      (result as any)[key] = 0;
    }
  }

  return result;
};
