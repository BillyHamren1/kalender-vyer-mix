/**
 * Derived Analytics Service
 * 
 * Centralized access to all derived/computed project economy data.
 * Uses the same definitions everywhere — reports, UI, AI.
 * 
 * Views in DB:
 *   v_derived_project          — per-project KPIs (TB, marginal, closure delay, etc.)
 *   v_derived_product          — per-product aggregates across projects
 *   v_derived_product_combinations — product co-occurrence with KPIs
 *   v_derived_staff            — per-staff aggregates
 *   v_derived_period           — monthly/quarterly/yearly roll-ups
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DerivedProject {
  id: string;
  booking_id: string;
  booking_number: string | null;
  client_name: string;
  customer_type: string | null;
  project_type: string | null;
  geographic_area: string | null;
  event_date: string | null;
  start_date: string | null;
  end_date: string | null;
  completed_at: string;
  closed_at: string | null;
  invoice_date: string | null;
  complexity_score: number | null;
  had_deviations: boolean;
  had_late_changes: boolean;
  total_products: number;
  total_staff_count: number;
  // Derived KPIs
  revenue: number;
  total_cost: number;
  tb: number;
  margin_pct: number;
  total_hours: number;
  approved_hours: number;
  overtime_hours: number;
  hours_per_revenue_sek: number | null;
  hours_per_product: number | null;
  closure_delay_days: number | null;
  days_to_invoice: number | null;
  project_duration_days: number | null;
}

export interface DerivedProduct {
  category: string | null;
  product_name: string;
  sku: string | null;
  project_count: number;
  total_quantity: number;
  total_revenue: number;
  total_direct_cost: number;
  avg_project_margin_pct: number;
  avg_project_hours: number;
  avg_project_revenue: number;
  in_profitable_projects: number;
  in_unprofitable_projects: number;
  late_addition_pct: number;
  deviation_pct: number;
}

export interface DerivedProductCombination {
  category_a: string;
  category_b: string;
  co_occurrence_count: number;
  avg_hours: number;
  avg_margin_pct: number;
  avg_revenue: number;
  avg_hours_per_product: number;
}

export interface DerivedStaff {
  staff_id: string;
  staff_name: string;
  project_count: number;
  total_hours: number;
  total_overtime: number;
  total_labor_cost: number;
  hours_by_project_type: Record<string, number>;
  avg_project_margin_pct: number;
  avg_project_hours: number;
}

export interface DerivedPeriod {
  month: string;
  quarter: string;
  year: number;
  project_count: number;
  total_revenue: number;
  total_cost: number;
  total_margin: number;
  margin_pct: number;
  avg_project_revenue: number;
  avg_project_hours: number;
  avg_staff_count: number;
  avg_products: number;
  total_hours: number;
  projects_with_deviations: number;
  projects_with_late_changes: number;
  avg_complexity: number;
  avg_closure_delay_days: number | null;
  avg_days_to_invoice: number | null;
}

export interface DerivedFilter {
  startDate?: string;
  endDate?: string;
  clientName?: string;
  category?: string;
  projectType?: string;
  geographicArea?: string;
  staffId?: string;
  year?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function mapRow<T>(row: any, mapper: (r: any) => T): T {
  return mapper(row);
}

// ─── Per-project derived data ───────────────────────────────────────────────

export async function getDerivedProjects(filter: DerivedFilter = {}): Promise<DerivedProject[]> {
  let query = supabase
    .from('job_completion_analytics')
    .select('*')
    .order('event_date', { ascending: false });

  if (filter.startDate) query = query.gte('event_date', filter.startDate);
  if (filter.endDate) query = query.lte('event_date', filter.endDate);
  if (filter.clientName) query = query.ilike('client_name', `%${filter.clientName}%`);
  if (filter.projectType) query = query.eq('project_type', filter.projectType);
  if (filter.geographicArea) query = query.eq('geographic_area', filter.geographicArea);

  const { data, error } = await query;
  if (error) { console.error('[DerivedAnalytics] project query failed:', error); return []; }

  return (data || []).map((j: any) => {
    const revenue = toNumber(j.total_revenue);
    const totalCost = toNumber(j.total_labor_cost) + toNumber(j.total_material_cost)
      + toNumber(j.total_external_cost) + toNumber(j.total_purchases) + toNumber(j.warehouse_handling_cost);
    const tb = revenue - totalCost;
    const marginPct = revenue > 0 ? Math.round((tb / revenue) * 10000) / 100 : 0;
    const totalHours = toNumber(j.total_hours_worked);
    const totalProducts = toNumber(j.total_products);

    const closedAt = j.closed_at ? new Date(j.closed_at) : null;
    const eventDate = j.event_date ? new Date(j.event_date) : null;
    const invoiceDate = j.invoice_date ? new Date(j.invoice_date) : null;
    const startDate = j.start_date ? new Date(j.start_date) : null;
    const endDate = j.end_date ? new Date(j.end_date) : null;

    return {
      id: j.id,
      booking_id: j.booking_id,
      booking_number: j.booking_number,
      client_name: j.client_name,
      customer_type: j.customer_type,
      project_type: j.project_type,
      geographic_area: j.geographic_area,
      event_date: j.event_date,
      start_date: j.start_date,
      end_date: j.end_date,
      completed_at: j.completed_at,
      closed_at: j.closed_at,
      invoice_date: j.invoice_date,
      complexity_score: j.complexity_score,
      had_deviations: !!j.had_deviations,
      had_late_changes: !!j.had_late_changes,
      total_products: totalProducts,
      total_staff_count: toNumber(j.total_staff_count),
      revenue,
      total_cost: totalCost,
      tb,
      margin_pct: marginPct,
      total_hours: totalHours,
      approved_hours: toNumber(j.total_approved_hours),
      overtime_hours: toNumber(j.total_overtime_hours),
      hours_per_revenue_sek: revenue > 0 ? Math.round((totalHours / revenue) * 1000000) / 1000000 : null,
      hours_per_product: totalProducts > 0 ? Math.round((totalHours / totalProducts) * 100) / 100 : null,
      closure_delay_days: closedAt && eventDate
        ? Math.round((closedAt.getTime() - eventDate.getTime()) / 86400000)
        : null,
      days_to_invoice: invoiceDate && eventDate
        ? Math.round((invoiceDate.getTime() - eventDate.getTime()) / 86400000)
        : null,
      project_duration_days: startDate && endDate
        ? Math.round((endDate.getTime() - startDate.getTime()) / 86400000)
        : null,
    };
  });
}

// ─── Per-product derived data ───────────────────────────────────────────────

export async function getDerivedProducts(filter: DerivedFilter = {}): Promise<DerivedProduct[]> {
  // Fetch all completion_products joined with project data
  let query = supabase
    .from('completion_products')
    .select(`
      product_name, category, sku, quantity, total_price, material_cost, external_cost,
      added_late, caused_deviation,
      job_completion_analytics!inner(
        event_date, total_margin, margin_percentage, total_hours_worked, total_revenue
      )
    `);

  if (filter.category) query = query.eq('category', filter.category);

  const { data, error } = await query;
  if (error) { console.error('[DerivedAnalytics] product query failed:', error); return []; }

  // Aggregate by product_name + category + sku
  const aggMap = new Map<string, {
    category: string | null;
    product_name: string;
    sku: string | null;
    completionIds: Set<string>;
    totalQty: number;
    totalRevenue: number;
    totalDirectCost: number;
    marginSum: number;
    hoursSum: number;
    projectRevenueSum: number;
    profitable: number;
    unprofitable: number;
    lateCount: number;
    deviationCount: number;
    count: number;
  }>();

  (data || []).forEach((row: any) => {
    const jca = row.job_completion_analytics;
    if (!jca) return;

    // Apply date filter
    if (filter.startDate && jca.event_date && jca.event_date < filter.startDate) return;
    if (filter.endDate && jca.event_date && jca.event_date > filter.endDate) return;

    const key = `${row.category || ''}|${row.product_name}|${row.sku || ''}`;
    const existing = aggMap.get(key);
    const margin = toNumber(jca.total_margin);

    if (existing) {
      existing.count++;
      existing.totalQty += toNumber(row.quantity);
      existing.totalRevenue += toNumber(row.total_price);
      existing.totalDirectCost += toNumber(row.material_cost) + toNumber(row.external_cost);
      existing.marginSum += toNumber(jca.margin_percentage);
      existing.hoursSum += toNumber(jca.total_hours_worked);
      existing.projectRevenueSum += toNumber(jca.total_revenue);
      existing.profitable += margin > 0 ? 1 : 0;
      existing.unprofitable += margin <= 0 ? 1 : 0;
      existing.lateCount += row.added_late ? 1 : 0;
      existing.deviationCount += row.caused_deviation ? 1 : 0;
    } else {
      aggMap.set(key, {
        category: row.category,
        product_name: row.product_name,
        sku: row.sku,
        completionIds: new Set(),
        totalQty: toNumber(row.quantity),
        totalRevenue: toNumber(row.total_price),
        totalDirectCost: toNumber(row.material_cost) + toNumber(row.external_cost),
        marginSum: toNumber(jca.margin_percentage),
        hoursSum: toNumber(jca.total_hours_worked),
        projectRevenueSum: toNumber(jca.total_revenue),
        profitable: margin > 0 ? 1 : 0,
        unprofitable: margin <= 0 ? 1 : 0,
        lateCount: row.added_late ? 1 : 0,
        deviationCount: row.caused_deviation ? 1 : 0,
        count: 1,
      });
    }
  });

  return Array.from(aggMap.values()).map(a => ({
    category: a.category,
    product_name: a.product_name,
    sku: a.sku,
    project_count: a.count,
    total_quantity: a.totalQty,
    total_revenue: a.totalRevenue,
    total_direct_cost: a.totalDirectCost,
    avg_project_margin_pct: a.count > 0 ? Math.round((a.marginSum / a.count) * 100) / 100 : 0,
    avg_project_hours: a.count > 0 ? Math.round((a.hoursSum / a.count) * 100) / 100 : 0,
    avg_project_revenue: a.count > 0 ? Math.round(a.projectRevenueSum / a.count) : 0,
    in_profitable_projects: a.profitable,
    in_unprofitable_projects: a.unprofitable,
    late_addition_pct: a.count > 0 ? Math.round((a.lateCount / a.count) * 1000) / 10 : 0,
    deviation_pct: a.count > 0 ? Math.round((a.deviationCount / a.count) * 1000) / 10 : 0,
  })).sort((a, b) => b.project_count - a.project_count);
}

// ─── Per-product combination ────────────────────────────────────────────────

export async function getDerivedProductCombinations(): Promise<DerivedProductCombination[]> {
  const { data, error } = await supabase
    .from('completion_products')
    .select('completion_id, category');

  if (error) { console.error('[DerivedAnalytics] combo query failed:', error); return []; }

  // Get project data for margin/hours
  const { data: projects } = await supabase
    .from('job_completion_analytics')
    .select('id, total_hours_worked, margin_percentage, total_revenue, total_products');

  const projectMap = new Map<string, any>();
  (projects || []).forEach((p: any) => projectMap.set(p.id, p));

  // Group categories by completion
  const completionMap = new Map<string, Set<string>>();
  (data || []).forEach((r: any) => {
    if (!r.category) return;
    const set = completionMap.get(r.completion_id) || new Set();
    set.add(r.category);
    completionMap.set(r.completion_id, set);
  });

  // Count pairs with KPIs
  const pairMap = new Map<string, {
    count: number;
    hoursSum: number;
    marginSum: number;
    revenueSum: number;
    hppSum: number;
    hppCount: number;
  }>();

  completionMap.forEach((cats, completionId) => {
    const sorted = Array.from(cats).sort();
    const proj = projectMap.get(completionId);
    const hours = toNumber(proj?.total_hours_worked);
    const margin = toNumber(proj?.margin_percentage);
    const revenue = toNumber(proj?.total_revenue);
    const products = toNumber(proj?.total_products);
    const hpp = products > 0 ? hours / products : null;

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|${sorted[j]}`;
        const ex = pairMap.get(key);
        if (ex) {
          ex.count++;
          ex.hoursSum += hours;
          ex.marginSum += margin;
          ex.revenueSum += revenue;
          if (hpp !== null) { ex.hppSum += hpp; ex.hppCount++; }
        } else {
          pairMap.set(key, {
            count: 1, hoursSum: hours, marginSum: margin, revenueSum: revenue,
            hppSum: hpp || 0, hppCount: hpp !== null ? 1 : 0,
          });
        }
      }
    }
  });

  return Array.from(pairMap.entries())
    .filter(([, v]) => v.count >= 2)
    .map(([key, v]) => {
      const [a, b] = key.split('|');
      return {
        category_a: a,
        category_b: b,
        co_occurrence_count: v.count,
        avg_hours: Math.round((v.hoursSum / v.count) * 10) / 10,
        avg_margin_pct: Math.round((v.marginSum / v.count) * 100) / 100,
        avg_revenue: Math.round(v.revenueSum / v.count),
        avg_hours_per_product: v.hppCount > 0 ? Math.round((v.hppSum / v.hppCount) * 100) / 100 : 0,
      };
    })
    .sort((a, b) => b.co_occurrence_count - a.co_occurrence_count);
}

// ─── Per-staff derived data ─────────────────────────────────────────────────

export async function getDerivedStaff(filter: DerivedFilter = {}): Promise<DerivedStaff[]> {
  let query = supabase
    .from('completion_staff')
    .select(`
      staff_id, staff_name, hours_worked, overtime_hours, hourly_rate,
      job_completion_analytics!inner(project_type, margin_percentage, total_hours_worked)
    `);

  if (filter.staffId) query = query.eq('staff_id', filter.staffId);

  const { data, error } = await query;
  if (error) { console.error('[DerivedAnalytics] staff query failed:', error); return []; }

  const staffMap = new Map<string, {
    staff_name: string;
    completionIds: Set<string>;
    totalHours: number;
    totalOvertime: number;
    totalLaborCost: number;
    hoursByType: Record<string, number>;
    marginSum: number;
    projectHoursSum: number;
    count: number;
  }>();

  (data || []).forEach((row: any) => {
    const jca = row.job_completion_analytics;
    const hours = toNumber(row.hours_worked);
    const rate = toNumber(row.hourly_rate);
    const pType = jca?.project_type || 'unknown';

    const ex = staffMap.get(row.staff_id);
    if (ex) {
      ex.count++;
      ex.totalHours += hours;
      ex.totalOvertime += toNumber(row.overtime_hours);
      ex.totalLaborCost += hours * rate;
      ex.hoursByType[pType] = (ex.hoursByType[pType] || 0) + hours;
      ex.marginSum += toNumber(jca?.margin_percentage);
      ex.projectHoursSum += toNumber(jca?.total_hours_worked);
    } else {
      staffMap.set(row.staff_id, {
        staff_name: row.staff_name,
        completionIds: new Set(),
        totalHours: hours,
        totalOvertime: toNumber(row.overtime_hours),
        totalLaborCost: hours * rate,
        hoursByType: { [pType]: hours },
        marginSum: toNumber(jca?.margin_percentage),
        projectHoursSum: toNumber(jca?.total_hours_worked),
        count: 1,
      });
    }
  });

  return Array.from(staffMap.entries()).map(([id, s]) => ({
    staff_id: id,
    staff_name: s.staff_name,
    project_count: s.count,
    total_hours: s.totalHours,
    total_overtime: s.totalOvertime,
    total_labor_cost: s.totalLaborCost,
    hours_by_project_type: s.hoursByType,
    avg_project_margin_pct: s.count > 0 ? Math.round((s.marginSum / s.count) * 100) / 100 : 0,
    avg_project_hours: s.count > 0 ? Math.round((s.projectHoursSum / s.count) * 10) / 10 : 0,
  })).sort((a, b) => b.total_hours - a.total_hours);
}

// ─── Per-period derived data ────────────────────────────────────────────────

export async function getDerivedPeriods(filter: DerivedFilter = {}): Promise<DerivedPeriod[]> {
  let query = supabase
    .from('job_completion_analytics')
    .select('*')
    .order('event_date', { ascending: true });

  if (filter.startDate) query = query.gte('event_date', filter.startDate);
  if (filter.endDate) query = query.lte('event_date', filter.endDate);
  if (filter.year) {
    query = query.gte('event_date', `${filter.year}-01-01`).lte('event_date', `${filter.year}-12-31`);
  }

  const { data, error } = await query;
  if (error) { console.error('[DerivedAnalytics] period query failed:', error); return []; }

  const monthMap = new Map<string, {
    month: string;
    quarter: string;
    year: number;
    count: number;
    revenue: number;
    cost: number;
    margin: number;
    hours: number;
    staffSum: number;
    productsSum: number;
    deviations: number;
    lateChanges: number;
    complexitySum: number;
    closureDelaySum: number;
    closureDelayCount: number;
    daysToInvoiceSum: number;
    daysToInvoiceCount: number;
  }>();

  (data || []).forEach((j: any) => {
    const dateStr = j.event_date || j.completed_at;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const qMonth = Math.floor(d.getMonth() / 3) * 3 + 1;
    const quarterKey = `${d.getFullYear()}-${String(qMonth).padStart(2, '0')}-01`;

    const revenue = toNumber(j.total_revenue);
    const cost = toNumber(j.total_labor_cost) + toNumber(j.total_material_cost)
      + toNumber(j.total_external_cost) + toNumber(j.total_purchases) + toNumber(j.warehouse_handling_cost);

    const closedAt = j.closed_at ? new Date(j.closed_at) : null;
    const eventDate = j.event_date ? new Date(j.event_date) : null;
    const invoiceDate = j.invoice_date ? new Date(j.invoice_date) : null;
    const closureDelay = closedAt && eventDate ? (closedAt.getTime() - eventDate.getTime()) / 86400000 : null;
    const daysToInvoice = invoiceDate && eventDate ? (invoiceDate.getTime() - eventDate.getTime()) / 86400000 : null;

    const ex = monthMap.get(monthKey);
    if (ex) {
      ex.count++;
      ex.revenue += revenue;
      ex.cost += cost;
      ex.margin += revenue - cost;
      ex.hours += toNumber(j.total_hours_worked);
      ex.staffSum += toNumber(j.total_staff_count);
      ex.productsSum += toNumber(j.total_products);
      ex.deviations += j.had_deviations ? 1 : 0;
      ex.lateChanges += j.had_late_changes ? 1 : 0;
      ex.complexitySum += toNumber(j.complexity_score);
      if (closureDelay !== null) { ex.closureDelaySum += closureDelay; ex.closureDelayCount++; }
      if (daysToInvoice !== null) { ex.daysToInvoiceSum += daysToInvoice; ex.daysToInvoiceCount++; }
    } else {
      monthMap.set(monthKey, {
        month: monthKey,
        quarter: quarterKey,
        year: d.getFullYear(),
        count: 1,
        revenue,
        cost,
        margin: revenue - cost,
        hours: toNumber(j.total_hours_worked),
        staffSum: toNumber(j.total_staff_count),
        productsSum: toNumber(j.total_products),
        deviations: j.had_deviations ? 1 : 0,
        lateChanges: j.had_late_changes ? 1 : 0,
        complexitySum: toNumber(j.complexity_score),
        closureDelaySum: closureDelay || 0,
        closureDelayCount: closureDelay !== null ? 1 : 0,
        daysToInvoiceSum: daysToInvoice || 0,
        daysToInvoiceCount: daysToInvoice !== null ? 1 : 0,
      });
    }
  });

  return Array.from(monthMap.values()).map(m => ({
    month: m.month,
    quarter: m.quarter,
    year: m.year,
    project_count: m.count,
    total_revenue: m.revenue,
    total_cost: m.cost,
    total_margin: m.margin,
    margin_pct: m.revenue > 0 ? Math.round((m.margin / m.revenue) * 10000) / 100 : 0,
    avg_project_revenue: Math.round(m.revenue / m.count),
    avg_project_hours: Math.round((m.hours / m.count) * 10) / 10,
    avg_staff_count: Math.round((m.staffSum / m.count) * 10) / 10,
    avg_products: Math.round((m.productsSum / m.count) * 10) / 10,
    total_hours: m.hours,
    projects_with_deviations: m.deviations,
    projects_with_late_changes: m.lateChanges,
    avg_complexity: Math.round((m.complexitySum / m.count) * 10) / 10,
    avg_closure_delay_days: m.closureDelayCount > 0 ? Math.round((m.closureDelaySum / m.closureDelayCount) * 10) / 10 : null,
    avg_days_to_invoice: m.daysToInvoiceCount > 0 ? Math.round((m.daysToInvoiceSum / m.daysToInvoiceCount) * 10) / 10 : null,
  })).sort((a, b) => a.month.localeCompare(b.month));
}
