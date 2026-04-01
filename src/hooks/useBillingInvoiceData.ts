import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectBilling } from './useProjectBilling';

export interface BillingTimeEntry {
  id: string;
  staff_name: string;
  work_date: string | null;
  hours: number;
  hourly_rate: number;
  description: string | null;
  total: number;
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
  timeEntries: BillingTimeEntry[];
  materials: BillingMaterialItem[];
  purchases: BillingPurchase[];
  totalHours: number;
  totalTimeCost: number;
  totalMaterialRevenue: number;
  totalMaterialDiscount: number;
  totalPurchases: number;
  isLoading: boolean;
}

// ── Table/FK mapping per project type ──
const LABOR_CONFIG: Record<string, { table: string; fkCol: string }> = {
  small:  { table: 'project_labor_costs', fkCol: 'project_id' },
  medium: { table: 'project_labor_costs', fkCol: 'project_id' },
  large:  { table: 'packing_labor_costs', fkCol: 'packing_id' },
};

const PURCHASE_CONFIG: Record<string, { table: string; fkCol: string }> = {
  small:  { table: 'project_purchases',        fkCol: 'project_id' },
  medium: { table: 'project_purchases',        fkCol: 'project_id' },
  large:  { table: 'large_project_purchases',  fkCol: 'large_project_id' },
};

export function useBillingInvoiceData(billing: ProjectBilling | null): BillingInvoiceData {
  const bookingId = billing?.booking_id;
  const projectId = billing?.project_id;
  const projectType = billing?.project_type ?? 'small';

  // ── Materials (from booking_products) ──
  const { data: materials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ['billing-materials', bookingId],
    queryFn: async () => {
      if (!bookingId) {
        console.warn('[BillingData] No booking_id — cannot fetch materials');
        return [];
      }
      const { data, error } = await supabase
        .from('booking_products')
        .select('id, name, quantity, unit_price, total_price, discount, vat_rate, is_package_component, parent_product_id')
        .eq('booking_id', bookingId)
        .order('sort_index', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        console.warn(`[BillingData] No materials found for booking ${bookingId}`);
      }
      return (data ?? []).map(p => ({
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

  // ── Labor costs ──
  const laborCfg = LABOR_CONFIG[projectType] ?? LABOR_CONFIG.small;

  const { data: timeEntries = [], isLoading: loadingTime } = useQuery({
    queryKey: ['billing-time', projectId, projectType],
    queryFn: async () => {
      if (!projectId) {
        console.warn('[BillingData] No project_id — cannot fetch labor costs');
        return [];
      }
      const { data, error } = await supabase
        .from(laborCfg.table as any)
        .select('id, staff_name, work_date, hours, hourly_rate, description')
        .eq(laborCfg.fkCol, projectId);
      if (error) {
        console.error(`[BillingData] Labor query failed (${laborCfg.table}):`, error.message);
        throw error;
      }
      if (!data || data.length === 0) {
        console.warn(`[BillingData] No labor costs found in ${laborCfg.table} for ${laborCfg.fkCol}=${projectId}`);
      }
      return (data ?? []).map((t: any) => ({
        id: t.id,
        staff_name: t.staff_name,
        work_date: t.work_date,
        hours: Number(t.hours ?? 0),
        hourly_rate: Number(t.hourly_rate ?? 0),
        description: t.description,
        total: Number(t.hours ?? 0) * Number(t.hourly_rate ?? 0),
      })) as BillingTimeEntry[];
    },
    enabled: !!projectId,
  });

  // ── Purchases ──
  const purchaseCfg = PURCHASE_CONFIG[projectType] ?? PURCHASE_CONFIG.small;

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['billing-purchases', projectId, projectType],
    queryFn: async () => {
      if (!projectId) {
        console.warn('[BillingData] No project_id — cannot fetch purchases');
        return [];
      }
      const { data, error } = await supabase
        .from(purchaseCfg.table as any)
        .select('id, description, amount, supplier, category, purchase_date')
        .eq(purchaseCfg.fkCol, projectId);
      if (error) {
        console.error(`[BillingData] Purchase query failed (${purchaseCfg.table}):`, error.message);
        throw error;
      }
      if (!data || data.length === 0) {
        console.warn(`[BillingData] No purchases found in ${purchaseCfg.table} for ${purchaseCfg.fkCol}=${projectId}`);
      }
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

  const totalHours = timeEntries.reduce((s, t) => s + t.hours, 0);
  const totalTimeCost = timeEntries.reduce((s, t) => s + t.total, 0);
  const topLevelMaterials = materials.filter(m => !m.is_package_component);
  const totalMaterialRevenue = topLevelMaterials.reduce((s, m) => s + m.total_price, 0);
  const totalMaterialDiscount = topLevelMaterials.reduce((s, m) => s + m.discount * m.quantity, 0);
  const totalPurchases = purchases.reduce((s, p) => s + p.amount, 0);

  return {
    timeEntries,
    materials,
    purchases,
    totalHours,
    totalTimeCost,
    totalMaterialRevenue,
    totalMaterialDiscount,
    totalPurchases,
    isLoading: loadingMaterials || loadingTime || loadingPurchases,
  };
}
