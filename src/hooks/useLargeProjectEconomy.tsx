import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchLargeProjectBudget,
  upsertLargeProjectBudget,
  fetchLargeProjectPurchases,
  createLargeProjectPurchase,
  updateLargeProjectPurchase,
  deleteLargeProjectPurchase,
} from '@/services/largeProjectService';
import { fetchAllEconomyDataMulti } from '@/services/planningApiService';
import { fetchProjectTimeReports } from '@/services/projectEconomyService';
import { fetchLargeProjectHoursSummary } from '@/services/projectHoursService';
import type { StaffTimeReport } from '@/types/projectEconomy';

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT HOURS 6:
// Sanningen för stora projektets personaltimmar = staff_day_report_cache
// (samma Time Engine-cache som /staff-management/time-reports). Vi summerar
// på LARGE PROJECT-nivå via fetchLargeProjectHoursSummary, där ett block
// matchas på large_project_id ELLER booking_id ∈ linkedBookingIds, och
// dedupas så samma block aldrig räknas dubbelt.
//
// `timeReportsByBooking` lever kvar enbart som DETALJ-breakdown per booking
// — den är ingen totalsanning längre och får aldrig användas för LP-totaler.
// time_reports används INTE som källa.
// ─────────────────────────────────────────────────────────────────────────────
import type { LargeProjectBudget, LargeProjectPurchase } from '@/types/largeProject';
import { supabase } from '@/integrations/supabase/client';

interface AggregatedBookingEconomy {
  totalRevenue: number;
  totalCost: number;
  totalStaffCost: number;
  totalActualHours: number;
  totalPurchases: number;
  totalQuotes: number;
  totalInvoices: number;
  totalSupplierInvoices: number;
  bookingCount: number;
}

export const useLargeProjectEconomy = (
  largeProjectId: string | undefined,
  bookingIds: string[]
) => {
  const queryClient = useQueryClient();

  // Budget
  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['large-project-budget', largeProjectId],
    queryFn: () => fetchLargeProjectBudget(largeProjectId!),
    enabled: !!largeProjectId,
  });

  // Purchases
  const { data: purchases = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ['large-project-purchases', largeProjectId],
    queryFn: () => fetchLargeProjectPurchases(largeProjectId!),
    enabled: !!largeProjectId,
  });

  // Aggregated booking economy data (from linked bookings via planning-api)
  const { data: bookingEconomyData, isLoading: bookingEconomyLoading } = useQuery({
    queryKey: ['large-project-booking-economy', largeProjectId, bookingIds],
    queryFn: () => fetchAllEconomyDataMulti(bookingIds),
    enabled: bookingIds.length > 0,
  });

  // Local booking products (for revenue data and editable costs)
  const { data: localProducts = [] } = useQuery({
    queryKey: ['large-project-local-products', bookingIds],
    queryFn: async () => {
      if (bookingIds.length === 0) return [];
      const { data, error } = await supabase
        .from('booking_products')
        .select('id, booking_id, name, quantity, unit_price, total_price, assembly_cost, handling_cost, purchase_cost, parent_product_id, is_package_component, sku, sort_index')
        .in('booking_id', bookingIds);
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  // DETAIL-only: per-booking time reports breakdown. Får inte användas som
  // total — totalsanningen för LP är largeProjectHours nedan.
  const { data: timeReportsByBooking = {} } = useQuery({
    queryKey: ['large-project-time-reports', bookingIds],
    queryFn: async () => {
      const result: Record<string, StaffTimeReport[]> = {};
      await Promise.all(bookingIds.map(async (bId) => {
        try {
          result[bId] = await fetchProjectTimeReports(bId);
        } catch (e) {
          console.warn('[LargeProjectEcon] time reports fetch failed for', bId, e);
          result[bId] = [];
        }
      }));
      return result;
    },
    enabled: bookingIds.length > 0,
  });

  // TOTALSANNING: LP-aggregerade Time Engine-block (samma cache som
  // /staff-management/time-reports). Block matchas på large_project_id ELLER
  // booking_id ∈ bookingIds, deduplicerade så inget block räknas dubbelt.
  const { data: largeProjectHours } = useQuery({
    queryKey: ['large-project-hours', largeProjectId, bookingIds],
    queryFn: () => fetchLargeProjectHoursSummary(largeProjectId!, bookingIds),
    enabled: !!largeProjectId,
  });
  const aggregatedBookingEconomy: AggregatedBookingEconomy = (() => {
    const TAG = '[LargeProjectEcon]';
    if (!bookingEconomyData) {
      if (bookingIds.length > 0 && !bookingEconomyLoading) {
        console.warn(`${TAG} No economy data returned for ${bookingIds.length} bookings (project ${largeProjectId})`);
      }
      return {
        totalRevenue: 0, totalCost: 0, totalStaffCost: 0, totalActualHours: 0,
        totalPurchases: 0, totalQuotes: 0, totalInvoices: 0,
        totalSupplierInvoices: 0, bookingCount: 0,
      };
    }
    let totalRevenue = 0, totalCost = 0, totalStaffCost = 0, totalActualHours = 0;
    let totalPurchases = 0, totalQuotes = 0, totalInvoices = 0, totalSupplierInvoices = 0;
    let bookingCount = 0;

    // Check for bookings that returned no data at all
    const returnedIds = new Set(Object.keys(bookingEconomyData));
    const missingIds = bookingIds.filter(id => !returnedIds.has(id));
    if (missingIds.length > 0) {
      console.warn(`${TAG} ${missingIds.length} of ${bookingIds.length} bookings returned no economy data:`, missingIds);
    }

    Object.entries(bookingEconomyData).forEach(([bId, bd]) => {
      bookingCount++;
      // Product costs (revenue from booking)
      const pc = bd.product_costs;
      if (pc?.summary && pc.summary.revenue > 0) {
        totalRevenue += pc.summary.revenue;
        totalCost += pc.summary.costs || 0;
      } else {
        // Fallback: use local booking_products for revenue and costs
        const localBP = localProducts.filter(lp => lp.booking_id === bId);
        const localRev = localBP
          .filter(lp => !lp.is_package_component && !lp.parent_product_id)
          .reduce((s, lp) => s + (lp.total_price || 0), 0);
        const localCost = localBP.reduce((s, lp) =>
          s + ((lp.assembly_cost || 0) + (lp.handling_cost || 0) + (lp.purchase_cost || 0)) * (Number(lp.quantity) || 1), 0);
        totalRevenue += localRev;
        totalCost += pc?.summary?.costs || localCost;
        if (!pc?.summary) {
          console.warn(`${TAG} Booking ${bId}: missing product_costs.summary, using local fallback (rev: ${localRev})`);
        }
      }
      // Staff/time hanteras INTE här. Totalsanningen är `largeProjectHours`
      // (Time Engine-cache, LP-aggregerad). Per-booking loop skulle dubbelräkna
      // block som har både booking_id och large_project_id.
      // Purchases
      const pu = bd.purchases;
      if (Array.isArray(pu)) {
        pu.forEach((p: any) => { totalPurchases += p.amount || 0; });
      } else if (pu !== undefined) {
        console.warn(`${TAG} Booking ${bId}: purchases is not an array`, typeof pu);
      }
      // Quotes
      const qu = bd.quotes;
      if (Array.isArray(qu)) {
        qu.forEach((q: any) => { totalQuotes += q.quoted_amount || 0; });
      }
      // Invoices
      const inv = bd.invoices;
      if (Array.isArray(inv)) {
        inv.forEach((i: any) => { totalInvoices += Number(i.invoiced_amount) || 0; });
      }
      // Supplier invoices — skip linked ones to avoid double counting (matches normal project logic)
      const si = bd.supplier_invoices;
      if (Array.isArray(si)) {
        si.forEach((s: any) => {
          const amount = Number(s.invoice_data?.Total) || 0;
          if (s.is_final_link && s.linked_cost_id) {
            console.warn(
              `${TAG} Skipping linked supplier invoice ${s.id} (${amount} kr) — already in ${s.linked_cost_type}:${s.linked_cost_id}`
            );
            return;
          }
          totalSupplierInvoices += amount;
        });
      }
    });

    return {
      totalRevenue, totalCost, totalStaffCost, totalActualHours,
      totalPurchases, totalQuotes, totalInvoices,
      totalSupplierInvoices, bookingCount,
    };
  })();

  // Local purchases total
  const localPurchasesTotal = purchases.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Budget cost
  const budgetedCost = (budget?.budgeted_hours || 0) * (budget?.hourly_rate || 0);

  // ── LP-aggregerade Time Engine-timmar (totalsanning) ──
  const reportedStaffHoursFromTimeEngine = largeProjectHours?.summary.totalHours ?? 0;
  const reportedStaffCostFromTimeEngine = largeProjectHours?.totalCost ?? 0;
  const staffHoursByPerson = largeProjectHours?.summary.staffSummaries ?? [];
  const staffHoursByDay = largeProjectHours?.summary.daySummaries ?? [];
  const staffCostsByPerson = largeProjectHours?.staffCosts ?? [];
  const hoursSource: 'staff_day_report_cache' = 'staff_day_report_cache';

  // Combined summary
  // Staff-totalen kommer NU från LP-aggregerade Time Engine-block (inte
  // booking-summan), eftersom samma block annars skulle räknas dubbelt.
  const agg = aggregatedBookingEconomy;
  const grandTotalCost =
    localPurchasesTotal +
    agg.totalCost +
    reportedStaffCostFromTimeEngine +
    agg.totalPurchases +
    agg.totalInvoices +
    agg.totalSupplierInvoices;

  const summary = {
    // Budget
    budgetedHours: budget?.budgeted_hours || 0,
    hourlyRate: budget?.hourly_rate || 0,
    budgetedCost,
    // Local purchases
    localPurchasesTotal,
    // Aggregated from bookings (utan staff — den kommer från LP-Time Engine)
    ...aggregatedBookingEconomy,
    // Override staff totals med LP-aggregerade Time Engine-värden
    totalStaffCost: reportedStaffCostFromTimeEngine,
    totalActualHours: reportedStaffHoursFromTimeEngine,
    // Grand totals
    grandTotalCost,
    grandTotalRevenue: agg.totalRevenue,
    // Källa-spårning
    staffHoursSource: hoursSource,
  };

  // Mutations
  const saveBudgetMutation = useMutation({
    mutationFn: (data: { budgeted_hours: number; hourly_rate: number; description?: string }) =>
      upsertLargeProjectBudget({ large_project_id: largeProjectId!, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-budget', largeProjectId] });
      toast.success('Budget sparad');
    },
    onError: () => toast.error('Kunde inte spara budget'),
  });

  const addPurchaseMutation = useMutation({
    mutationFn: (data: { description: string; amount: number; category?: string; supplier?: string; purchase_date?: string; receipt_url?: string }) =>
      createLargeProjectPurchase({ large_project_id: largeProjectId!, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-purchases', largeProjectId] });
      toast.success('Inköp tillagt');
    },
    onError: () => toast.error('Kunde inte lägga till inköp'),
  });

  const updatePurchaseMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<LargeProjectPurchase> }) =>
      updateLargeProjectPurchase(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-purchases', largeProjectId] });
      toast.success('Inköp uppdaterat');
    },
    onError: () => toast.error('Kunde inte uppdatera inköp'),
  });

  const removePurchaseMutation = useMutation({
    mutationFn: deleteLargeProjectPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-purchases', largeProjectId] });
      toast.success('Inköp borttaget');
    },
    onError: () => toast.error('Kunde inte ta bort inköp'),
  });

  return {
    budget,
    purchases,
    summary,
    bookingEconomyData: bookingEconomyData || null,
    localProducts,
    // Detalj-breakdown per booking — får ej användas som total.
    timeReportsByBooking,
    // Totalsanning: LP-aggregerad Time Engine-cache.
    largeProjectHours,
    reportedStaffHoursFromTimeEngine,
    reportedStaffCostFromTimeEngine,
    staffHoursByPerson,
    staffHoursByDay,
    staffCostsByPerson,
    hoursSource,
    isLoading: budgetLoading || purchasesLoading || bookingEconomyLoading,
    saveBudget: saveBudgetMutation.mutate,
    addPurchase: addPurchaseMutation.mutate,
    updatePurchase: updatePurchaseMutation.mutate,
    removePurchase: removePurchaseMutation.mutate,
  };
};
