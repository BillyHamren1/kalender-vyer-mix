import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllEconomyDataMulti, type BatchEconomyData } from '@/services/planningApiService';
import { calculateEconomySummary } from '@/services/projectEconomyService';
import type { EconomySummary, StaffTimeReport } from '@/types/projectEconomy';

export interface ProjectWithEconomy {
  id: string;
  name: string;
  status: string;
  booking_id: string | null;
  eventdate: string | null;
  summary: EconomySummary;
  timeReports: StaffTimeReport[];
  economyClosed: boolean;
}

/**
 * Processes batch economy data for a single booking.
 * Returns summary + timeReports mapped to the standard StaffTimeReport shape.
 */
function processEconomyBatchData(batchData: BatchEconomyData) {
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

const emptySummary: EconomySummary = {
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
  totalBudget: 0,
  totalActual: 0,
  totalDeviation: 0,
  totalDeviationPercent: 0,
};

export const useEconomyOverviewData = () => {
  return useQuery({
    queryKey: ['economy-overview'],
    queryFn: async (): Promise<ProjectWithEconomy[]> => {
      // Fetch all active projects
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id, name, status, booking_id')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!projects?.length) return [];

      // Fetch eventdates from bookings for projects that have booking_id
      const bookingIds = projects
        .map(p => p.booking_id)
        .filter((id): id is string => !!id);

      let eventdateMap: Record<string, string | null> = {};
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, eventdate')
          .in('id', bookingIds);
        if (bookings) {
          bookings.forEach(b => { eventdateMap[b.id] = b.eventdate; });
        }
      }

      // Fetch ALL economy data in a single edge function call
      let multiBatchData: Record<string, BatchEconomyData> = {};
      if (bookingIds.length > 0) {
        try {
          multiBatchData = await fetchAllEconomyDataMulti(bookingIds);
        } catch (err) {
          console.error('Failed to fetch multi-batch economy data:', err);
        }
      }

      return projects.map((project) => {
        const eventdate = project.booking_id ? (eventdateMap[project.booking_id] ?? null) : null;

        if (!project.booking_id || !multiBatchData[project.booking_id]) {
          return {
            id: project.id,
            name: project.name,
            status: project.status,
            booking_id: project.booking_id,
            eventdate,
            summary: emptySummary,
            timeReports: [] as StaffTimeReport[],
            economyClosed: project.status === 'completed',
          };
        }

        try {
          const { summary, timeReports, economyClosed } = processEconomyBatchData(multiBatchData[project.booking_id]);
          return {
            id: project.id,
            name: project.name,
            status: project.status,
            booking_id: project.booking_id,
            eventdate,
            summary,
            timeReports,
            economyClosed: economyClosed || project.status === 'completed',
          };
        } catch (err) {
          console.error(`Failed to process economy for project ${project.name}:`, err);
          return {
            id: project.id,
            name: project.name,
            status: project.status,
            booking_id: project.booking_id,
            eventdate,
            summary: emptySummary,
            timeReports: [] as StaffTimeReport[],
            economyClosed: project.status === 'completed',
          };
        }
      });
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: 2,
    retryDelay: 2000,
  });
};
