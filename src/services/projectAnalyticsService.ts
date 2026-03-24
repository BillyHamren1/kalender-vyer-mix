import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TimeSeriesFilter {
  startDate?: string;   // YYYY-MM-DD
  endDate?: string;
  clientName?: string;
  category?: string;
  projectType?: string;
  geographicArea?: string;
  staffId?: string;
}

export interface MonthlyProjectSummary {
  month: string;
  project_count: number;
  total_revenue: number;
  total_cost: number;
  total_margin: number;
  avg_margin_pct: number;
  total_hours: number;
  total_approved_hours: number;
  total_overtime: number;
  avg_staff_count: number;
  total_products: number;
  projects_with_deviations: number;
  projects_with_late_changes: number;
  avg_complexity: number;
}

export interface ProductProjectRow {
  product_name: string;
  category: string | null;
  sku: string | null;
  client_name: string;
  project_type: string | null;
  project_date: string;
  quantity: number;
  total_price: number;
  setup_hours: number;
  material_cost: number;
  external_cost: number;
  added_late: boolean;
  caused_deviation: boolean;
  margin_percentage: number | null;
  complexity_score: number | null;
}

export interface StaffProjectRow {
  staff_id: string;
  staff_name: string;
  role: string | null;
  client_name: string;
  project_type: string | null;
  project_date: string;
  work_date: string;
  hours_worked: number;
  overtime_hours: number;
  hourly_rate: number;
  labor_cost: number;
  margin_percentage: number | null;
}

export interface CategoryMonthlyRow {
  category: string;
  month: string;
  project_count: number;
  total_quantity: number;
  total_revenue: number;
  total_cost: number;
  total_setup_hours: number;
  late_additions: number;
  caused_deviations: number;
}

export interface StaffMonthlyRow {
  staff_id: string;
  staff_name: string;
  month: string;
  project_count: number;
  total_hours: number;
  total_overtime: number;
  total_labor_cost: number;
  avg_project_margin: number;
}

export interface ProductCombinationRow {
  category_a: string;
  category_b: string;
  co_occurrence_count: number;
  avg_margin_when_combined: number;
}

// ─── Query: Monthly project summary (time-series) ──────────────────────────

export async function getMonthlyProjectSummary(
  filter: TimeSeriesFilter = {},
): Promise<MonthlyProjectSummary[]> {
  // Use the view via raw SQL through RPC or direct query on base tables
  // Since views aren't in the generated types, we query base tables with the same logic
  let query = supabase
    .from('job_completion_analytics')
    .select('*');

  if (filter.startDate) {
    query = query.gte('event_date', filter.startDate);
  }
  if (filter.endDate) {
    query = query.lte('event_date', filter.endDate);
  }
  if (filter.clientName) {
    query = query.ilike('client_name', `%${filter.clientName}%`);
  }
  if (filter.projectType) {
    query = query.eq('project_type', filter.projectType);
  }
  if (filter.geographicArea) {
    query = query.eq('geographic_area', filter.geographicArea);
  }

  const { data, error } = await query.order('event_date', { ascending: true });

  if (error) {
    console.error('[Analytics] Failed to fetch project data:', error);
    return [];
  }

  // Aggregate by month client-side
  const monthMap = new Map<string, MonthlyProjectSummary>();

  (data || []).forEach((row: any) => {
    const dateStr = row.event_date || row.completed_at;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

    const existing = monthMap.get(monthKey);
    const revenue = Number(row.total_revenue) || 0;
    const cost = (Number(row.total_labor_cost) || 0)
      + (Number(row.total_material_cost) || 0)
      + (Number(row.total_external_cost) || 0)
      + (Number(row.total_purchases) || 0)
      + (Number(row.warehouse_handling_cost) || 0);

    if (existing) {
      existing.project_count++;
      existing.total_revenue += revenue;
      existing.total_cost += cost;
      existing.total_margin += Number(row.total_margin) || 0;
      existing.avg_margin_pct = ((existing.avg_margin_pct * (existing.project_count - 1)) + (Number(row.margin_percentage) || 0)) / existing.project_count;
      existing.total_hours += Number(row.total_hours_worked) || 0;
      existing.total_approved_hours += Number(row.total_approved_hours) || 0;
      existing.total_overtime += Number(row.total_overtime_hours) || 0;
      existing.avg_staff_count = ((existing.avg_staff_count * (existing.project_count - 1)) + (Number(row.total_staff_count) || 0)) / existing.project_count;
      existing.total_products += Number(row.total_products) || 0;
      existing.projects_with_deviations += row.had_deviations ? 1 : 0;
      existing.projects_with_late_changes += row.had_late_changes ? 1 : 0;
      existing.avg_complexity = ((existing.avg_complexity * (existing.project_count - 1)) + (Number(row.complexity_score) || 0)) / existing.project_count;
    } else {
      monthMap.set(monthKey, {
        month: monthKey,
        project_count: 1,
        total_revenue: revenue,
        total_cost: cost,
        total_margin: Number(row.total_margin) || 0,
        avg_margin_pct: Number(row.margin_percentage) || 0,
        total_hours: Number(row.total_hours_worked) || 0,
        total_approved_hours: Number(row.total_approved_hours) || 0,
        total_overtime: Number(row.total_overtime_hours) || 0,
        avg_staff_count: Number(row.total_staff_count) || 0,
        total_products: Number(row.total_products) || 0,
        projects_with_deviations: row.had_deviations ? 1 : 0,
        projects_with_late_changes: row.had_late_changes ? 1 : 0,
        avg_complexity: Number(row.complexity_score) || 0,
      });
    }
  });

  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Query: Product-project matrix ─────────────────────────────────────────

export async function getProductProjectMatrix(
  filter: TimeSeriesFilter = {},
): Promise<ProductProjectRow[]> {
  let query = supabase
    .from('completion_products')
    .select(`
      product_name, category, sku, quantity, total_price, setup_hours,
      material_cost, external_cost, is_package, added_late, caused_deviation,
      job_completion_analytics!inner(client_name, project_type, geographic_area,
        event_date, completed_at, margin_percentage, complexity_score)
    `);

  if (filter.category) {
    query = query.eq('category', filter.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Analytics] Failed to fetch product-project matrix:', error);
    return [];
  }

  return (data || []).map((row: any) => {
    const jca = row.job_completion_analytics;
    const projectDate = jca?.event_date || jca?.completed_at || '';
    
    // Apply date filter client-side (since it's on the joined table)
    if (filter.startDate && projectDate < filter.startDate) return null;
    if (filter.endDate && projectDate > filter.endDate) return null;
    if (filter.clientName && !jca?.client_name?.toLowerCase().includes(filter.clientName.toLowerCase())) return null;

    return {
      product_name: row.product_name,
      category: row.category,
      sku: row.sku,
      client_name: jca?.client_name || '',
      project_type: jca?.project_type,
      project_date: projectDate,
      quantity: Number(row.quantity) || 0,
      total_price: Number(row.total_price) || 0,
      setup_hours: Number(row.setup_hours) || 0,
      material_cost: Number(row.material_cost) || 0,
      external_cost: Number(row.external_cost) || 0,
      added_late: !!row.added_late,
      caused_deviation: !!row.caused_deviation,
      margin_percentage: jca?.margin_percentage != null ? Number(jca.margin_percentage) : null,
      complexity_score: jca?.complexity_score != null ? Number(jca.complexity_score) : null,
    };
  }).filter(Boolean) as ProductProjectRow[];
}

// ─── Query: Staff-project matrix ───────────────────────────────────────────

export async function getStaffProjectMatrix(
  filter: TimeSeriesFilter = {},
): Promise<StaffProjectRow[]> {
  let query = supabase
    .from('completion_staff')
    .select(`
      staff_id, staff_name, role, work_date, hours_worked, overtime_hours, hourly_rate,
      job_completion_analytics!inner(client_name, project_type, event_date, completed_at, margin_percentage)
    `);

  if (filter.staffId) {
    query = query.eq('staff_id', filter.staffId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Analytics] Failed to fetch staff-project matrix:', error);
    return [];
  }

  return (data || []).map((row: any) => {
    const jca = row.job_completion_analytics;
    const projectDate = jca?.event_date || jca?.completed_at || '';
    
    if (filter.startDate && projectDate < filter.startDate) return null;
    if (filter.endDate && projectDate > filter.endDate) return null;

    const hours = Number(row.hours_worked) || 0;
    const rate = Number(row.hourly_rate) || 0;

    return {
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      role: row.role,
      client_name: jca?.client_name || '',
      project_type: jca?.project_type,
      project_date: projectDate,
      work_date: row.work_date,
      hours_worked: hours,
      overtime_hours: Number(row.overtime_hours) || 0,
      hourly_rate: rate,
      labor_cost: hours * rate,
      margin_percentage: jca?.margin_percentage != null ? Number(jca.margin_percentage) : null,
    };
  }).filter(Boolean) as StaffProjectRow[];
}

// ─── Query: Product category trends per month ──────────────────────────────

export async function getProductCategoryMonthly(
  filter: TimeSeriesFilter = {},
): Promise<CategoryMonthlyRow[]> {
  const productMatrix = await getProductProjectMatrix(filter);

  const monthCatMap = new Map<string, CategoryMonthlyRow>();

  productMatrix.forEach(row => {
    const cat = row.category || 'Övrigt';
    const d = new Date(row.project_date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const key = `${monthKey}|${cat}`;

    const existing = monthCatMap.get(key);
    if (existing) {
      existing.project_count++;
      existing.total_quantity += row.quantity;
      existing.total_revenue += row.total_price;
      existing.total_cost += row.material_cost + row.external_cost;
      existing.total_setup_hours += row.setup_hours;
      existing.late_additions += row.added_late ? 1 : 0;
      existing.caused_deviations += row.caused_deviation ? 1 : 0;
    } else {
      monthCatMap.set(key, {
        category: cat,
        month: monthKey,
        project_count: 1,
        total_quantity: row.quantity,
        total_revenue: row.total_price,
        total_cost: row.material_cost + row.external_cost,
        total_setup_hours: row.setup_hours,
        late_additions: row.added_late ? 1 : 0,
        caused_deviations: row.caused_deviation ? 1 : 0,
      });
    }
  });

  return Array.from(monthCatMap.values()).sort((a, b) => a.month.localeCompare(b.month) || a.category.localeCompare(b.category));
}

// ─── Query: Staff monthly performance ──────────────────────────────────────

export async function getStaffMonthlyPerformance(
  filter: TimeSeriesFilter = {},
): Promise<StaffMonthlyRow[]> {
  const staffMatrix = await getStaffProjectMatrix(filter);

  const monthStaffMap = new Map<string, StaffMonthlyRow & { _marginSum: number; _marginCount: number }>();

  staffMatrix.forEach(row => {
    const d = new Date(row.work_date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const key = `${monthKey}|${row.staff_id}`;

    const existing = monthStaffMap.get(key);
    if (existing) {
      existing.project_count++;
      existing.total_hours += row.hours_worked;
      existing.total_overtime += row.overtime_hours;
      existing.total_labor_cost += row.labor_cost;
      if (row.margin_percentage != null) {
        existing._marginSum += row.margin_percentage;
        existing._marginCount++;
        existing.avg_project_margin = existing._marginSum / existing._marginCount;
      }
    } else {
      monthStaffMap.set(key, {
        staff_id: row.staff_id,
        staff_name: row.staff_name,
        month: monthKey,
        project_count: 1,
        total_hours: row.hours_worked,
        total_overtime: row.overtime_hours,
        total_labor_cost: row.labor_cost,
        avg_project_margin: row.margin_percentage || 0,
        _marginSum: row.margin_percentage || 0,
        _marginCount: row.margin_percentage != null ? 1 : 0,
      });
    }
  });

  return Array.from(monthStaffMap.values())
    .map(({ _marginSum, _marginCount, ...row }) => row)
    .sort((a, b) => a.month.localeCompare(b.month) || a.staff_name.localeCompare(b.staff_name));
}

// ─── Query: Product combinations (which categories appear together) ────────

export async function getProductCombinations(): Promise<ProductCombinationRow[]> {
  // Group products by completion_id to find co-occurrences
  const { data, error } = await supabase
    .from('completion_products')
    .select('completion_id, category')
    .not('category', 'is', null);

  if (error) {
    console.error('[Analytics] Failed to fetch product combinations:', error);
    return [];
  }

  // Group by completion
  const completionMap = new Map<string, Set<string>>();
  (data || []).forEach((row: any) => {
    const set = completionMap.get(row.completion_id) || new Set();
    set.add(row.category);
    completionMap.set(row.completion_id, set);
  });

  // Count pairs
  const pairMap = new Map<string, { count: number }>();
  completionMap.forEach(categories => {
    const cats = Array.from(categories).sort();
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const key = `${cats[i]}|${cats[j]}`;
        const existing = pairMap.get(key);
        if (existing) existing.count++;
        else pairMap.set(key, { count: 1 });
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
        avg_margin_when_combined: 0, // Would need a join to compute
      };
    })
    .sort((a, b) => b.co_occurrence_count - a.co_occurrence_count);
}

// ─── Convenience: Get distinct filter values ───────────────────────────────

export async function getDistinctFilterValues(): Promise<{
  clients: string[];
  categories: string[];
  projectTypes: string[];
  geographicAreas: string[];
  staffMembers: { id: string; name: string }[];
}> {
  const [clients, categories, projectTypes, areas, staff] = await Promise.all([
    supabase.from('job_completion_analytics').select('client_name').not('client_name', 'is', null),
    supabase.from('completion_products').select('category').not('category', 'is', null),
    supabase.from('job_completion_analytics').select('project_type').not('project_type', 'is', null),
    supabase.from('job_completion_analytics').select('geographic_area').not('geographic_area', 'is', null),
    supabase.from('completion_staff').select('staff_id, staff_name'),
  ]);

  return {
    clients: [...new Set((clients.data || []).map((r: any) => r.client_name))].sort(),
    categories: [...new Set((categories.data || []).map((r: any) => r.category))].sort(),
    projectTypes: [...new Set((projectTypes.data || []).map((r: any) => r.project_type))].filter(Boolean).sort(),
    geographicAreas: [...new Set((areas.data || []).map((r: any) => r.geographic_area))].filter(Boolean).sort(),
    staffMembers: [...new Map((staff.data || []).map((r: any) => [r.staff_id, { id: r.staff_id, name: r.staff_name }])).values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
