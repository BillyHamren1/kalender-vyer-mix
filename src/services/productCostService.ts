import { supabase } from '@/integrations/supabase/client';

export interface ProductCostData {
  id: string;
  name: string;
  quantity: number;
  laborCost: number;
  materialCost: number;
  setupHours: number;
  externalCost: number;
  costNotes: string | null;
  totalCost: number;
}

export interface ProductCostSummary {
  laborCostTotal: number;
  materialCostTotal: number;
  setupHoursTotal: number;
  externalCostTotal: number;
  totalProductCost: number;
  products: ProductCostData[];
}

/**
 * Fetch product costs for a booking
 */
export const fetchProductCosts = async (bookingId: string): Promise<ProductCostSummary> => {
  const { data, error } = await supabase
    .from('booking_products')
    .select('id, name, quantity, labor_cost, material_cost, setup_hours, external_cost, cost_notes')
    .eq('booking_id', bookingId);

  if (error) throw error;

  const products: ProductCostData[] = (data || []).map((p: any) => {
    const laborCost = Number(p.labor_cost) || 0;
    const materialCost = Number(p.material_cost) || 0;
    const setupHours = Number(p.setup_hours) || 0;
    const externalCost = Number(p.external_cost) || 0;
    const totalCost = laborCost + materialCost + externalCost;

    return {
      id: p.id,
      name: p.name,
      quantity: p.quantity || 1,
      laborCost,
      materialCost,
      setupHours,
      externalCost,
      costNotes: p.cost_notes || null,
      totalCost
    };
  });

  const laborCostTotal = products.reduce((sum, p) => sum + p.laborCost, 0);
  const materialCostTotal = products.reduce((sum, p) => sum + p.materialCost, 0);
  const setupHoursTotal = products.reduce((sum, p) => sum + p.setupHours, 0);
  const externalCostTotal = products.reduce((sum, p) => sum + p.externalCost, 0);
  const totalProductCost = laborCostTotal + materialCostTotal + externalCostTotal;

  return {
    laborCostTotal,
    materialCostTotal,
    setupHoursTotal,
    externalCostTotal,
    totalProductCost,
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
  // Supabase doesn't support batch updates directly, so we use Promise.all
  await Promise.all(
    updates.map(({ id, ...costs }) =>
      supabase.from('booking_products').update(costs).eq('id', id)
    )
  );
};
