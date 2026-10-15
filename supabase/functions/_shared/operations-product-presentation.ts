import type { BookingProduct } from '../../../src/types/booking.ts';
export interface ProductGroup {
  parent: BookingProduct;
  accessories: BookingProduct[];
}

/**
 * Clean product names by removing prefix characters used for hierarchy indication
 */
export const cleanProductName = (name: string): string => {
  return name
    .trimStart()
    .replace(/^[└↳]\s*,?\s*/, '')
    .replace(/^L,\s*/, '')
    .replace(/^⦿\s*/, '')
    .replace(/^--\s*/, '')
    .trim();
};

/**
 * Check if a product is a child (accessory or package component) based on DB fields or name prefix
 * This handles both new imports (with parent_product_id/parent_package_id/is_package_component)
 * and legacy data (with name prefixes)
 */
export const isChildProduct = (product: BookingProduct): boolean => {
  if (product.parentProductId) return true;
  if (product.parentPackageId) return true;
  if (product.isPackageComponent) return true;
  // Fallback to name-based detection for legacy data
  const name = product.name || '';
  return name.startsWith('└') || 
         name.startsWith('↳') || 
         name.startsWith('L,') || 
         name.startsWith('└,') ||
         name.startsWith('  ↳') ||
         name.startsWith('  └') ||
         name.startsWith('⦿');
};

/**
 * Group products by parent-child relationship
 * Uses parent_product_id and parent_package_id when available,
 * falls back to sequential name-based grouping for legacy data
 */
export const groupProducts = (products: BookingProduct[]): ProductGroup[] => {
  const groups: ProductGroup[] = [];
  const childProducts = products.filter(p => isChildProduct(p));
  
  // Build child maps by both parent_product_id AND parent_package_id
  const childrenByParentId = new Map<string, BookingProduct[]>();
  
  for (const child of childProducts) {
    const parentId = child.parentProductId || child.parentPackageId;
    if (parentId) {
      const existing = childrenByParentId.get(parentId) || [];
      existing.push(child);
      childrenByParentId.set(parentId, existing);
    }
  }
  
  // Iterate sequentially to group products
  let currentParent: BookingProduct | null = null;
  let currentSequentialChildren: BookingProduct[] = [];
  
  for (const product of products) {
    if (!isChildProduct(product)) {
      // Save previous group
      if (currentParent) {
        const idChildren = childrenByParentId.get(currentParent.id) || [];
        const merged = [...new Map([...idChildren, ...currentSequentialChildren].map(a => [a.id, a])).values()];
        groups.push({ parent: currentParent, accessories: merged });
      }
      currentParent = product;
      currentSequentialChildren = [];
    } else {
      // Only add to sequential group if it doesn't have an ID-based parent link
      if (!product.parentProductId && !product.parentPackageId) {
        currentSequentialChildren.push(product);
      }
    }
  }
  
  // Don't forget the last group
  if (currentParent) {
    const idChildren = childrenByParentId.get(currentParent.id) || [];
    const merged = [...new Map([...idChildren, ...currentSequentialChildren].map(a => [a.id, a])).values()];
    groups.push({ parent: currentParent, accessories: merged });
  }
  
  return groups;
};


import type { ProductCostData, ProductCostSummary } from '../../../src/services/productCostService.ts';
export const cleanCostName = (name: string): string => (name ?? '').replace(/^[\s↳└⦿L,\-–]+/, '').trim();
export function productCostDisplay(p: ProductCostData) {
 const totalCost = (p.assembly_cost + p.handling_cost + p.purchase_cost) * p.quantity;
 return {totalCost,displayUnitPrice:p.quantity > 0 ? p.total/p.quantity : p.unit_price,marginPercent:p.total > 0 ? Math.round(((p.total-totalCost)/p.total)*100):0,displayName:cleanCostName(p.product_name)};
}
export function costSummaryDisplay(data: ProductCostSummary) {
 const {revenue,margin} = data.summary;
 return {comparable:(data.currency || 'SEK') === (data.cost_currency || 'SEK'),marginPercent:revenue > 0 ? Math.round((margin/revenue)*100):0,
 assemblyCostTotal:data.products.reduce((s,p)=>s+p.assembly_cost*p.quantity,0),
 handlingCostTotal:data.products.reduce((s,p)=>s+p.handling_cost*p.quantity,0),
 purchaseCostTotal:data.products.reduce((s,p)=>s+p.purchase_cost*p.quantity,0)};
}
export function costProductGroups(products: ProductCostData[]) {
 return products.filter(p=>!p.parent_product_id).map(parent=>({parent,children:products.filter(p=>p.parent_product_id===parent.id)}));
}

const fields = ['assembly_cost','handling_cost','purchase_cost'] as const;
export function legacyCostDifference(product: Record<string, unknown> | undefined, legacy: Record<string, unknown>) {
  const costs: Partial<Record<'assembly_cost' | 'handling_cost' | 'purchase_cost', number>> = {}, expected: Partial<Record<'assembly_cost' | 'handling_cost' | 'purchase_cost', number>> = {};
  if (!product) return { costs, expected };
  for (const field of fields) {
    const value = legacy[field];
    if (typeof value === 'number' && value !== product[field]) {
      costs[field] = value; expected[field] = product[field] as number;
    }
  }
  return { costs, expected };
}

export function legacyCostDifferences(legacy: any[], products: any[], bookingId: string) {
 return legacy.filter(row=>!row.booking_id || row.booking_id===bookingId).map(row=>{const product=products.find(p=>p.id===row.product_id);return {row,product,...legacyCostDifference(product,row)};}).filter(item=>!item.product || Object.keys(item.costs).length>0);
}
