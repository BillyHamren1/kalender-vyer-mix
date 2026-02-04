import { supabase } from '@/integrations/supabase/client';

// Types for job completion analytics
export interface JobCompletionData {
  id?: string;
  booking_id: string;
  project_id?: string;
  booking_number?: string;
  client_name: string;
  rig_date?: string;
  event_date?: string;
  rigdown_date?: string;
  completed_at?: string;
  delivery_address?: string;
  delivery_city?: string;
  carry_more_than_10m?: boolean;
  ground_nails_allowed?: boolean;
  exact_time_required?: boolean;
  product_categories?: ProductCategoryData[];
  total_products?: number;
  total_product_value?: number;
  total_setup_hours_estimated?: number;
  staff_assignments?: StaffAssignmentData[];
  total_staff_count?: number;
  total_hours_worked?: number;
  total_overtime_hours?: number;
  total_labor_cost?: number;
  total_material_cost?: number;
  total_external_cost?: number;
  total_purchases?: number;
  total_revenue?: number;
  total_margin?: number;
  margin_percentage?: number;
  warehouse_handling_cost?: number;
}

export interface ProductCategoryData {
  name: string;
  quantity: number;
  setup_hours: number;
  total_price: number;
}

export interface StaffAssignmentData {
  staff_id: string;
  staff_name: string;
  role?: string;
  dates: string[];
  hours_worked: number;
  overtime_hours: number;
  hourly_rate: number;
}

export interface StaffJobAffinity {
  id: string;
  staff_id: string;
  staff_name: string;
  product_category: string;
  jobs_completed: number;
  total_hours_on_category: number;
  avg_efficiency_score: number;
  affinity_score: number;
  last_job_date?: string;
}

// Default warehouse handling cost per job (schablonbelopp)
const DEFAULT_WAREHOUSE_COST = 2500;

/**
 * Collects and stores analytics data for a completed job
 */
export async function recordJobCompletion(bookingId: string, warehouseCost: number = DEFAULT_WAREHOUSE_COST): Promise<JobCompletionData | null> {
  console.log('[JobAnalytics] Recording job completion for booking:', bookingId);

  try {
    // 1. Fetch booking data
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[JobAnalytics] Failed to fetch booking:', bookingError);
      return null;
    }

    // 2. Fetch project if linked
    let projectId: string | undefined;
    if (booking.assigned_project_id) {
      projectId = booking.assigned_project_id;
    }

    // 3. Fetch products
    const { data: products } = await supabase
      .from('booking_products')
      .select('*')
      .eq('booking_id', bookingId);

    // Group products by category (first word of name as category)
    const categoryMap = new Map<string, ProductCategoryData>();
    let totalProducts = 0;
    let totalProductValue = 0;
    let totalSetupHours = 0;
    let totalMaterialCost = 0;
    let totalExternalCost = 0;

    (products || []).forEach(product => {
      const categoryName = extractCategory(product.name);
      const existing = categoryMap.get(categoryName);
      const qty = product.quantity || 1;
      const price = (product.total_price || 0) * qty;
      const setupHrs = (product.setup_hours || 0) * qty;
      const materialCost = (product.material_cost || 0) * qty;
      const externalCost = (product.external_cost || 0) * qty;

      totalProducts += qty;
      totalProductValue += price;
      totalSetupHours += setupHrs;
      totalMaterialCost += materialCost;
      totalExternalCost += externalCost;

      if (existing) {
        existing.quantity += qty;
        existing.setup_hours += setupHrs;
        existing.total_price += price;
      } else {
        categoryMap.set(categoryName, {
          name: categoryName,
          quantity: qty,
          setup_hours: setupHrs,
          total_price: price
        });
      }
    });

    // 4. Fetch time reports for this booking
    const { data: timeReports } = await supabase
      .from('time_reports')
      .select(`
        staff_id,
        hours_worked,
        overtime_hours,
        report_date,
        staff_members!inner(name, role, hourly_rate, overtime_rate)
      `)
      .eq('booking_id', bookingId);

    // Aggregate staff data
    const staffMap = new Map<string, StaffAssignmentData>();
    let totalHoursWorked = 0;
    let totalOvertimeHours = 0;
    let totalLaborCost = 0;

    (timeReports || []).forEach((report: any) => {
      const staffId = report.staff_id;
      const staff = report.staff_members;
      const hours = Number(report.hours_worked) || 0;
      const overtime = Number(report.overtime_hours) || 0;
      const hourlyRate = Number(staff?.hourly_rate) || 0;
      const overtimeRate = Number(staff?.overtime_rate) || hourlyRate * 1.5;

      totalHoursWorked += hours;
      totalOvertimeHours += overtime;
      totalLaborCost += (hours * hourlyRate) + (overtime * overtimeRate);

      const existing = staffMap.get(staffId);
      if (existing) {
        existing.hours_worked += hours;
        existing.overtime_hours += overtime;
        if (!existing.dates.includes(report.report_date)) {
          existing.dates.push(report.report_date);
        }
      } else {
        staffMap.set(staffId, {
          staff_id: staffId,
          staff_name: staff?.name || 'Okänd',
          role: staff?.role || undefined,
          dates: [report.report_date],
          hours_worked: hours,
          overtime_hours: overtime,
          hourly_rate: hourlyRate
        });
      }
    });

    // 5. Fetch purchases for this project
    let totalPurchases = 0;
    if (projectId) {
      const { data: purchases } = await supabase
        .from('project_purchases')
        .select('amount')
        .eq('project_id', projectId);

      totalPurchases = (purchases || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    }

    // 6. Calculate margin
    const totalCosts = totalLaborCost + totalMaterialCost + totalExternalCost + totalPurchases + warehouseCost;
    const totalRevenue = totalProductValue;
    const totalMargin = totalRevenue - totalCosts;
    const marginPercentage = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

    // 7. Build the analytics record
    const analyticsData: any = {
      booking_id: bookingId,
      project_id: projectId || null,
      booking_number: booking.booking_number,
      client_name: booking.client,
      rig_date: booking.rigdaydate,
      event_date: booking.eventdate,
      rigdown_date: booking.rigdowndate,
      delivery_address: booking.deliveryaddress,
      delivery_city: booking.delivery_city,
      carry_more_than_10m: booking.carry_more_than_10m || false,
      ground_nails_allowed: booking.ground_nails_allowed !== false,
      exact_time_required: booking.exact_time_needed || false,
      product_categories: Array.from(categoryMap.values()),
      total_products: totalProducts,
      total_product_value: totalProductValue,
      total_setup_hours_estimated: totalSetupHours,
      staff_assignments: Array.from(staffMap.values()),
      total_staff_count: staffMap.size,
      total_hours_worked: totalHoursWorked,
      total_overtime_hours: totalOvertimeHours,
      total_labor_cost: totalLaborCost,
      total_material_cost: totalMaterialCost,
      total_external_cost: totalExternalCost,
      total_purchases: totalPurchases,
      total_revenue: totalRevenue,
      total_margin: totalMargin,
      margin_percentage: marginPercentage,
      warehouse_handling_cost: warehouseCost
    };

    // 8. Insert or update analytics record
    const { data: existingRecord } = await supabase
      .from('job_completion_analytics')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (existingRecord) {
      const { error: updateError } = await supabase
        .from('job_completion_analytics')
        .update(analyticsData)
        .eq('id', existingRecord.id);

      if (updateError) {
        console.error('[JobAnalytics] Failed to update record:', updateError);
        return null;
      }
    } else {
      const { error: insertError } = await supabase
        .from('job_completion_analytics')
        .insert(analyticsData);

      if (insertError) {
        console.error('[JobAnalytics] Failed to insert record:', insertError);
        return null;
      }
    }

    // 9. Update staff affinity scores
    await updateStaffAffinities(staffMap, categoryMap, totalSetupHours, totalHoursWorked);

    console.log('[JobAnalytics] Successfully recorded job completion');
    return analyticsData;
  } catch (error) {
    console.error('[JobAnalytics] Error recording job completion:', error);
    return null;
  }
}

/**
 * Update staff-job affinity scores based on completed work
 */
async function updateStaffAffinities(
  staffMap: Map<string, StaffAssignmentData>,
  categoryMap: Map<string, ProductCategoryData>,
  totalEstimatedHours: number,
  totalActualHours: number
): Promise<void> {
  // Calculate efficiency: estimated / actual (higher = better efficiency)
  const efficiency = totalActualHours > 0 
    ? Math.min(2, totalEstimatedHours / totalActualHours) 
    : 1;

  const categories = Array.from(categoryMap.keys());

  for (const [staffId, staffData] of staffMap.entries()) {
    for (const category of categories) {
      try {
        // Get existing affinity
        const { data: existing } = await supabase
          .from('staff_job_affinity')
          .select('*')
          .eq('staff_id', staffId)
          .eq('product_category', category)
          .maybeSingle();

        if (existing) {
          // Update existing record
          const newJobsCompleted = existing.jobs_completed + 1;
          const newTotalHours = Number(existing.total_hours_on_category) + staffData.hours_worked;
          const newAvgEfficiency = (Number(existing.avg_efficiency_score) * existing.jobs_completed + efficiency) / newJobsCompleted;
          const newAffinityScore = newJobsCompleted * newAvgEfficiency;

          await supabase
            .from('staff_job_affinity')
            .update({
              jobs_completed: newJobsCompleted,
              total_hours_on_category: newTotalHours,
              avg_efficiency_score: newAvgEfficiency,
              affinity_score: newAffinityScore,
              last_job_date: new Date().toISOString().split('T')[0]
            })
            .eq('id', existing.id);
        } else {
          // Create new record
          await supabase
            .from('staff_job_affinity')
            .insert({
              staff_id: staffId,
              staff_name: staffData.staff_name,
              product_category: category,
              jobs_completed: 1,
              total_hours_on_category: staffData.hours_worked,
              avg_efficiency_score: efficiency,
              affinity_score: efficiency,
              last_job_date: new Date().toISOString().split('T')[0]
            });
        }
      } catch (error) {
        console.error('[JobAnalytics] Error updating staff affinity:', error);
      }
    }
  }
}

/**
 * Get staff recommendations for a specific job type/category
 */
export async function getStaffRecommendations(categories: string[], limit: number = 5): Promise<StaffJobAffinity[]> {
  if (categories.length === 0) return [];

  const { data, error } = await supabase
    .from('staff_job_affinity')
    .select('*')
    .in('product_category', categories)
    .order('affinity_score', { ascending: false })
    .limit(limit * categories.length);

  if (error) {
    console.error('[JobAnalytics] Failed to get staff recommendations:', error);
    return [];
  }

  // Aggregate by staff (may appear in multiple categories)
  const staffScores = new Map<string, StaffJobAffinity>();
  (data || []).forEach((affinity: any) => {
    const existing = staffScores.get(affinity.staff_id);
    if (existing) {
      existing.affinity_score += Number(affinity.affinity_score);
      existing.jobs_completed += affinity.jobs_completed;
    } else {
      staffScores.set(affinity.staff_id, {
        ...affinity,
        affinity_score: Number(affinity.affinity_score)
      });
    }
  });

  return Array.from(staffScores.values())
    .sort((a, b) => b.affinity_score - a.affinity_score)
    .slice(0, limit);
}

/**
 * Get analytics summary for AI context
 */
export async function getAnalyticsSummaryForAI(limit: number = 50): Promise<{
  completedJobs: number;
  staffPatterns: { staff_name: string; top_categories: string[]; score: number }[];
  categoryStats: { category: string; avg_hours: number; avg_margin: number }[];
}> {
  // Get job count
  const { count } = await supabase
    .from('job_completion_analytics')
    .select('*', { count: 'exact', head: true });

  // Get top staff patterns
  const { data: affinities } = await supabase
    .from('staff_job_affinity')
    .select('*')
    .order('affinity_score', { ascending: false })
    .limit(100);

  // Group by staff
  const staffPatterns = new Map<string, { categories: string[]; score: number }>();
  (affinities || []).forEach((a: any) => {
    const existing = staffPatterns.get(a.staff_name);
    if (existing) {
      existing.categories.push(a.product_category);
      existing.score += Number(a.affinity_score);
    } else {
      staffPatterns.set(a.staff_name, {
        categories: [a.product_category],
        score: Number(a.affinity_score)
      });
    }
  });

  // Get category statistics from analytics
  const { data: jobs } = await supabase
    .from('job_completion_analytics')
    .select('product_categories, total_hours_worked, margin_percentage')
    .order('completed_at', { ascending: false })
    .limit(limit);

  const categoryStats = new Map<string, { totalHours: number; totalMargin: number; count: number }>();
  (jobs || []).forEach((job: any) => {
    const categories = job.product_categories || [];
    categories.forEach((cat: ProductCategoryData) => {
      const existing = categoryStats.get(cat.name);
      if (existing) {
        existing.totalHours += Number(job.total_hours_worked) / categories.length;
        existing.totalMargin += Number(job.margin_percentage);
        existing.count += 1;
      } else {
        categoryStats.set(cat.name, {
          totalHours: Number(job.total_hours_worked) / categories.length,
          totalMargin: Number(job.margin_percentage),
          count: 1
        });
      }
    });
  });

  return {
    completedJobs: count || 0,
    staffPatterns: Array.from(staffPatterns.entries())
      .map(([name, data]) => ({
        staff_name: name,
        top_categories: data.categories.slice(0, 3),
        score: data.score
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    categoryStats: Array.from(categoryStats.entries())
      .map(([category, stats]) => ({
        category,
        avg_hours: stats.totalHours / stats.count,
        avg_margin: stats.totalMargin / stats.count
      }))
      .sort((a, b) => b.avg_margin - a.avg_margin)
  };
}

/**
 * Extract category from product name
 */
function extractCategory(productName: string): string {
  // Try to extract meaningful category from product name
  const lowerName = productName.toLowerCase();
  
  if (lowerName.includes('scen') || lowerName.includes('stage')) return 'Scen';
  if (lowerName.includes('ljud') || lowerName.includes('pa-') || lowerName.includes('sound')) return 'Ljud/PA';
  if (lowerName.includes('ljus') || lowerName.includes('belysning') || lowerName.includes('light')) return 'Belysning';
  if (lowerName.includes('tält') || lowerName.includes('tent')) return 'Tält';
  if (lowerName.includes('video') || lowerName.includes('led') || lowerName.includes('skärm')) return 'Video/LED';
  if (lowerName.includes('möbler') || lowerName.includes('stol') || lowerName.includes('bord')) return 'Möbler';
  if (lowerName.includes('inredning') || lowerName.includes('dekoration')) return 'Inredning';
  if (lowerName.includes('el') || lowerName.includes('kraft') || lowerName.includes('power')) return 'El/Kraft';
  if (lowerName.includes('rigg') || lowerName.includes('truss')) return 'Rigg/Truss';
  
  // Default: first word
  return productName.split(' ')[0] || 'Övrigt';
}

/**
 * Check if we have enough data for AI recommendations (minimum 10 jobs)
 */
export async function hasEnoughDataForRecommendations(): Promise<{ hasEnough: boolean; count: number }> {
  const { count } = await supabase
    .from('job_completion_analytics')
    .select('*', { count: 'exact', head: true });

  return {
    hasEnough: (count || 0) >= 10,
    count: count || 0
  };
}
