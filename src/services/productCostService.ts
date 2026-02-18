import { supabase } from '@/integrations/supabase/client';

export interface ProductCostData {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalRevenue: number;
  assemblyCost: number;
  handlingCost: number;
  purchaseCost: number;
  totalCost: number;
  parentProductId: string | null;
  // Legacy editable fields (kept for backward compat)
  laborCost: number;
  materialCost: number;
  setupHours: number;
  externalCost: number;
  costNotes: string | null;
}

export interface ProductCostSummary {
  totalRevenue: number;
  assemblyCostTotal: number;
  handlingCostTotal: number;
  purchaseCostTotal: number;
  totalProductCost: number;
  grossMargin: number;
  marginPct: number;
  // Legacy
  laborCostTotal: number;
  materialCostTotal: number;
  setupHoursTotal: number;
  externalCostTotal: number;
  products: ProductCostData[];
}

/**
 * Fetch product costs for a booking
 */
export const fetchProductCosts = async (bookingId: string): Promise<ProductCostSummary> => {
  const { data, error } = await supabase
    .from('booking_products')
    .select('id, name, quantity, unit_price, total_price, assembly_cost, handling_cost, purchase_cost, labor_cost, material_cost, setup_hours, external_cost, cost_notes, parent_product_id')
    .eq('booking_id', bookingId);

  if (error) throw error;

  const products: ProductCostData[] = (data || []).map((p: any) => {
    const unitPrice = Number(p.unit_price) || 0;
    const totalRevenue = Number(p.total_price) || 0;
    const quantity = p.quantity || 1;
    const assemblyCost = (Number(p.assembly_cost) || 0) * quantity;
    const handlingCost = (Number(p.handling_cost) || 0) * quantity;
    const purchaseCost = (Number(p.purchase_cost) || 0) * quantity;
    const totalCost = assemblyCost + handlingCost + purchaseCost;

    return {
      id: p.id,
      name: p.name,
      quantity: p.quantity || 1,
      unitPrice,
      totalRevenue,
      assemblyCost,
      handlingCost,
      purchaseCost,
      totalCost,
      parentProductId: p.parent_product_id || null,
      // Legacy fields
      laborCost: Number(p.labor_cost) || 0,
      materialCost: Number(p.material_cost) || 0,
      setupHours: Number(p.setup_hours) || 0,
      externalCost: Number(p.external_cost) || 0,
      costNotes: p.cost_notes || null,
    };
  });

  const totalRevenue = products.reduce((sum, p) => sum + p.totalRevenue, 0);
  const assemblyCostTotal = products.reduce((sum, p) => sum + p.assemblyCost, 0);
  const handlingCostTotal = products.reduce((sum, p) => sum + p.handlingCost, 0);
  const purchaseCostTotal = products.reduce((sum, p) => sum + p.purchaseCost, 0);
  const totalProductCost = assemblyCostTotal + handlingCostTotal + purchaseCostTotal;
  const grossMargin = totalRevenue - totalProductCost;
  const marginPct = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 100) : 0;

  return {
    totalRevenue,
    assemblyCostTotal,
    handlingCostTotal,
    purchaseCostTotal,
    totalProductCost,
    grossMargin,
    marginPct,
    // Legacy
    laborCostTotal: products.reduce((sum, p) => sum + p.laborCost, 0),
    materialCostTotal: products.reduce((sum, p) => sum + p.materialCost, 0),
    setupHoursTotal: products.reduce((sum, p) => sum + p.setupHours, 0),
    externalCostTotal: products.reduce((sum, p) => sum + p.externalCost, 0),
    products
  };
};

/**
 * Update costs for a single product
 */
export const updateProductCost = async (
  productId: string,
  costs: {
    labor_cost?: number;
    material_cost?: number;
    setup_hours?: number;
    external_cost?: number;
    cost_notes?: string | null;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('booking_products')
    .update(costs)
    .eq('id', productId);

  if (error) throw error;
};

/**
 * Batch update costs for multiple products
 */
export const batchUpdateProductCosts = async (
  updates: Array<{
    id: string;
    labor_cost?: number;
    material_cost?: number;
    setup_hours?: number;
    external_cost?: number;
    cost_notes?: string | null;
  }>
): Promise<void> => {
  await Promise.all(
    updates.map(({ id, ...costs }) =>
      supabase.from('booking_products').update(costs).eq('id', id)
    )
  );
};
