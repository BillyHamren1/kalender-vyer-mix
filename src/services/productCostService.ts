/**
 * Product cost types — aligned with Booking system's planning-api response format.
 * All field names match the external API exactly (snake_case).
 */

export interface ProductCostData {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount: number;
  assembly_cost: number;
  handling_cost: number;
  purchase_cost: number;
  vat_rate: number;
  is_manual: boolean;
  manual_type: string | null;
  parent_product_id?: string | null;
}

export interface ProductCostSummary {
  products: ProductCostData[];
  summary: {
    revenue: number;
    costs: number;
    margin: number;
  };
}
