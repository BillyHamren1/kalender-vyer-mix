/**
 * Analytics Export Service
 * 
 * Provides structured dataset generation and CSV/JSON export
 * for all analytics dimensions. Same definitions used for UI, export, and AI.
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
  | 'product_profitability'
  | 'project_margin'
  | 'time_data'
  | 'product_combinations'
  | 'staff_workload'
  | 'deviations'
  | 'period_summary';

export interface DatasetMeta {
  type: DatasetType;
  label: string;
  description: string;
  columns: string[];
}

export const DATASET_DEFINITIONS: DatasetMeta[] = [
  {
    type: 'product_profitability',
    label: 'Produktlönsamhet',
    description: 'Produkter med intäkter, kostnader och marginalkoppling per projekt',
    columns: ['product_name', 'category', 'sku', 'project_count', 'total_quantity', 'total_revenue', 'total_direct_cost', 'avg_project_margin_pct', 'avg_project_hours', 'in_profitable_projects', 'in_unprofitable_projects', 'late_addition_pct', 'deviation_pct'],
  },
  {
    type: 'project_margin',
    label: 'Projektmarginal',
    description: 'Alla projekt med TB, marginal, timmar och nyckeltal',
    columns: ['booking_number', 'client_name', 'project_type', 'event_date', 'revenue', 'total_cost', 'tb', 'margin_pct', 'total_hours', 'total_products', 'total_staff_count', 'closure_delay_days', 'had_deviations', 'had_late_changes'],
  },
  {
    type: 'time_data',
    label: 'Tidsdata',
    description: 'Timmar per projekt med koppling till intäkt och personal',
    columns: ['booking_number', 'client_name', 'event_date', 'total_hours', 'approved_hours', 'overtime_hours', 'hours_per_revenue_sek', 'hours_per_product', 'total_staff_count', 'revenue', 'margin_pct'],
  },
  {
    type: 'product_combinations',
    label: 'Produktkombinationer',
    description: 'Vilka produktkategorier som förekommer tillsammans och deras marginal/tid',
    columns: ['category_a', 'category_b', 'co_occurrence_count', 'avg_hours', 'avg_margin_pct', 'avg_revenue', 'avg_hours_per_product'],
  },
  {
    type: 'staff_workload',
    label: 'Personalbelastning',
    description: 'Timmar, projekt och marginal per anställd',
    columns: ['staff_name', 'project_count', 'total_hours', 'total_overtime', 'total_labor_cost', 'avg_project_margin_pct', 'avg_project_hours'],
  },
  {
    type: 'deviations',
    label: 'Avvikelser',
    description: 'Projekt och produkter med avvikelser och sena ändringar',
    columns: ['booking_number', 'client_name', 'event_date', 'had_deviations', 'had_late_changes', 'margin_pct', 'total_hours', 'total_products'],
  },
  {
    type: 'period_summary',
    label: 'Periodsammanfattning',
    description: 'Månatlig sammanställning av omsättning, marginal och projekt',
    columns: ['month', 'project_count', 'total_revenue', 'total_cost', 'total_margin', 'margin_pct', 'total_hours', 'avg_project_revenue', 'avg_project_hours', 'projects_with_deviations'],
  },
];

// ─── Dataset fetchers ───────────────────────────────────────────────────────

export async function fetchDataset(
  type: DatasetType,
  filter: DerivedFilter = {},
): Promise<{ meta: DatasetMeta; rows: Record<string, any>[] }> {
  const meta = DATASET_DEFINITIONS.find(d => d.type === type)!;

  switch (type) {
    case 'product_profitability': {
      const data = await getDerivedProducts(filter);
      return { meta, rows: data };
    }
    case 'project_margin': {
      const data = await getDerivedProjects(filter);
      return { meta, rows: data.map(p => pickColumns(p, meta.columns)) };
    }
    case 'time_data': {
      const data = await getDerivedProjects(filter);
      return { meta, rows: data.map(p => pickColumns(p, meta.columns)) };
    }
    case 'product_combinations': {
      const data = await getDerivedProductCombinations();
      return { meta, rows: data };
    }
    case 'staff_workload': {
      const data = await getDerivedStaff(filter);
      return { meta, rows: data.map(s => {
        const { hours_by_project_type, staff_id, ...rest } = s;
        return rest;
      }) };
    }
    case 'deviations': {
      const data = await getDerivedProjects(filter);
      return {
        meta,
        rows: data
          .filter(p => p.had_deviations || p.had_late_changes)
          .map(p => pickColumns(p, meta.columns)),
      };
    }
    case 'period_summary': {
      const data = await getDerivedPeriods(filter);
      return { meta, rows: data };
    }
    default:
      return { meta, rows: [] };
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

  // Build summary stats
  const summary: Record<string, any> = { record_count: rows.length };

  if (type === 'project_margin' || type === 'time_data') {
    const revenues = rows.map(r => r.revenue || 0);
    const margins = rows.map(r => r.margin_pct || 0);
    summary.total_revenue = revenues.reduce((s, v) => s + v, 0);
    summary.avg_margin_pct = margins.length > 0 ? margins.reduce((s, v) => s + v, 0) / margins.length : 0;
    summary.min_margin_pct = Math.min(...margins);
    summary.max_margin_pct = Math.max(...margins);
  }
  if (type === 'staff_workload') {
    const hours = rows.map(r => r.total_hours || 0);
    summary.total_hours = hours.reduce((s, v) => s + v, 0);
    summary.avg_hours_per_staff = hours.length > 0 ? summary.total_hours / hours.length : 0;
  }
  if (type === 'deviations') {
    summary.deviation_count = rows.filter(r => r.had_deviations).length;
    summary.late_change_count = rows.filter(r => r.had_late_changes).length;
  }

  return {
    dataset_type: type,
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
