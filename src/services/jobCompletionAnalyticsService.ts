import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JobCompletionData {
  id?: string;
  booking_id: string;
  project_id?: string;
  booking_number?: string;
  client_name: string;
  customer_type?: string;
  project_type?: string;
  geographic_area?: string;
  rig_date?: string;
  event_date?: string;
  rigdown_date?: string;
  start_date?: string;
  end_date?: string;
  completed_at?: string;
  closed_at?: string;
  invoice_date?: string;
  delivery_address?: string;
  delivery_city?: string;
  carry_more_than_10m?: boolean;
  ground_nails_allowed?: boolean;
  exact_time_required?: boolean;
  is_indoor?: boolean;
  delivery_type?: string;
  complexity_score?: number;
  had_late_changes?: boolean;
  had_deviations?: boolean;
  deviation_types?: string[];
  product_categories?: ProductCategoryData[];
  total_products?: number;
  total_product_value?: number;
  total_setup_hours_estimated?: number;
  total_parcels?: number;
  total_deliveries?: number;
  staff_assignments?: StaffAssignmentData[];
  total_staff_count?: number;
  total_hours_worked?: number;
  total_approved_hours?: number;
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

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_WAREHOUSE_COST = 2500;

function extractCategory(productName: string): string {
  const l = productName.toLowerCase();
  if (l.includes('scen') || l.includes('stage')) return 'Scen';
  if (l.includes('ljud') || l.includes('pa-') || l.includes('sound')) return 'Ljud/PA';
  if (l.includes('ljus') || l.includes('belysning') || l.includes('light')) return 'Belysning';
  if (l.includes('tält') || l.includes('tent')) return 'Tält';
  if (l.includes('video') || l.includes('led') || l.includes('skärm')) return 'Video/LED';
  if (l.includes('möbler') || l.includes('stol') || l.includes('bord')) return 'Möbler';
  if (l.includes('inredning') || l.includes('dekoration')) return 'Inredning';
  if (l.includes('el') || l.includes('kraft') || l.includes('power')) return 'El/Kraft';
  if (l.includes('rigg') || l.includes('truss')) return 'Rigg/Truss';
  return productName.split(' ')[0] || 'Övrigt';
}

/** Infer delivery type from booking dates */
function inferDeliveryType(booking: any): string {
  const hasRig = !!booking.rigdaydate;
  const hasRigdown = !!booking.rigdowndate;
  if (hasRig && hasRigdown) return 'rigg_derigg';
  if (hasRig) return 'rigg';
  if (hasRigdown) return 'derigg';
  return 'leverans';
}

/** Infer geographic area from delivery city or postal code */
function inferGeographicArea(booking: any): string | undefined {
  if (booking.delivery_city) return booking.delivery_city;
  if (booking.delivery_postal_code) {
    const prefix = booking.delivery_postal_code.substring(0, 2);
    return `Postnr ${prefix}xxx`;
  }
  return undefined;
}

/** Detect if the booking had late product changes (products added after booking creation) */
async function detectLateChanges(bookingId: string, bookingCreatedAt: string): Promise<boolean> {
  // Check booking_changes for product additions after creation + 1 day
  const cutoff = new Date(bookingCreatedAt);
  cutoff.setDate(cutoff.getDate() + 1);

  const { data } = await supabase
    .from('booking_changes')
    .select('id')
    .eq('booking_id', bookingId)
    .gt('changed_at', cutoff.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/** Compute complexity score (1-5) from project characteristics */
function computeComplexity(
  totalProducts: number,
  totalStaff: number,
  hasRig: boolean,
  hasRigdown: boolean,
  exactTime: boolean,
  carryFar: boolean,
): number {
  let score = 1;
  if (totalProducts > 20) score++;
  if (totalProducts > 50) score++;
  if (totalStaff > 5) score++;
  if (hasRig && hasRigdown) score++;
  if (exactTime) score++;
  if (carryFar) score++;
  return Math.min(5, score);
}

// ─── Main: Record Job Completion ────────────────────────────────────────────

export async function recordJobCompletion(
  bookingId: string,
  warehouseCost: number = DEFAULT_WAREHOUSE_COST,
): Promise<JobCompletionData | null> {
  console.log('[JobAnalytics] Recording job completion for booking:', bookingId);

  try {
    // 1. Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[JobAnalytics] Failed to fetch booking:', bookingError);
      return null;
    }

    const projectId: string | undefined = booking.assigned_project_id || undefined;

    // 2. Fetch products
    const { data: products } = await supabase
      .from('booking_products')
      .select('*')
      .eq('booking_id', bookingId);

    const categoryMap = new Map<string, ProductCategoryData>();
    let totalProducts = 0;
    let totalProductValue = 0;
    let totalSetupHours = 0;
    let totalMaterialCost = 0;
    let totalExternalCost = 0;

    const productRows: any[] = [];

    (products || []).forEach(product => {
      const categoryName = extractCategory(product.name);
      const qty = product.quantity || 1;
      const unitPrice = Number(product.unit_price) || 0;
      const price = Number(product.total_price || 0) * qty;
      const setupHrs = (Number(product.setup_hours) || 0) * qty;
      const materialCost = (Number(product.material_cost) || 0) * qty;
      const externalCost = (Number(product.external_cost) || 0) * qty;

      totalProducts += qty;
      totalProductValue += price;
      totalSetupHours += setupHrs;
      totalMaterialCost += materialCost;
      totalExternalCost += externalCost;

      const existing = categoryMap.get(categoryName);
      if (existing) {
        existing.quantity += qty;
        existing.setup_hours += setupHrs;
        existing.total_price += price;
      } else {
        categoryMap.set(categoryName, { name: categoryName, quantity: qty, setup_hours: setupHrs, total_price: price });
      }

      // Build per-product row
      productRows.push({
        booking_product_id: product.id,
        product_name: product.name,
        quantity: qty,
        category: categoryName,
        sku: product.sku || null,
        unit_price: unitPrice,
        total_price: price,
        setup_hours: setupHrs,
        material_cost: materialCost,
        external_cost: externalCost,
        is_package: !!product.package_components,
        parent_package_name: product.parent_product_id ? 'paket' : null,
        added_late: false, // Will be updated below
        caused_deviation: false,
      });
    });

    // 3. Fetch time reports
    const { data: timeReports } = await supabase
      .from('time_reports')
      .select(`
        id, staff_id, hours_worked, overtime_hours, report_date, approved,
        staff_members!inner(name, role, hourly_rate, overtime_rate)
      `)
      .eq('booking_id', bookingId);

    const staffMap = new Map<string, StaffAssignmentData>();
    const staffRows: any[] = [];
    let totalHoursWorked = 0;
    let totalApprovedHours = 0;
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
      if (report.approved) totalApprovedHours += hours + overtime;

      // Per-staff row (one per date)
      staffRows.push({
        staff_id: staffId,
        staff_name: staff?.name || 'Okänd',
        role: staff?.role || null,
        work_date: report.report_date,
        hours_worked: hours,
        overtime_hours: overtime,
        hourly_rate: hourlyRate,
        approved: !!report.approved,
      });

      // Aggregated staff data for JSONB compat
      const existing = staffMap.get(staffId);
      if (existing) {
        existing.hours_worked += hours;
        existing.overtime_hours += overtime;
        if (!existing.dates.includes(report.report_date)) existing.dates.push(report.report_date);
      } else {
        staffMap.set(staffId, {
          staff_id: staffId,
          staff_name: staff?.name || 'Okänd',
          role: staff?.role || undefined,
          dates: [report.report_date],
          hours_worked: hours,
          overtime_hours: overtime,
          hourly_rate: hourlyRate,
        });
      }
    });

    // 4. Purchases
    let totalPurchases = 0;
    if (projectId) {
      const { data: purchases } = await supabase
        .from('project_purchases')
        .select('amount')
        .eq('project_id', projectId);
      totalPurchases = (purchases || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    }

    // 5. Parcels count (from packing if linked)
    let totalParcels = 0;
    if (booking.assigned_project_id) {
      const { data: packingProject } = await supabase
        .from('packing_projects')
        .select('id')
        .eq('booking_id', bookingId)
        .maybeSingle();
      if (packingProject) {
        const { count } = await supabase
          .from('packing_parcels')
          .select('id', { count: 'exact', head: true })
          .eq('packing_id', packingProject.id);
        totalParcels = count || 0;
      }
    }

    // 6. Detect late changes
    const hadLateChanges = await detectLateChanges(bookingId, booking.created_at);

    // 7. Infer structured fields
    const deliveryType = inferDeliveryType(booking);
    const geographicArea = inferGeographicArea(booking);
    const complexityScore = computeComplexity(
      totalProducts,
      staffMap.size,
      !!booking.rigdaydate,
      !!booking.rigdowndate,
      !!booking.exact_time_needed,
      !!booking.carry_more_than_10m,
    );

    // 8. Calculate margin
    const totalCosts = totalLaborCost + totalMaterialCost + totalExternalCost + totalPurchases + warehouseCost;
    const totalRevenue = totalProductValue;
    const totalMargin = totalRevenue - totalCosts;
    const marginPercentage = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

    // 9. Build the analytics record
    const analyticsData: any = {
      booking_id: bookingId,
      project_id: projectId || null,
      booking_number: booking.booking_number,
      client_name: booking.client,
      customer_type: null, // Set externally if known
      project_type: deliveryType,
      geographic_area: geographicArea,
      start_date: booking.rigdaydate || booking.eventdate,
      end_date: booking.rigdowndate || booking.eventdate,
      rig_date: booking.rigdaydate,
      event_date: booking.eventdate,
      rigdown_date: booking.rigdowndate,
      closed_at: new Date().toISOString(),
      delivery_address: booking.deliveryaddress,
      delivery_city: booking.delivery_city,
      delivery_type: deliveryType,
      carry_more_than_10m: booking.carry_more_than_10m || false,
      ground_nails_allowed: booking.ground_nails_allowed !== false,
      exact_time_required: booking.exact_time_needed || false,
      is_indoor: null, // Requires manual input or external data
      complexity_score: complexityScore,
      had_late_changes: hadLateChanges,
      had_deviations: false, // Set via deviations below
      deviation_types: [],
      product_categories: Array.from(categoryMap.values()),
      total_products: totalProducts,
      total_product_value: totalProductValue,
      total_setup_hours_estimated: totalSetupHours,
      total_parcels: totalParcels,
      total_deliveries: booking.rigdowndate ? 2 : 1,
      staff_assignments: Array.from(staffMap.values()),
      total_staff_count: staffMap.size,
      total_hours_worked: totalHoursWorked,
      total_approved_hours: totalApprovedHours,
      total_overtime_hours: totalOvertimeHours,
      total_labor_cost: totalLaborCost,
      total_material_cost: totalMaterialCost,
      total_external_cost: totalExternalCost,
      total_purchases: totalPurchases,
      total_revenue: totalRevenue,
      total_margin: totalMargin,
      margin_percentage: marginPercentage,
      warehouse_handling_cost: warehouseCost,
    };

    // 10. Upsert analytics record
    const { data: existingRecord } = await supabase
      .from('job_completion_analytics')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    let completionId: string;

    if (existingRecord) {
      const { error: updateError } = await supabase
        .from('job_completion_analytics')
        .update(analyticsData)
        .eq('id', existingRecord.id);
      if (updateError) {
        console.error('[JobAnalytics] Failed to update record:', updateError);
        return null;
      }
      completionId = existingRecord.id;

      // Clear old child records before re-inserting
      await Promise.all([
        supabase.from('completion_products').delete().eq('completion_id', completionId),
        supabase.from('completion_staff').delete().eq('completion_id', completionId),
        supabase.from('completion_deviations').delete().eq('completion_id', completionId),
      ]);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('job_completion_analytics')
        .insert(analyticsData)
        .select('id')
        .single();
      if (insertError || !inserted) {
        console.error('[JobAnalytics] Failed to insert record:', insertError);
        return null;
      }
      completionId = inserted.id;
    }

    // 11. Insert child rows — products + staff (in parallel)
    if (productRows.length > 0) {
      const rows = productRows.map(r => ({ ...r, completion_id: completionId }));
      const { error } = await supabase.from('completion_products').insert(rows as any);
      if (error) console.error('[JobAnalytics] Failed to insert completion_products:', error);
    }

    if (staffRows.length > 0) {
      const rows = staffRows.map(r => ({ ...r, completion_id: completionId }));
      const { error } = await supabase.from('completion_staff').insert(rows as any);
      if (error) console.error('[JobAnalytics] Failed to insert completion_staff:', error);
    }

    // 12. Update staff affinities
    await updateStaffAffinities(staffMap, categoryMap, totalSetupHours, totalHoursWorked);

    console.log('[JobAnalytics] Successfully recorded job completion with', productRows.length, 'products,', staffRows.length, 'staff rows');
    return analyticsData;
  } catch (error) {
    console.error('[JobAnalytics] Error recording job completion:', error);
    return null;
  }
}

// ─── Record deviation (called separately when deviations are registered) ────

export async function recordDeviation(
  bookingId: string,
  deviation: {
    deviation_type: string; // transport | damage | missing_material | extra_work
    description?: string;
    impact_type?: string; // time | cost | both
    impact_hours?: number;
    impact_cost?: number;
    related_product_id?: string;
    related_staff_id?: string;
  },
): Promise<boolean> {
  try {
    const { data: completion } = await supabase
      .from('job_completion_analytics')
      .select('id, had_deviations, deviation_types')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (!completion) {
      console.warn('[JobAnalytics] No completion record found for deviation on booking:', bookingId);
      return false;
    }

    // Insert deviation
    const { error } = await supabase
      .from('completion_deviations')
      .insert({
        completion_id: completion.id,
        deviation_type: deviation.deviation_type,
        description: deviation.description || null,
        impact_type: deviation.impact_type || null,
        impact_hours: deviation.impact_hours || 0,
        impact_cost: deviation.impact_cost || 0,
        related_product_id: deviation.related_product_id || null,
        related_staff_id: deviation.related_staff_id || null,
      } as any);

    if (error) {
      console.error('[JobAnalytics] Failed to insert deviation:', error);
      return false;
    }

    // Update parent record
    const existingTypes = (completion.deviation_types as string[]) || [];
    const newTypes = existingTypes.includes(deviation.deviation_type)
      ? existingTypes
      : [...existingTypes, deviation.deviation_type];

    await supabase
      .from('job_completion_analytics')
      .update({ had_deviations: true, deviation_types: newTypes } as any)
      .eq('id', completion.id);

    return true;
  } catch (err) {
    console.error('[JobAnalytics] Error recording deviation:', err);
    return false;
  }
}

// ─── Staff affinities ───────────────────────────────────────────────────────

async function updateStaffAffinities(
  staffMap: Map<string, StaffAssignmentData>,
  categoryMap: Map<string, ProductCategoryData>,
  totalEstimatedHours: number,
  totalActualHours: number,
): Promise<void> {
  const efficiency = totalActualHours > 0
    ? Math.min(2, totalEstimatedHours / totalActualHours)
    : 1;
  const categories = Array.from(categoryMap.keys());

  for (const [staffId, staffData] of staffMap.entries()) {
    for (const category of categories) {
      try {
        const { data: existing } = await supabase
          .from('staff_job_affinity')
          .select('*')
          .eq('staff_id', staffId)
          .eq('product_category', category)
          .maybeSingle();

        if (existing) {
          const newCount = existing.jobs_completed + 1;
          const newHrs = Number(existing.total_hours_on_category) + staffData.hours_worked;
          const newEff = (Number(existing.avg_efficiency_score) * existing.jobs_completed + efficiency) / newCount;
          await supabase
            .from('staff_job_affinity')
            .update({
              jobs_completed: newCount,
              total_hours_on_category: newHrs,
              avg_efficiency_score: newEff,
              affinity_score: newCount * newEff,
              last_job_date: new Date().toISOString().split('T')[0],
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('staff_job_affinity').insert({
            staff_id: staffId,
            staff_name: staffData.staff_name,
            product_category: category,
            jobs_completed: 1,
            total_hours_on_category: staffData.hours_worked,
            avg_efficiency_score: efficiency,
            affinity_score: efficiency,
            last_job_date: new Date().toISOString().split('T')[0],
          });
        }
      } catch (error) {
        console.error('[JobAnalytics] Error updating staff affinity:', error);
      }
    }
  }
}

// ─── Query helpers ──────────────────────────────────────────────────────────

export async function getStaffRecommendations(categories: string[], limit: number = 5): Promise<StaffJobAffinity[]> {
  if (categories.length === 0) return [];
  const { data, error } = await supabase
    .from('staff_job_affinity')
    .select('*')
    .in('product_category', categories)
    .order('affinity_score', { ascending: false })
    .limit(limit * categories.length);

  if (error) { console.error('[JobAnalytics] Failed to get staff recommendations:', error); return []; }

  const staffScores = new Map<string, StaffJobAffinity>();
  (data || []).forEach((a: any) => {
    const existing = staffScores.get(a.staff_id);
    if (existing) {
      existing.affinity_score += Number(a.affinity_score);
      existing.jobs_completed += a.jobs_completed;
    } else {
      staffScores.set(a.staff_id, { ...a, affinity_score: Number(a.affinity_score) });
    }
  });

  return Array.from(staffScores.values()).sort((a, b) => b.affinity_score - a.affinity_score).slice(0, limit);
}

export async function getAnalyticsSummaryForAI(limit: number = 50) {
  const { count } = await supabase
    .from('job_completion_analytics')
    .select('*', { count: 'exact', head: true });

  const { data: affinities } = await supabase
    .from('staff_job_affinity')
    .select('*')
    .order('affinity_score', { ascending: false })
    .limit(100);

  const staffPatterns = new Map<string, { categories: string[]; score: number }>();
  (affinities || []).forEach((a: any) => {
    const existing = staffPatterns.get(a.staff_name);
    if (existing) { existing.categories.push(a.product_category); existing.score += Number(a.affinity_score); }
    else { staffPatterns.set(a.staff_name, { categories: [a.product_category], score: Number(a.affinity_score) }); }
  });

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
        categoryStats.set(cat.name, { totalHours: Number(job.total_hours_worked) / categories.length, totalMargin: Number(job.margin_percentage), count: 1 });
      }
    });
  });

  return {
    completedJobs: count || 0,
    staffPatterns: Array.from(staffPatterns.entries())
      .map(([name, data]) => ({ staff_name: name, top_categories: data.categories.slice(0, 3), score: data.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    categoryStats: Array.from(categoryStats.entries())
      .map(([category, stats]) => ({ category, avg_hours: stats.totalHours / stats.count, avg_margin: stats.totalMargin / stats.count }))
      .sort((a, b) => b.avg_margin - a.avg_margin),
  };
}

export async function hasEnoughDataForRecommendations(): Promise<{ hasEnough: boolean; count: number }> {
  const { count } = await supabase
    .from('job_completion_analytics')
    .select('*', { count: 'exact', head: true });
  return { hasEnough: (count || 0) >= 10, count: count || 0 };
}
