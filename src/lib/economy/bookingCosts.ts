import type { BookingExtraCost } from "@/services/planningApiService";
const fields = ["assembly_cost", "handling_cost", "purchase_cost"] as const;
export function extraCostAmount(row: BookingExtraCost): number {
  const computed = (Number(row.quantity) || 0) * fields.reduce((sum, field) => sum + (Number(row[field]) || 0), 0);
  return computed > 0 ? computed : row.amount;
}

export function extraCostsTotal(rows: BookingExtraCost[] | null | undefined): number {
 return (rows ?? []).reduce((sum, row) => sum + extraCostAmount(row), 0);
}
