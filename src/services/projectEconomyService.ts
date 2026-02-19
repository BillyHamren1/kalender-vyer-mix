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
export const fetchProjectTimeReports = async (bookingId: string): Promise<StaffTimeReport[]> => {
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
    .order('report_date', { ascending: true });
  
  if (error) throw error;
  
  // Aggregate by staff member, keeping detailed reports
  const staffMap = new Map<string, StaffTimeReport>();
  
  (data || []).forEach((report: any) => {
    const staffId = report.staff_id;
    const existing = staffMap.get(staffId);
    
    const staffData = report.staff_members;
    const hourlyRate = Number(staffData?.hourly_rate) || 0;
    const overtimeRate = Number(staffData?.overtime_rate) || hourlyRate * 1.5;
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
  const budgetedHours = budget?.budgeted_hours || 0;
  const hourlyRate = budget?.hourly_rate || 350;
  const staffBudget = budgetedHours * hourlyRate;
  
  const actualHours = timeReports.reduce((sum, r) => sum + r.total_hours + r.overtime_hours, 0);
  const staffActual = timeReports.reduce((sum, r) => sum + r.total_cost, 0);
  const staffDeviation = staffBudget - staffActual;
  const staffDeviationPercent = staffBudget > 0 
    ? ((staffBudget - staffActual) / staffBudget) * 100 
    : (staffActual > 0 ? -100 : 0);
  
  const purchasesTotal = purchases.reduce((sum, p) => sum + Number(p.amount), 0);
  const quotesTotal = quotes.reduce((sum, q) => sum + Number(q.quoted_amount), 0);
  const invoicesTotal = invoices.reduce((sum, i) => sum + Number(i.invoiced_amount), 0);
  
  const invoiceDeviation = invoices.reduce((sum, invoice) => {
    if (invoice.quote_id) {
      const quote = quotes.find(q => q.id === invoice.quote_id);
      if (quote) {
        return sum + (Number(invoice.invoiced_amount) - Number(quote.quoted_amount));
      }
    }
    return sum;
  }, 0);

  const supplierInvoicesTotal = (supplierInvoices || []).reduce(
    (sum: number, si: any) => sum + (Number(si.invoice_data?.Total) || 0), 0
  );

  const productCostBudget = productCosts?.summary?.costs || 0;
  
  const totalBudget = staffBudget + quotesTotal + productCostBudget;
  const totalActual = staffActual + purchasesTotal + invoicesTotal + supplierInvoicesTotal;
  const totalDeviation = totalBudget - totalActual;
  const totalDeviationPercent = totalBudget > 0 
    ? ((totalBudget - totalActual) / totalBudget) * 100 
    : (totalActual > 0 ? -100 : 0);
  
  return {
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
    totalBudget,
    totalActual,
    totalDeviation,
    totalDeviationPercent
  };
};
