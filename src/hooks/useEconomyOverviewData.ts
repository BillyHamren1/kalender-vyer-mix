import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllEconomyDataMulti, type BatchEconomyData } from '@/services/planningApiService';
import { calculateEconomySummary } from '@/services/projectEconomyService';
import type { EconomySummary, StaffTimeReport } from '@/types/projectEconomy';

export type ProjectSize = 'small' | 'medium' | 'large';

export interface ProjectWithEconomy {
  id: string;
  name: string;
  status: string;
  booking_id: string | null;
  eventdate: string | null;
  bookingCreatedAt: string | null;
  summary: EconomySummary;
  timeReports: StaffTimeReport[];
  economyClosed: boolean;
  projectSize: ProjectSize;
  navigateTo: string;
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
  productRevenue: 0,
  totalBudget: 0,
  totalActual: 0,
  totalDeviation: 0,
  totalDeviationPercent: 0,
};

export const useEconomyOverviewData = () => {
  return useQuery({
    queryKey: ['economy-overview'],
    queryFn: async (): Promise<ProjectWithEconomy[]> => {
      // Fetch all three project types in parallel
      const [projectsRes, jobsRes, largeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, status, booking_id')
          .order('created_at', { ascending: false }),
        supabase
          .from('jobs')
          .select('id, name, status, booking_id')
          .order('created_at', { ascending: false }),
        supabase
          .from('large_projects')
          .select('id, name, status, large_project_bookings(booking_id)')
          .order('created_at', { ascending: false }),
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (largeRes.error) throw largeRes.error;

      // Build unified list with booking IDs
      interface RawEntry {
        id: string;
        name: string;
        status: string;
        booking_ids: string[];
        projectSize: ProjectSize;
        navigateTo: string;
      }

      const entries: RawEntry[] = [];

      // Medium projects
      (projectsRes.data || []).forEach(p => {
        entries.push({
          id: p.id,
          name: p.name,
          status: p.status,
          booking_ids: p.booking_id ? [p.booking_id] : [],
          projectSize: 'medium',
          navigateTo: `/project/${p.id}`,
        });
      });

      // Small projects (jobs)
      (jobsRes.data || []).forEach(j => {
        entries.push({
          id: j.id,
          name: j.name,
          status: j.status === 'planned' ? 'planning' : j.status,
          booking_ids: j.booking_id ? [j.booking_id] : [],
          projectSize: 'small',
          navigateTo: `/jobs/${j.id}`,
        });
      });

      // Large projects (can have multiple bookings)
      (largeRes.data || []).forEach((lp: any) => {
        const bIds = (lp.large_project_bookings || []).map((b: any) => b.booking_id).filter(Boolean);
        entries.push({
          id: lp.id,
          name: lp.name,
          status: lp.status,
          booking_ids: bIds,
          projectSize: 'large',
          navigateTo: `/large-project/${lp.id}`,
        });
      });

      if (!entries.length) return [];

      // Collect all unique booking IDs
      const allBookingIds = [...new Set(entries.flatMap(e => e.booking_ids))];

      // Fetch eventdates and created_at from bookings
      let eventdateMap: Record<string, string | null> = {};
      let createdAtMap: Record<string, string | null> = {};
      if (allBookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, eventdate, created_at')
          .in('id', allBookingIds);
        if (bookings) {
          bookings.forEach(b => {
            eventdateMap[b.id] = b.eventdate;
            createdAtMap[b.id] = b.created_at;
          });
        }
      }

      // Fetch ALL economy data in a single edge function call
      let multiBatchData: Record<string, BatchEconomyData> = {};
      if (allBookingIds.length > 0) {
        try {
          multiBatchData = await fetchAllEconomyDataMulti(allBookingIds);
        } catch (err) {
          console.error('Failed to fetch multi-batch economy data:', err);
        }
      }

      return entries.map((entry) => {
        // For projects with a single booking
        const primaryBookingId = entry.booking_ids[0] ?? null;
        const eventdate = primaryBookingId ? (eventdateMap[primaryBookingId] ?? null) : null;
        const bookingCreatedAt = primaryBookingId ? (createdAtMap[primaryBookingId] ?? null) : null;

        if (!entry.booking_ids.length || !entry.booking_ids.some(id => multiBatchData[id])) {
          return {
            id: entry.id,
            name: entry.name,
            status: entry.status,
            booking_id: primaryBookingId,
            eventdate,
            bookingCreatedAt,
            summary: emptySummary,
            timeReports: [] as StaffTimeReport[],
            economyClosed: entry.status === 'completed',
            projectSize: entry.projectSize,
            navigateTo: entry.navigateTo,
          };
        }

        try {
          // For large projects with multiple bookings, aggregate summaries
          if (entry.booking_ids.length > 1) {
            const summaries = entry.booking_ids
              .filter(id => multiBatchData[id])
              .map(id => processEconomyBatchData(multiBatchData[id]));

            const aggregated: EconomySummary = { ...emptySummary };
            let allTimeReports: StaffTimeReport[] = [];
            let allClosed = summaries.length > 0;

            summaries.forEach(s => {
              aggregated.budgetedHours += s.summary.budgetedHours;
              aggregated.actualHours += s.summary.actualHours;
              aggregated.staffBudget += s.summary.staffBudget;
              aggregated.staffActual += s.summary.staffActual;
              aggregated.purchasesTotal += s.summary.purchasesTotal;
              aggregated.quotesTotal += s.summary.quotesTotal;
              aggregated.invoicesTotal += s.summary.invoicesTotal;
              aggregated.supplierInvoicesTotal += s.summary.supplierInvoicesTotal;
              aggregated.productCostBudget += s.summary.productCostBudget;
              aggregated.productRevenue += s.summary.productRevenue;
              aggregated.totalBudget += s.summary.totalBudget;
              aggregated.totalActual += s.summary.totalActual;
              allTimeReports = [...allTimeReports, ...s.timeReports];
              if (!s.economyClosed) allClosed = false;
            });

            aggregated.staffDeviation = aggregated.staffActual - aggregated.staffBudget;
            aggregated.staffDeviationPercent = aggregated.staffBudget > 0 ? (aggregated.staffActual / aggregated.staffBudget) * 100 : 0;
            aggregated.invoiceDeviation = aggregated.invoicesTotal - aggregated.quotesTotal;
            aggregated.totalDeviation = aggregated.totalActual - aggregated.totalBudget;
            aggregated.totalDeviationPercent = aggregated.totalBudget > 0 ? (aggregated.totalActual / aggregated.totalBudget) * 100 : 0;

            return {
              id: entry.id,
              name: entry.name,
              status: entry.status,
              booking_id: primaryBookingId,
              eventdate,
              bookingCreatedAt,
              summary: aggregated,
              timeReports: allTimeReports,
              economyClosed: allClosed || entry.status === 'completed',
              projectSize: entry.projectSize,
              navigateTo: entry.navigateTo,
            };
          }

          // Single booking project
          const { summary, timeReports, economyClosed } = processEconomyBatchData(multiBatchData[primaryBookingId!]);
          return {
            id: entry.id,
            name: entry.name,
            status: entry.status,
            booking_id: primaryBookingId,
            eventdate,
            bookingCreatedAt,
            summary,
            timeReports,
            economyClosed: economyClosed || entry.status === 'completed',
            projectSize: entry.projectSize,
            navigateTo: entry.navigateTo,
          };
        } catch (err) {
          console.error(`Failed to process economy for project ${entry.name}:`, err);
          return {
            id: entry.id,
            name: entry.name,
            status: entry.status,
            booking_id: primaryBookingId,
            eventdate,
            summary: emptySummary,
            timeReports: [] as StaffTimeReport[],
            economyClosed: entry.status === 'completed',
            projectSize: entry.projectSize,
            navigateTo: entry.navigateTo,
          };
        }
      });
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: 2,
    retryDelay: 2000,
  });
};