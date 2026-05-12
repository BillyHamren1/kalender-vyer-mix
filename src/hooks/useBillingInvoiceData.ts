/**
 * useBillingInvoiceData
 * =====================
 *
 * Fakturaunderlag — personaltimmar.
 *
 * Fakturaunderlaget använder samma Time Engine-cache (`staff_day_report_cache`)
 * som tidrapportsidan (`/staff-management/time-reports`) och projektvyn.
 * Det finns ingen separat `time_reports`-källa i detta flöde.
 *
 * Läs-ordning:
 *   1. `staff_day_report_cache` via `projectHoursService.fetchProjectHoursSummary`
 *      respektive `fetchLargeProjectHoursSummary`. Varje rad bär
 *      `source: 'time_engine_cache'` och kan visa staff_name, datum,
 *      projekt/booking-label, start/end, hours, source block id och
 *      ev. `warning_reasons` om dagen är osäker.
 *   2. `project_labor_costs` (small/medium) respektive `packing_labor_costs`
 *      (large) — exponeras ENDAST som `manual_extra_labor_cost`-rader,
 *      separat från Time Engine-summan. Dessa speglar manuella extra
 *      kostnader och får ALDRIG blandas in i `timeEngineStaffHours`.
 *
 * Inget attestflöde byggs här. Inget skrivs till `time_reports`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectBilling } from './useProjectBilling';
import {
  fetchProjectHoursSummary,
  fetchLargeProjectHoursSummary,
} from '@/services/projectHoursService';
import type {
  ProjectHoursSummary,
  ProjectTimeEngineBlock,
} from '@/lib/projects/projectHoursFromTimeEngine';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type BillingTimeSource = 'time_engine_cache' | 'manual_extra_labor_cost';

export interface BillingTimeEntry {
  id: string;
  staff_name: string;
  work_date: string | null;
  hours: number;
  hourly_rate: number;
  description: string | null;
  total: number;
  /** Källa per rad — fakturaunderlag separerar Time Engine-tid från manuella extra. */
  source: BillingTimeSource;
  /** Projekt/booking-etikett (för läsbarhet i fakturaunderlaget). */
  project_label?: string | null;
  /** Block-tider om relevant (Time Engine-rader). */
  start_time?: string | null;
  end_time?: string | null;
  /** Källblock-id i `staff_day_report_cache` (Time Engine-rader). */
  source_block_id?: string | null;
  /** Varningar om dagen är osäker (signalglapp, låg confidence m.m.). */
  warning_reasons?: string[];
}

export interface BillingMaterialItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  discount: number;
  vat_rate: number;
  is_package_component: boolean;
  parent_product_id: string | null;
}

export interface BillingPurchase {
  id: string;
  description: string;
  amount: number;
  supplier: string | null;
  category: string | null;
  purchase_date: string | null;
}

export interface BillingInvoiceData {
  /**
   * Rapporterade personaltimmar från Time Engine-cachen
   * (`source: 'time_engine_cache'`). Detta är fakturaunderlagets primära
   * timrader och summeras i `totalHours`/`totalTimeCost`/`timeEngineStaffHours`.
   */
  timeEntries: BillingTimeEntry[];
  /**
   * Manuella extra labor-rader (`source: 'manual_extra_labor_cost'`) från
   * `project_labor_costs` (small/medium) eller `packing_labor_costs` (large).
   * Visas separat och summeras i `manualExtraLaborHours` — räknas EJ in i
   * `totalHours` eller `totalTimeCost`.
   */
  manualExtraLabor: BillingTimeEntry[];
  materials: BillingMaterialItem[];
  purchases: BillingPurchase[];
  /** Time Engine-timmar (samma som tidrapportsidan). */
  totalHours: number;
  /** Time Engine-kostnad. */
  totalTimeCost: number;
  totalMaterialRevenue: number;
  totalMaterialDiscount: number;
  totalPurchases: number;

  // ── Tydlig labor-summary ──
  timeEngineStaffHours: number;
  manualExtraLaborHours: number;
  totalLaborHours: number;
  hoursSource: 'staff_day_report_cache';

  isLoading: boolean;
}

const TAG = '[BillingData]';

// ────────────────────────────────────────────────────────────────────────────
// Manual extra labor (project_labor_costs / packing_labor_costs)
// ────────────────────────────────────────────────────────────────────────────

interface ManualLaborRow {
  id: string;
  staff_name: string | null;
  work_date: string | null;
  hours: number | null;
  hourly_rate: number | null;
  description: string | null;
}

async function fetchLargeProjectManualLaborCosts(
  largeProjectId: string,
): Promise<ManualLaborRow[]> {
  // large_project_id → booking_ids → packing_ids → packing_labor_costs
  const { data: lpBookings, error: lpbErr } = await supabase
    .from('large_project_bookings')
    .select('booking_id')
    .eq('large_project_id', largeProjectId);
  if (lpbErr) {
    console.error(`${TAG} Failed to fetch large_project_bookings:`, lpbErr.message);
    return [];
  }
  const bookingIds = (lpBookings ?? []).map((b: any) => b.booking_id);
  if (bookingIds.length === 0) return [];

  const { data: packingProjects, error: ppErr } = await supabase
    .from('packing_projects' as any)
    .select('id, booking_id')
    .in('booking_id', bookingIds);
  if (ppErr) {
    console.error(`${TAG} Failed to fetch packing_projects:`, ppErr.message);
    return [];
  }
  const packingIds = (packingProjects ?? []).map((p: any) => p.id);
  if (packingIds.length === 0) return [];

  const { data, error } = await supabase
    .from('packing_labor_costs')
    .select('id, staff_name, work_date, hours, hourly_rate, description')
    .in('packing_id', packingIds);
  if (error) {
    console.error(`${TAG} Failed to fetch packing_labor_costs:`, error.message);
    return [];
  }
  return (data ?? []) as ManualLaborRow[];
}

async function fetchSmallProjectManualLaborCosts(
  projectId: string,
): Promise<ManualLaborRow[]> {
  const { data, error } = await supabase
    .from('project_labor_costs')
    .select('id, staff_name, work_date, hours, hourly_rate, description')
    .eq('project_id', projectId);
  if (error) {
    console.error(`${TAG} Failed to fetch project_labor_costs:`, error.message);
    return [];
  }
  return (data ?? []) as ManualLaborRow[];
}

function manualRowsToEntries(
  rows: ManualLaborRow[],
  projectLabel: string | null,
): BillingTimeEntry[] {
  return rows.map((r) => {
    const hours = Number(r.hours ?? 0);
    const rate = Number(r.hourly_rate ?? 0);
    return {
      id: r.id,
      staff_name: r.staff_name ?? 'Okänd',
      work_date: r.work_date,
      hours,
      hourly_rate: rate,
      description: r.description ?? null,
      total: hours * rate,
      source: 'manual_extra_labor_cost',
      project_label: projectLabel,
      start_time: null,
      end_time: null,
      source_block_id: null,
      warning_reasons: [],
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Time Engine → BillingTimeEntry rows
// ────────────────────────────────────────────────────────────────────────────

interface RateInfo {
  hourly_rate: number;
  staff_name: string;
}

async function resolveStaffRates(
  staffIds: string[],
  bookingId: string | null,
): Promise<Map<string, RateInfo>> {
  const out = new Map<string, RateInfo>();
  if (staffIds.length === 0) return out;

  const memberQ = supabase
    .from('staff_members')
    .select('id, name, hourly_rate')
    .in('id', staffIds);
  const snapshotQ = bookingId
    ? supabase
        .from('completion_staff')
        .select('staff_id, hourly_rate, work_date')
        .eq('completion_id', bookingId)
        .in('staff_id', staffIds)
    : Promise.resolve({ data: null, error: null } as const);

  const [{ data: members }, { data: snapshots }] = await Promise.all([memberQ, snapshotQ]);

  const snapshotRate = new Map<string, number>();
  if (snapshots && snapshots.length > 0) {
    const sorted = [...snapshots].sort((a: any, b: any) =>
      (b.work_date || '').localeCompare(a.work_date || ''),
    );
    for (const s of sorted as any[]) {
      if (s.hourly_rate != null && !snapshotRate.has(s.staff_id)) {
        snapshotRate.set(s.staff_id, Number(s.hourly_rate));
      }
    }
  }

  for (const m of (members ?? []) as any[]) {
    const current = Number(m.hourly_rate) || 0;
    const snap = snapshotRate.get(m.id);
    out.set(m.id, {
      hourly_rate: snap ?? current,
      staff_name: m.name || 'Okänd',
    });
  }
  return out;
}

function blockStart(b: ProjectTimeEngineBlock): string | null {
  return (b.startAt as string | null) ?? (b.start_at as string | null) ?? null;
}
function blockEnd(b: ProjectTimeEngineBlock): string | null {
  return (b.endAt as string | null) ?? (b.end_at as string | null) ?? null;
}
function blockMinutes(b: ProjectTimeEngineBlock): number {
  if (typeof b.durationMinutes === 'number' && b.durationMinutes > 0) return b.durationMinutes;
  if (typeof b.minutes === 'number' && b.minutes > 0) return b.minutes;
  const s = blockStart(b);
  const e = blockEnd(b);
  if (s && e) {
    const ms = Date.parse(e) - Date.parse(s);
    return ms > 0 ? Math.round(ms / 60_000) : 0;
  }
  return 0;
}
function blockLabel(b: ProjectTimeEngineBlock, fallback: string | null): string | null {
  return (
    (b.label as string | null | undefined) ??
    (b.targetLabel as string | null | undefined) ??
    (b.target_label as string | null | undefined) ??
    fallback
  );
}
function blockWarnings(b: ProjectTimeEngineBlock): string[] {
  const raw = (b as any).warningReasons ?? (b as any).warning_reasons ?? [];
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

async function summaryToTimeEntries(
  summary: ProjectHoursSummary,
  bookingId: string | null,
  projectLabel: string | null,
): Promise<BillingTimeEntry[]> {
  if (summary.staffSummaries.length === 0) return [];
  const staffIds = summary.staffSummaries.map((s) => s.staff_id);
  const rates = await resolveStaffRates(staffIds, bookingId);

  const entries: BillingTimeEntry[] = [];
  for (const s of summary.staffSummaries) {
    const rate = rates.get(s.staff_id);
    const staffName = rate?.staff_name ?? s.staff_name ?? 'Okänd';
    const hourly = rate?.hourly_rate ?? 0;
    if (hourly === 0) {
      console.warn(
        `${TAG} Ingen timlön för staff ${s.staff_id} — fakturaunderlagets timkostnad blir 0`,
      );
    }
    s.blocks.forEach((b, idx) => {
      const minutes = blockMinutes(b);
      const hours = minutes / 60;
      const startIso = blockStart(b);
      const endIso = blockEnd(b);
      const date = startIso?.slice(0, 10) ?? s.days[0] ?? null;
      const blockId =
        (b.id as string | undefined) ??
        (b.block_id as string | undefined) ??
        `te:${s.staff_id}:${date ?? 'na'}:${idx}`;
      entries.push({
        id: `te:${blockId}`,
        staff_name: staffName,
        work_date: date,
        hours,
        hourly_rate: hourly,
        description: blockLabel(b, projectLabel),
        total: hours * hourly,
        source: 'time_engine_cache',
        project_label: blockLabel(b, projectLabel),
        start_time: startIso,
        end_time: endIso,
        source_block_id: blockId,
        warning_reasons: blockWarnings(b),
      });
    });
  }
  return entries;
}

// ────────────────────────────────────────────────────────────────────────────
// Materials / purchases
// ────────────────────────────────────────────────────────────────────────────

const PURCHASE_CONFIG: Record<string, { table: string; fkCol: string }> = {
  small: { table: 'project_purchases', fkCol: 'project_id' },
  medium: { table: 'project_purchases', fkCol: 'project_id' },
  large: { table: 'large_project_purchases', fkCol: 'large_project_id' },
};

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function useBillingInvoiceData(billing: ProjectBilling | null): BillingInvoiceData {
  const bookingId = billing?.booking_id ?? null;
  const projectId = billing?.project_id ?? null;
  const projectType = billing?.project_type ?? 'small';
  const projectLabel = billing?.project_name ?? null;
  const isLarge = projectType === 'large';

  // ── Materials ──
  const { data: materials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ['billing-materials', bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from('booking_products')
        .select(
          'id, name, quantity, unit_price, total_price, discount, vat_rate, is_package_component, parent_product_id',
        )
        .eq('booking_id', bookingId)
        .order('sort_index', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        unit_price: Number(p.unit_price ?? 0),
        total_price: Number(p.total_price ?? p.quantity * Number(p.unit_price ?? 0)),
        discount: Number(p.discount ?? 0),
        vat_rate: Number(p.vat_rate ?? 25),
        is_package_component: p.is_package_component ?? false,
        parent_product_id: p.parent_product_id,
      })) as BillingMaterialItem[];
    },
    enabled: !!bookingId,
  });

  // ── Time Engine staff hours (PRIMARY labor source) ──
  const { data: timeEntries = [], isLoading: loadingTime } = useQuery({
    queryKey: ['billing-time-engine', projectType, projectId, bookingId],
    queryFn: async (): Promise<BillingTimeEntry[]> => {
      if (isLarge) {
        if (!projectId) return [];
        // Resolve linked bookings for the large project
        const { data: lpBookings } = await supabase
          .from('large_project_bookings')
          .select('booking_id')
          .eq('large_project_id', projectId);
        const bookingIds = (lpBookings ?? []).map((b: any) => b.booking_id);
        const result = await fetchLargeProjectHoursSummary(projectId, bookingIds);
        return summaryToTimeEntries(result.summary, null, projectLabel);
      }
      if (!bookingId) return [];
      const summary = await fetchProjectHoursSummary(bookingId);
      return summaryToTimeEntries(summary, bookingId, projectLabel);
    },
    enabled: isLarge ? !!projectId : !!bookingId,
  });

  // ── Manual extra labor (separate, never folded into Time Engine totals) ──
  const { data: manualExtraLabor = [], isLoading: loadingManual } = useQuery({
    queryKey: ['billing-manual-labor', projectType, projectId],
    queryFn: async (): Promise<BillingTimeEntry[]> => {
      if (!projectId) return [];
      const rows = isLarge
        ? await fetchLargeProjectManualLaborCosts(projectId)
        : await fetchSmallProjectManualLaborCosts(projectId);
      return manualRowsToEntries(rows, projectLabel);
    },
    enabled: !!projectId,
  });

  // ── Purchases ──
  const purchaseCfg = PURCHASE_CONFIG[projectType] ?? PURCHASE_CONFIG.small;
  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['billing-purchases', projectId, projectType],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from(purchaseCfg.table as any)
        .select('id, description, amount, supplier, category, purchase_date')
        .eq(purchaseCfg.fkCol, projectId);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        description: p.description,
        amount: Number(p.amount ?? 0),
        supplier: p.supplier,
        category: p.category,
        purchase_date: p.purchase_date,
      })) as BillingPurchase[];
    },
    enabled: !!projectId,
  });

  // ── Aggregates ──
  const timeEngineStaffHours = timeEntries.reduce((s, t) => s + t.hours, 0);
  const totalTimeCost = timeEntries.reduce((s, t) => s + t.total, 0);
  const manualExtraLaborHours = manualExtraLabor.reduce((s, t) => s + t.hours, 0);
  const totalLaborHours = timeEngineStaffHours + manualExtraLaborHours;

  const topLevelMaterials = materials.filter((m) => !m.is_package_component);
  const totalMaterialRevenue = topLevelMaterials.reduce((s, m) => s + m.total_price, 0);
  const totalMaterialDiscount = topLevelMaterials.reduce(
    (s, m) => s + m.discount * m.quantity,
    0,
  );
  const totalPurchases = purchases.reduce((s, p) => s + p.amount, 0);

  return {
    timeEntries,
    manualExtraLabor,
    materials,
    purchases,
    totalHours: timeEngineStaffHours,
    totalTimeCost,
    totalMaterialRevenue,
    totalMaterialDiscount,
    totalPurchases,
    timeEngineStaffHours,
    manualExtraLaborHours,
    totalLaborHours,
    hoursSource: 'staff_day_report_cache',
    isLoading: loadingMaterials || loadingTime || loadingManual || loadingPurchases,
  };
}
