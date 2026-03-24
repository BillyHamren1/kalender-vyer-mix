/**
 * Analytics Export Service
 * 
 * Provides structured dataset generation and CSV/JSON export
 * for ALL analytics dimensions. Same definitions used for UI, export, and AI.
 */

import {
  getDerivedProjects,
  getDerivedProducts,
  getDerivedProductCombinations,
  getDerivedStaff,
  getDerivedPeriods,
  type DerivedFilter,
  type DerivedProject,
  type DerivedProduct,
  type DerivedProductCombination,
  type DerivedStaff,
  type DerivedPeriod,
} from './derivedAnalyticsService';

// ─── Dataset types ──────────────────────────────────────────────────────────

export type DatasetType =
  // Project
  | 'project_most_profitable'
  | 'project_least_profitable'
  | 'project_highest_time'
  | 'project_lowest_margin'
  | 'project_late_closure'
  | 'project_most_deviations'
  | 'project_by_customer'
  | 'project_by_type'
  | 'project_margin_over_time'
  // Product
  | 'product_profitability'
  | 'product_in_profitable'
  | 'product_in_unprofitable'
  | 'product_high_time'
  | 'product_causes_deviations'
  | 'product_high_frequency'
  | 'product_low_margin'
  | 'product_needs_price_increase'
  // Combinations
  | 'combo_most_common'
  | 'combo_high_time'
  | 'combo_low_margin'
  | 'combo_causes_problems'
  // Staff
  | 'staff_hours'
  | 'staff_by_project_type'
  | 'staff_workload_over_time'
  | 'staff_efficiency'
  | 'staff_project_types'
  // Time
  | 'time_per_project'
  | 'time_over_time'
  | 'time_vs_revenue'
  | 'time_vs_margin'
  | 'time_avg_per_project'
  | 'time_by_project_type'
  // Economy
  | 'economy_revenue_over_time'
  | 'economy_cost_over_time'
  | 'economy_margin_over_time'
  | 'economy_tb_over_time'
  | 'economy_revenue_per_project'
  | 'economy_revenue_per_category'
  // Deviations
  | 'deviation_by_project'
  | 'deviation_by_product'
  | 'deviation_over_time'
  | 'deviation_impact'
  // Forecasts
  | 'forecast_expected_time'
  | 'forecast_expected_margin'
  | 'forecast_risk_projects'
  | 'forecast_inefficient_setups';

export type DatasetCategory = 'project' | 'product' | 'combo' | 'staff' | 'time' | 'economy' | 'deviation' | 'forecast';

export interface DatasetMeta {
  type: DatasetType;
  category: DatasetCategory;
  label: string;
  description: string;
  columns: string[];
}

// ─── Column sets ────────────────────────────────────────────────────────────

const PROJECT_COLS = ['booking_number', 'client_name', 'customer_type', 'project_type', 'geographic_area', 'event_date', 'revenue', 'total_cost', 'tb', 'margin_pct', 'total_hours', 'approved_hours', 'overtime_hours', 'total_products', 'total_staff_count', 'hours_per_revenue_sek', 'hours_per_product', 'closure_delay_days', 'days_to_invoice', 'project_duration_days', 'had_deviations', 'had_late_changes', 'complexity_score'];
const PRODUCT_COLS = ['product_name', 'category', 'sku', 'project_count', 'total_quantity', 'total_revenue', 'total_direct_cost', 'avg_project_margin_pct', 'avg_project_hours', 'avg_project_revenue', 'in_profitable_projects', 'in_unprofitable_projects', 'late_addition_pct', 'deviation_pct'];
const COMBO_COLS = ['category_a', 'category_b', 'co_occurrence_count', 'avg_hours', 'avg_margin_pct', 'avg_revenue', 'avg_hours_per_product'];
const STAFF_COLS = ['staff_name', 'project_count', 'total_hours', 'total_overtime', 'total_labor_cost', 'avg_project_margin_pct', 'avg_project_hours'];
const TIME_COLS = ['booking_number', 'client_name', 'project_type', 'event_date', 'total_hours', 'approved_hours', 'overtime_hours', 'hours_per_revenue_sek', 'hours_per_product', 'total_staff_count', 'revenue', 'total_cost', 'margin_pct'];
const PERIOD_COLS = ['month', 'project_count', 'total_revenue', 'total_cost', 'total_margin', 'margin_pct', 'total_hours', 'avg_project_revenue', 'avg_project_hours', 'avg_staff_count', 'avg_products', 'projects_with_deviations', 'projects_with_late_changes', 'avg_complexity', 'avg_closure_delay_days'];

export const DATASET_DEFINITIONS: DatasetMeta[] = [
  // ── Project Analysis ──
  { type: 'project_most_profitable', category: 'project', label: 'Mest lönsamma projekt', description: 'Projekt sorterade efter högst marginal', columns: PROJECT_COLS },
  { type: 'project_least_profitable', category: 'project', label: 'Minst lönsamma projekt', description: 'Projekt sorterade efter lägst marginal', columns: PROJECT_COLS },
  { type: 'project_highest_time', category: 'project', label: 'Projekt med högst tidsåtgång', description: 'Projekt med mest nedlagda timmar', columns: PROJECT_COLS },
  { type: 'project_lowest_margin', category: 'project', label: 'Projekt med lägst marginal', description: 'Projekt under noll eller med sämst marginal', columns: PROJECT_COLS },
  { type: 'project_late_closure', category: 'project', label: 'Projekt som stängs sent', description: 'Projekt med lång closure delay', columns: PROJECT_COLS },
  { type: 'project_most_deviations', category: 'project', label: 'Projekt med flest avvikelser', description: 'Projekt som haft avvikelser och sena ändringar', columns: PROJECT_COLS },
  { type: 'project_by_customer', category: 'project', label: 'Projekt per kund/kundtyp', description: 'Aggregering av projekt grupperade per kund och kundtyp', columns: ['client_name', 'customer_type', 'project_count', 'total_revenue', 'total_cost', 'avg_margin_pct', 'total_hours', 'avg_closure_delay'] },
  { type: 'project_by_type', category: 'project', label: 'Projekt per projekttyp', description: 'Aggregering grupperad per projekttyp', columns: ['project_type', 'project_count', 'total_revenue', 'total_cost', 'avg_margin_pct', 'total_hours', 'avg_hours_per_project', 'deviation_rate'] },
  { type: 'project_margin_over_time', category: 'project', label: 'Projektmarginal över tid', description: 'Genomsnittlig marginal per månad', columns: PERIOD_COLS },

  // ── Product Analysis ──
  { type: 'product_profitability', category: 'product', label: 'Produktlönsamhet (alla)', description: 'Alla produkter med lönsamhetsindikatorer', columns: PRODUCT_COLS },
  { type: 'product_in_profitable', category: 'product', label: 'Produkter i lönsamma projekt', description: 'Produkter som oftast förekommer i lönsamma projekt', columns: PRODUCT_COLS },
  { type: 'product_in_unprofitable', category: 'product', label: 'Produkter i olönsamma projekt', description: 'Produkter som ofta förekommer i olönsamma projekt', columns: PRODUCT_COLS },
  { type: 'product_high_time', category: 'product', label: 'Produkter med hög tidsbelastning', description: 'Produkter i projekt med hög genomsnittlig tidsåtgång', columns: PRODUCT_COLS },
  { type: 'product_causes_deviations', category: 'product', label: 'Produkter som orsakar avvikelser', description: 'Produkter med hög avvikelsefrekvens', columns: PRODUCT_COLS },
  { type: 'product_high_frequency', category: 'product', label: 'Mest använda produkter', description: 'Produkter sorterade efter antal projekt de förekommer i', columns: PRODUCT_COLS },
  { type: 'product_low_margin', category: 'product', label: 'Produkter med låg lönsamhet', description: 'Produkter som förekommer i projekt med låg marginal', columns: PRODUCT_COLS },
  { type: 'product_needs_price_increase', category: 'product', label: 'Produkter att prishöja', description: 'Produkter med hög frekvens men låg marginal — kandidater för prishöjning', columns: [...PRODUCT_COLS, 'price_increase_score'] },

  // ── Combinations ──
  { type: 'combo_most_common', category: 'combo', label: 'Vanligaste kombinationer', description: 'Produktkategorier som oftast förekommer tillsammans', columns: COMBO_COLS },
  { type: 'combo_high_time', category: 'combo', label: 'Kombinationer med hög tidsåtgång', description: 'Kombinationer som driver mest tid', columns: COMBO_COLS },
  { type: 'combo_low_margin', category: 'combo', label: 'Kombinationer med låg marginal', description: 'Kombinationer med sämst marginal', columns: COMBO_COLS },
  { type: 'combo_causes_problems', category: 'combo', label: 'Problemkombinationer', description: 'Kombinationer som ofta leder till avvikelser', columns: COMBO_COLS },

  // ── Staff Analysis ──
  { type: 'staff_hours', category: 'staff', label: 'Timmar per anställd', description: 'Totala timmar och övertid per personal', columns: STAFF_COLS },
  { type: 'staff_by_project_type', category: 'staff', label: 'Personal per projekttyp', description: 'Personalens timmar uppdelat per projekttyp', columns: ['staff_name', 'project_type', 'hours', 'project_count'] },
  { type: 'staff_workload_over_time', category: 'staff', label: 'Belastning över tid', description: 'Totala timmar per månad', columns: PERIOD_COLS },
  { type: 'staff_efficiency', category: 'staff', label: 'Effektivitet (tid vs projektvärde)', description: 'Personal rankat efter intäkt per arbetad timme', columns: ['staff_name', 'total_hours', 'total_project_revenue', 'revenue_per_hour', 'avg_project_margin_pct', 'project_count'] },
  { type: 'staff_project_types', category: 'staff', label: 'Personalens projekttyper', description: 'Vilka projekttyper varje person jobbar med', columns: ['staff_name', 'project_types', 'dominant_type', 'total_hours', 'project_count'] },

  // ── Time Analysis ──
  { type: 'time_per_project', category: 'time', label: 'Tid per projekt', description: 'Alla projekt med tidsdata', columns: TIME_COLS },
  { type: 'time_over_time', category: 'time', label: 'Tid över tid', description: 'Totala timmar per månad', columns: PERIOD_COLS },
  { type: 'time_vs_revenue', category: 'time', label: 'Tid vs intäkt', description: 'Projekt rankade efter timmar per intäktskrona', columns: TIME_COLS },
  { type: 'time_vs_margin', category: 'time', label: 'Tid vs marginal', description: 'Samband mellan tidsåtgång och marginal', columns: TIME_COLS },
  { type: 'time_avg_per_project', category: 'time', label: 'Genomsnittlig projekttid', description: 'Snittid per projekttyp och storlek', columns: ['project_type', 'project_count', 'avg_hours', 'median_hours', 'min_hours', 'max_hours', 'avg_staff_count'] },
  { type: 'time_by_project_type', category: 'time', label: 'Tid per projekttyp', description: 'Totala timmar per projekttyp', columns: ['project_type', 'project_count', 'total_hours', 'avg_hours', 'total_revenue', 'avg_margin_pct'] },

  // ── Economic Analysis ──
  { type: 'economy_revenue_over_time', category: 'economy', label: 'Omsättning över tid', description: 'Månatlig omsättning', columns: PERIOD_COLS },
  { type: 'economy_cost_over_time', category: 'economy', label: 'Kostnad över tid', description: 'Månatlig kostnad', columns: PERIOD_COLS },
  { type: 'economy_margin_over_time', category: 'economy', label: 'Marginal över tid', description: 'Marginal % per månad', columns: PERIOD_COLS },
  { type: 'economy_tb_over_time', category: 'economy', label: 'TB över tid', description: 'Täckningsbidrag per månad', columns: PERIOD_COLS },
  { type: 'economy_revenue_per_project', category: 'economy', label: 'Intäkt per projekt', description: 'Alla projekt sorterade efter intäkt', columns: PROJECT_COLS },
  { type: 'economy_revenue_per_category', category: 'economy', label: 'Intäkt per produktkategori', description: 'Aggregerad intäkt per produktkategori', columns: ['category', 'product_count', 'total_quantity', 'total_revenue', 'total_direct_cost', 'avg_project_margin_pct', 'project_count'] },

  // ── Deviation Analysis ──
  { type: 'deviation_by_project', category: 'deviation', label: 'Avvikelser per projekt', description: 'Projekt som oftast får problem', columns: PROJECT_COLS },
  { type: 'deviation_by_product', category: 'deviation', label: 'Avvikelser per produkt', description: 'Produkter kopplade till avvikelser', columns: PRODUCT_COLS },
  { type: 'deviation_over_time', category: 'deviation', label: 'Avvikelser över tid', description: 'Antal avvikelser och sena ändringar per månad', columns: PERIOD_COLS },
  { type: 'deviation_impact', category: 'deviation', label: 'Avvikelsernas påverkan', description: 'Marginalpåverkan och tidspåverkan av avvikelser', columns: ['had_deviations', 'project_count', 'avg_margin_pct', 'avg_hours', 'avg_revenue'] },

  // ── Forecasts ──
  { type: 'forecast_expected_time', category: 'forecast', label: 'Förväntad tid per projekttyp', description: 'Baslinjedata för att uppskatta tid baserat på projektegenskaper', columns: ['project_type', 'avg_products', 'avg_staff', 'avg_hours', 'std_dev_hours', 'p25_hours', 'p75_hours'] },
  { type: 'forecast_expected_margin', category: 'forecast', label: 'Förväntad marginal per produktmix', description: 'Historisk marginal per produktkategori-kombination', columns: COMBO_COLS },
  { type: 'forecast_risk_projects', category: 'forecast', label: 'Riskprojekt', description: 'Projekt med hög sannolikhet för låg marginal baserat på mönster', columns: [...PROJECT_COLS, 'risk_score', 'risk_factors'] },
  { type: 'forecast_inefficient_setups', category: 'forecast', label: 'Ineffektiva upplägg', description: 'Kombinationer av projekttyp/produkt/personalstyrka som historiskt gett dåliga resultat', columns: ['project_type', 'dominant_category', 'avg_staff_count', 'avg_margin_pct', 'avg_hours', 'project_count', 'inefficiency_score'] },
];

export const DATASET_CATEGORIES: { key: DatasetCategory; label: string }[] = [
  { key: 'project', label: 'Projektanalys' },
  { key: 'product', label: 'Produktanalys' },
  { key: 'combo', label: 'Kombinationer' },
  { key: 'staff', label: 'Personalanalys' },
  { key: 'time', label: 'Tidsanalys' },
  { key: 'economy', label: 'Ekonomisk analys' },
  { key: 'deviation', label: 'Avvikelser' },
  { key: 'forecast', label: 'Prognoser' },
];

// ─── Aggregation helpers ────────────────────────────────────────────────────

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  arr.forEach(item => {
    const key = keyFn(item);
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  });
  return map;
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function r(v: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

// ─── Dataset fetchers ───────────────────────────────────────────────────────

export async function fetchDataset(
  type: DatasetType,
  filter: DerivedFilter = {},
): Promise<{ meta: DatasetMeta; rows: Record<string, any>[] }> {
  const meta = DATASET_DEFINITIONS.find(d => d.type === type)!;

  // Shared data loaders (cached by react-query on the client, here we just fetch)
  const loadProjects = () => getDerivedProjects(filter);
  const loadProducts = () => getDerivedProducts(filter);
  const loadCombos = () => getDerivedProductCombinations();
  const loadStaff = () => getDerivedStaff(filter);
  const loadPeriods = () => getDerivedPeriods(filter);

  switch (type) {
    // ── PROJECT ──
    case 'project_most_profitable': {
      const data = await loadProjects();
      return { meta, rows: [...data].sort((a, b) => b.margin_pct - a.margin_pct).map(p => pickColumns(p, meta.columns)) };
    }
    case 'project_least_profitable': {
      const data = await loadProjects();
      return { meta, rows: [...data].sort((a, b) => a.margin_pct - b.margin_pct).map(p => pickColumns(p, meta.columns)) };
    }
    case 'project_highest_time': {
      const data = await loadProjects();
      return { meta, rows: [...data].sort((a, b) => b.total_hours - a.total_hours).map(p => pickColumns(p, meta.columns)) };
    }
    case 'project_lowest_margin': {
      const data = await loadProjects();
      return { meta, rows: [...data].filter(p => p.margin_pct < 10).sort((a, b) => a.margin_pct - b.margin_pct).map(p => pickColumns(p, meta.columns)) };
    }
    case 'project_late_closure': {
      const data = await loadProjects();
      return { meta, rows: [...data].filter(p => p.closure_delay_days != null).sort((a, b) => (b.closure_delay_days || 0) - (a.closure_delay_days || 0)).map(p => pickColumns(p, meta.columns)) };
    }
    case 'project_most_deviations': {
      const data = await loadProjects();
      return { meta, rows: data.filter(p => p.had_deviations || p.had_late_changes).sort((a, b) => {
        const sa = (a.had_deviations ? 1 : 0) + (a.had_late_changes ? 1 : 0);
        const sb = (b.had_deviations ? 1 : 0) + (b.had_late_changes ? 1 : 0);
        return sb - sa || a.margin_pct - b.margin_pct;
      }).map(p => pickColumns(p, meta.columns)) };
    }
    case 'project_by_customer': {
      const data = await loadProjects();
      const grouped = groupBy(data, p => `${p.client_name}|${p.customer_type || 'unknown'}`);
      const rows = Array.from(grouped.entries()).map(([key, projects]) => {
        const [client_name, customer_type] = key.split('|');
        return {
          client_name,
          customer_type,
          project_count: projects.length,
          total_revenue: r(projects.reduce((s, p) => s + p.revenue, 0)),
          total_cost: r(projects.reduce((s, p) => s + p.total_cost, 0)),
          avg_margin_pct: r(avg(projects.map(p => p.margin_pct))),
          total_hours: r(projects.reduce((s, p) => s + p.total_hours, 0)),
          avg_closure_delay: r(avg(projects.filter(p => p.closure_delay_days != null).map(p => p.closure_delay_days!))),
        };
      }).sort((a, b) => b.total_revenue - a.total_revenue);
      return { meta, rows };
    }
    case 'project_by_type': {
      const data = await loadProjects();
      const grouped = groupBy(data, p => p.project_type || 'unknown');
      const rows = Array.from(grouped.entries()).map(([project_type, projects]) => ({
        project_type,
        project_count: projects.length,
        total_revenue: r(projects.reduce((s, p) => s + p.revenue, 0)),
        total_cost: r(projects.reduce((s, p) => s + p.total_cost, 0)),
        avg_margin_pct: r(avg(projects.map(p => p.margin_pct))),
        total_hours: r(projects.reduce((s, p) => s + p.total_hours, 0)),
        avg_hours_per_project: r(avg(projects.map(p => p.total_hours))),
        deviation_rate: r((projects.filter(p => p.had_deviations).length / projects.length) * 100),
      })).sort((a, b) => b.project_count - a.project_count);
      return { meta, rows };
    }
    case 'project_margin_over_time': {
      const data = await loadPeriods();
      return { meta, rows: data };
    }

    // ── PRODUCT ──
    case 'product_profitability': {
      const data = await loadProducts();
      return { meta, rows: data };
    }
    case 'product_in_profitable': {
      const data = await loadProducts();
      return { meta, rows: [...data].sort((a, b) => b.in_profitable_projects - a.in_profitable_projects) };
    }
    case 'product_in_unprofitable': {
      const data = await loadProducts();
      return { meta, rows: [...data].filter(p => p.in_unprofitable_projects > 0).sort((a, b) => {
        const ra = a.in_unprofitable_projects / Math.max(1, a.project_count);
        const rb = b.in_unprofitable_projects / Math.max(1, b.project_count);
        return rb - ra;
      }) };
    }
    case 'product_high_time': {
      const data = await loadProducts();
      return { meta, rows: [...data].sort((a, b) => b.avg_project_hours - a.avg_project_hours) };
    }
    case 'product_causes_deviations': {
      const data = await loadProducts();
      return { meta, rows: data.filter(p => p.deviation_pct > 0).sort((a, b) => b.deviation_pct - a.deviation_pct) };
    }
    case 'product_high_frequency': {
      const data = await loadProducts();
      return { meta, rows: [...data].sort((a, b) => b.project_count - a.project_count) };
    }
    case 'product_low_margin': {
      const data = await loadProducts();
      return { meta, rows: [...data].sort((a, b) => a.avg_project_margin_pct - b.avg_project_margin_pct) };
    }
    case 'product_needs_price_increase': {
      const data = await loadProducts();
      const rows = data.map(p => {
        const freqScore = Math.min(p.project_count / 10, 1); // normalize freq 0-1
        const marginPenalty = Math.max(0, 1 - p.avg_project_margin_pct / 30); // lower margin = higher score
        const price_increase_score = r(freqScore * marginPenalty * 100);
        return { ...p, price_increase_score };
      }).filter(p => p.price_increase_score > 20).sort((a, b) => b.price_increase_score - a.price_increase_score);
      return { meta, rows };
    }

    // ── COMBINATIONS ──
    case 'combo_most_common': {
      const data = await loadCombos();
      return { meta, rows: [...data].sort((a, b) => b.co_occurrence_count - a.co_occurrence_count) };
    }
    case 'combo_high_time': {
      const data = await loadCombos();
      return { meta, rows: [...data].sort((a, b) => b.avg_hours - a.avg_hours) };
    }
    case 'combo_low_margin': {
      const data = await loadCombos();
      return { meta, rows: [...data].sort((a, b) => a.avg_margin_pct - b.avg_margin_pct) };
    }
    case 'combo_causes_problems': {
      // Use combos with low margin + high time as proxy for "problems"
      const data = await loadCombos();
      return { meta, rows: [...data].sort((a, b) => (a.avg_margin_pct - b.avg_margin_pct) || (b.avg_hours - a.avg_hours)) };
    }

    // ── STAFF ──
    case 'staff_hours': {
      const data = await loadStaff();
      return { meta, rows: data.map(s => { const { hours_by_project_type, staff_id, ...rest } = s; return rest; }) };
    }
    case 'staff_by_project_type': {
      const data = await loadStaff();
      const rows: Record<string, any>[] = [];
      data.forEach(s => {
        Object.entries(s.hours_by_project_type).forEach(([type, hours]) => {
          rows.push({ staff_name: s.staff_name, project_type: type, hours: r(hours as number), project_count: s.project_count });
        });
      });
      return { meta, rows: rows.sort((a, b) => b.hours - a.hours) };
    }
    case 'staff_workload_over_time': {
      const data = await loadPeriods();
      return { meta, rows: data };
    }
    case 'staff_efficiency': {
      const data = await loadStaff();
      const rows = data.map(s => ({
        staff_name: s.staff_name,
        total_hours: r(s.total_hours),
        total_project_revenue: r(s.avg_project_hours > 0 ? (s.total_hours / s.avg_project_hours) * s.avg_project_margin_pct : 0),
        revenue_per_hour: s.total_hours > 0 ? r(s.total_labor_cost / s.total_hours) : 0,
        avg_project_margin_pct: r(s.avg_project_margin_pct),
        project_count: s.project_count,
      })).sort((a, b) => b.avg_project_margin_pct - a.avg_project_margin_pct);
      return { meta, rows };
    }
    case 'staff_project_types': {
      const data = await loadStaff();
      const rows = data.map(s => {
        const entries = Object.entries(s.hours_by_project_type).sort(([, a], [, b]) => (b as number) - (a as number));
        return {
          staff_name: s.staff_name,
          project_types: entries.map(([t]) => t).join(', '),
          dominant_type: entries[0]?.[0] || '-',
          total_hours: r(s.total_hours),
          project_count: s.project_count,
        };
      });
      return { meta, rows };
    }

    // ── TIME ──
    case 'time_per_project': {
      const data = await loadProjects();
      return { meta, rows: [...data].sort((a, b) => b.total_hours - a.total_hours).map(p => pickColumns(p, meta.columns)) };
    }
    case 'time_over_time': {
      const data = await loadPeriods();
      return { meta, rows: data };
    }
    case 'time_vs_revenue': {
      const data = await loadProjects();
      return { meta, rows: [...data].filter(p => p.hours_per_revenue_sek != null).sort((a, b) => (b.hours_per_revenue_sek || 0) - (a.hours_per_revenue_sek || 0)).map(p => pickColumns(p, meta.columns)) };
    }
    case 'time_vs_margin': {
      const data = await loadProjects();
      return { meta, rows: [...data].sort((a, b) => a.margin_pct - b.margin_pct).map(p => pickColumns(p, meta.columns)) };
    }
    case 'time_avg_per_project': {
      const data = await loadProjects();
      const grouped = groupBy(data, p => p.project_type || 'unknown');
      const rows = Array.from(grouped.entries()).map(([project_type, projects]) => {
        const hours = projects.map(p => p.total_hours);
        return {
          project_type,
          project_count: projects.length,
          avg_hours: r(avg(hours)),
          median_hours: r(median(hours)),
          min_hours: r(Math.min(...hours)),
          max_hours: r(Math.max(...hours)),
          avg_staff_count: r(avg(projects.map(p => p.total_staff_count))),
        };
      }).sort((a, b) => b.avg_hours - a.avg_hours);
      return { meta, rows };
    }
    case 'time_by_project_type': {
      const data = await loadProjects();
      const grouped = groupBy(data, p => p.project_type || 'unknown');
      const rows = Array.from(grouped.entries()).map(([project_type, projects]) => ({
        project_type,
        project_count: projects.length,
        total_hours: r(projects.reduce((s, p) => s + p.total_hours, 0)),
        avg_hours: r(avg(projects.map(p => p.total_hours))),
        total_revenue: r(projects.reduce((s, p) => s + p.revenue, 0)),
        avg_margin_pct: r(avg(projects.map(p => p.margin_pct))),
      })).sort((a, b) => b.total_hours - a.total_hours);
      return { meta, rows };
    }

    // ── ECONOMY ──
    case 'economy_revenue_over_time':
    case 'economy_cost_over_time':
    case 'economy_margin_over_time':
    case 'economy_tb_over_time': {
      const data = await loadPeriods();
      return { meta, rows: data };
    }
    case 'economy_revenue_per_project': {
      const data = await loadProjects();
      return { meta, rows: [...data].sort((a, b) => b.revenue - a.revenue).map(p => pickColumns(p, meta.columns)) };
    }
    case 'economy_revenue_per_category': {
      const data = await loadProducts();
      const grouped = groupBy(data, p => p.category || 'Övrigt');
      const rows = Array.from(grouped.entries()).map(([category, products]) => ({
        category,
        product_count: products.length,
        total_quantity: products.reduce((s, p) => s + p.total_quantity, 0),
        total_revenue: r(products.reduce((s, p) => s + p.total_revenue, 0)),
        total_direct_cost: r(products.reduce((s, p) => s + p.total_direct_cost, 0)),
        avg_project_margin_pct: r(avg(products.map(p => p.avg_project_margin_pct))),
        project_count: products.reduce((s, p) => s + p.project_count, 0),
      })).sort((a, b) => b.total_revenue - a.total_revenue);
      return { meta, rows };
    }

    // ── DEVIATIONS ──
    case 'deviation_by_project': {
      const data = await loadProjects();
      return { meta, rows: data.filter(p => p.had_deviations).sort((a, b) => a.margin_pct - b.margin_pct).map(p => pickColumns(p, meta.columns)) };
    }
    case 'deviation_by_product': {
      const data = await loadProducts();
      return { meta, rows: data.filter(p => p.deviation_pct > 0).sort((a, b) => b.deviation_pct - a.deviation_pct) };
    }
    case 'deviation_over_time': {
      const data = await loadPeriods();
      return { meta, rows: data };
    }
    case 'deviation_impact': {
      const data = await loadProjects();
      const withDev = data.filter(p => p.had_deviations);
      const withoutDev = data.filter(p => !p.had_deviations);
      return { meta, rows: [
        { had_deviations: true, project_count: withDev.length, avg_margin_pct: r(avg(withDev.map(p => p.margin_pct))), avg_hours: r(avg(withDev.map(p => p.total_hours))), avg_revenue: r(avg(withDev.map(p => p.revenue))) },
        { had_deviations: false, project_count: withoutDev.length, avg_margin_pct: r(avg(withoutDev.map(p => p.margin_pct))), avg_hours: r(avg(withoutDev.map(p => p.total_hours))), avg_revenue: r(avg(withoutDev.map(p => p.revenue))) },
      ] };
    }

    // ── FORECASTS ──
    case 'forecast_expected_time': {
      const data = await loadProjects();
      const grouped = groupBy(data, p => p.project_type || 'unknown');
      const rows = Array.from(grouped.entries()).map(([project_type, projects]) => {
        const hours = projects.map(p => p.total_hours);
        return {
          project_type,
          avg_products: r(avg(projects.map(p => p.total_products))),
          avg_staff: r(avg(projects.map(p => p.total_staff_count))),
          avg_hours: r(avg(hours)),
          std_dev_hours: r(stdDev(hours)),
          p25_hours: r(percentile(hours, 25)),
          p75_hours: r(percentile(hours, 75)),
        };
      }).sort((a, b) => b.avg_hours - a.avg_hours);
      return { meta, rows };
    }
    case 'forecast_expected_margin': {
      const data = await loadCombos();
      return { meta, rows: data };
    }
    case 'forecast_risk_projects': {
      const data = await loadProjects();
      const avgMargin = avg(data.map(p => p.margin_pct));
      const rows = data.map(p => {
        const factors: string[] = [];
        if (p.margin_pct < 0) factors.push('negativ_marginal');
        if (p.had_deviations) factors.push('avvikelser');
        if (p.had_late_changes) factors.push('sena_ändringar');
        if ((p.closure_delay_days || 0) > 30) factors.push('sen_stängning');
        if ((p.hours_per_product || 0) > avg(data.filter(x => x.hours_per_product != null).map(x => x.hours_per_product!)) * 1.5) factors.push('hög_tidsåtgång');
        const risk_score = r(factors.length * 20 + Math.max(0, avgMargin - p.margin_pct));
        return { ...pickColumns(p, PROJECT_COLS), risk_score, risk_factors: factors.join(', ') };
      }).filter(p => (p.risk_score as number) > 20).sort((a, b) => (b.risk_score as number) - (a.risk_score as number));
      return { meta, rows };
    }
    case 'forecast_inefficient_setups': {
      const data = await loadProjects();
      const products = await loadProducts();
      const grouped = groupBy(data, p => p.project_type || 'unknown');
      const rows = Array.from(grouped.entries()).map(([project_type, projects]) => {
        const topCategory = products.sort((a, b) => b.project_count - a.project_count)[0]?.category || '-';
        const margins = projects.map(p => p.margin_pct);
        const hours = projects.map(p => p.total_hours);
        const inefficiency_score = r(Math.max(0, 50 - avg(margins)) + (avg(hours) > 20 ? 10 : 0));
        return {
          project_type,
          dominant_category: topCategory,
          avg_staff_count: r(avg(projects.map(p => p.total_staff_count))),
          avg_margin_pct: r(avg(margins)),
          avg_hours: r(avg(hours)),
          project_count: projects.length,
          inefficiency_score,
        };
      }).filter(row => row.inefficiency_score > 20).sort((a, b) => b.inefficiency_score - a.inefficiency_score);
      return { meta, rows };
    }

    default:
      return { meta: meta || { type, category: 'project', label: type, description: '', columns: [] }, rows: [] };
  }
}

function pickColumns(obj: Record<string, any>, cols: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  cols.forEach(c => { result[c] = obj[c] ?? null; });
  return result;
}

// ─── Export formatters ──────────────────────────────────────────────────────

export function toCSV(rows: Record<string, any>[], columns?: string[]): string {
  if (rows.length === 0) return '';
  const cols = columns || Object.keys(rows[0]);
  const header = cols.map(c => `"${c}"`).join(';');
  const lines = rows.map(r =>
    cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`;
      if (typeof v === 'boolean') return v ? 'Ja' : 'Nej';
      return String(v);
    }).join(';')
  );
  return [header, ...lines].join('\n');
}

export function toJSON(rows: Record<string, any>[], meta: DatasetMeta): string {
  return JSON.stringify({
    dataset: meta.type,
    category: meta.category,
    description: meta.description,
    generated_at: new Date().toISOString(),
    record_count: rows.length,
    columns: meta.columns,
    data: rows,
  }, null, 2);
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob(['\uFEFF' + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── AI-ready payload ───────────────────────────────────────────────────────

export interface AIDatasetPayload {
  dataset_type: DatasetType;
  dataset_category: DatasetCategory;
  dataset_label: string;
  description: string;
  filter_applied: DerivedFilter;
  generated_at: string;
  record_count: number;
  columns: string[];
  summary: Record<string, any>;
  data: Record<string, any>[];
}

export async function buildAIPayload(
  type: DatasetType,
  filter: DerivedFilter = {},
): Promise<AIDatasetPayload> {
  const { meta, rows } = await fetchDataset(type, filter);
  const summary = buildSummary(meta.category, rows);

  return {
    dataset_type: type,
    dataset_category: meta.category,
    dataset_label: meta.label,
    description: meta.description,
    filter_applied: filter,
    generated_at: new Date().toISOString(),
    record_count: rows.length,
    columns: meta.columns,
    summary,
    data: rows,
  };
}

function buildSummary(category: DatasetCategory, rows: Record<string, any>[]): Record<string, any> {
  const summary: Record<string, any> = { record_count: rows.length };
  if (rows.length === 0) return summary;

  const numField = (field: string) => rows.map(r => Number(r[field]) || 0);

  if (category === 'project' || category === 'time' || category === 'economy') {
    const revenues = numField('revenue').length > 0 ? numField('revenue') : numField('total_revenue');
    const margins = numField('margin_pct').length > 0 ? numField('margin_pct') : numField('avg_margin_pct');
    const hours = numField('total_hours');
    if (revenues.some(v => v > 0)) summary.total_revenue = r(revenues.reduce((s, v) => s + v, 0));
    if (margins.some(v => v !== 0)) {
      summary.avg_margin_pct = r(avg(margins));
      summary.min_margin_pct = r(Math.min(...margins));
      summary.max_margin_pct = r(Math.max(...margins));
    }
    if (hours.some(v => v > 0)) summary.total_hours = r(hours.reduce((s, v) => s + v, 0));
  }
  if (category === 'product') {
    summary.total_products = rows.length;
    summary.total_project_appearances = rows.reduce((s, r) => s + (r.project_count || 0), 0);
    summary.avg_margin = r(avg(numField('avg_project_margin_pct')));
  }
  if (category === 'staff') {
    summary.total_staff = rows.length;
    summary.total_hours = r(numField('total_hours').reduce((s, v) => s + v, 0));
  }
  if (category === 'deviation') {
    summary.projects_with_deviations = rows.filter(r => r.had_deviations).length;
    summary.projects_with_late_changes = rows.filter(r => r.had_late_changes).length;
  }
  if (category === 'forecast') {
    summary.analysis_type = 'predictive';
  }

  return summary;
}
