import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

export type TimeFilterType = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface StaffRevenueData {
  staff_id: string;
  staff_name: string;
  role: string | null;
  hourly_rate: number;
  
  // Hours
  total_hours: number;
  overtime_hours: number;
  
  // Costs
  labor_cost: number;
  
  // Revenue attribution (share of booking total based on hours worked)
  revenue_contribution: number;
  
  // Margin (revenue - costs)
  margin: number;
  margin_percentage: number;
  
  // Job stats
  jobs_count: number;
  avg_margin_per_job: number;
  
  // Ranking
  revenue_rank: number;
  margin_rank: number;
}

export interface StaffRevenueKPIs {
  total_revenue: number;
  total_labor_cost: number;
  total_margin: number;
  margin_percentage: number;
  total_hours: number;
  active_staff_count: number;
  jobs_completed: number;
  avg_revenue_per_staff: number;
  avg_margin_per_staff: number;
}

export interface StaffRevenueResult {
  staff: StaffRevenueData[];
  kpis: StaffRevenueKPIs;
  dateRange: { start: string; end: string };
}

/**
 * Get date range based on filter type
 */
export function getDateRange(filterType: TimeFilterType, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const now = new Date();
  
  switch (filterType) {
    case 'day':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'year':
      return { start: startOfYear(now), end: endOfYear(now) };
    case 'custom':
      return {
        start: customStart ? startOfDay(customStart) : startOfMonth(now),
        end: customEnd ? endOfDay(customEnd) : endOfMonth(now)
      };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

/**
 * Fetch staff revenue and margin data
 */
export async function fetchStaffRevenueData(
  filterType: TimeFilterType,
  customStart?: Date,
  customEnd?: Date
): Promise<StaffRevenueResult> {
  const { start, end } = getDateRange(filterType, customStart, customEnd);
  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');

  console.log('[StaffRevenue] Fetching data for period:', startStr, 'to', endStr);

  // 1. Fetch all time reports in the period
  const { data: timeReports, error: reportsError } = await supabase
    .from('time_reports')
    .select(`
      id,
      staff_id,
      booking_id,
      hours_worked,
      overtime_hours,
      report_date,
      staff_members!inner(id, name, role, hourly_rate, overtime_rate)
    `)
    .gte('report_date', startStr)
    .lte('report_date', endStr);

  if (reportsError) {
    console.error('[StaffRevenue] Error fetching time reports:', reportsError);
    throw reportsError;
  }

  // 2. Get unique booking IDs to fetch their revenue
  const bookingIds = [...new Set((timeReports || []).map(r => r.booking_id))];

  // 3. Fetch booking products for revenue calculation
  const { data: bookingProducts } = await supabase
    .from('booking_products')
    .select('booking_id, total_price, quantity')
    .in('booking_id', bookingIds);

  // Calculate total revenue per booking
  const bookingRevenueMap = new Map<string, number>();
  (bookingProducts || []).forEach(product => {
    const revenue = (product.total_price || 0) * (product.quantity || 1);
    const existing = bookingRevenueMap.get(product.booking_id) || 0;
    bookingRevenueMap.set(product.booking_id, existing + revenue);
  });

  // 4. Calculate total hours per booking for revenue attribution
  const bookingHoursMap = new Map<string, number>();
  (timeReports || []).forEach(report => {
    const hours = (Number(report.hours_worked) || 0) + (Number(report.overtime_hours) || 0);
    const existing = bookingHoursMap.get(report.booking_id) || 0;
    bookingHoursMap.set(report.booking_id, existing + hours);
  });

  // 5. Aggregate data per staff member
  const staffMap = new Map<string, StaffRevenueData>();
  const staffJobsMap = new Map<string, Set<string>>(); // Track unique jobs per staff

  (timeReports || []).forEach((report: any) => {
    const staffId = report.staff_id;
    const staff = report.staff_members;
    const hours = Number(report.hours_worked) || 0;
    const overtime = Number(report.overtime_hours) || 0;
    const hourlyRate = Number(staff?.hourly_rate) || 0;
    const overtimeRate = Number(staff?.overtime_rate) || hourlyRate * 1.5;
    
    const laborCost = (hours * hourlyRate) + (overtime * overtimeRate);
    
    // Calculate revenue attribution based on hours worked
    const bookingTotalHours = bookingHoursMap.get(report.booking_id) || 1;
    const bookingRevenue = bookingRevenueMap.get(report.booking_id) || 0;
    const staffHoursShare = (hours + overtime) / bookingTotalHours;
    const revenueContribution = bookingRevenue * staffHoursShare;

    // Track jobs
    if (!staffJobsMap.has(staffId)) {
      staffJobsMap.set(staffId, new Set());
    }
    staffJobsMap.get(staffId)!.add(report.booking_id);

    const existing = staffMap.get(staffId);
    if (existing) {
      existing.total_hours += hours;
      existing.overtime_hours += overtime;
      existing.labor_cost += laborCost;
      existing.revenue_contribution += revenueContribution;
    } else {
      staffMap.set(staffId, {
        staff_id: staffId,
        staff_name: staff?.name || 'Okänd',
        role: staff?.role || null,
        hourly_rate: hourlyRate,
        total_hours: hours,
        overtime_hours: overtime,
        labor_cost: laborCost,
        revenue_contribution: revenueContribution,
        margin: 0,
        margin_percentage: 0,
        jobs_count: 0,
        avg_margin_per_job: 0,
        revenue_rank: 0,
        margin_rank: 0
      });
    }
  });

  // 6. Calculate margins and rankings
  const staffData = Array.from(staffMap.values());
  
  staffData.forEach(staff => {
    const jobCount = staffJobsMap.get(staff.staff_id)?.size || 0;
    staff.jobs_count = jobCount;
    staff.margin = staff.revenue_contribution - staff.labor_cost;
    staff.margin_percentage = staff.revenue_contribution > 0 
      ? (staff.margin / staff.revenue_contribution) * 100 
      : 0;
    staff.avg_margin_per_job = jobCount > 0 ? staff.margin / jobCount : 0;
  });

  // Sort by revenue for ranking
  staffData.sort((a, b) => b.revenue_contribution - a.revenue_contribution);
  staffData.forEach((staff, idx) => staff.revenue_rank = idx + 1);

  // Sort by margin for ranking
  const marginSorted = [...staffData].sort((a, b) => b.margin - a.margin);
  marginSorted.forEach((staff, idx) => {
    const original = staffData.find(s => s.staff_id === staff.staff_id);
    if (original) original.margin_rank = idx + 1;
  });

  // 7. Calculate KPIs
  const totalRevenue = staffData.reduce((sum, s) => sum + s.revenue_contribution, 0);
  const totalLaborCost = staffData.reduce((sum, s) => sum + s.labor_cost, 0);
  const totalHours = staffData.reduce((sum, s) => sum + s.total_hours + s.overtime_hours, 0);
  const activeStaff = staffData.filter(s => s.total_hours > 0).length;
  const jobsCompleted = new Set(bookingIds).size;

  const kpis: StaffRevenueKPIs = {
    total_revenue: totalRevenue,
    total_labor_cost: totalLaborCost,
    total_margin: totalRevenue - totalLaborCost,
    margin_percentage: totalRevenue > 0 ? ((totalRevenue - totalLaborCost) / totalRevenue) * 100 : 0,
    total_hours: totalHours,
    active_staff_count: activeStaff,
    jobs_completed: jobsCompleted,
    avg_revenue_per_staff: activeStaff > 0 ? totalRevenue / activeStaff : 0,
    avg_margin_per_staff: activeStaff > 0 ? (totalRevenue - totalLaborCost) / activeStaff : 0
  };

  // Keep sorted by revenue (default)
  return {
    staff: staffData,
    kpis,
    dateRange: { start: startStr, end: endStr }
  };
}
