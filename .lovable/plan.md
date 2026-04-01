

## Problem

Product costs in `ProductCostsCard` are completely **read-only**. The cost columns (Montage/st, Lagerkostnad, Inköp/st) show data from the external Booking system and cannot be edited. When the external system has these as 0, there is no way to correct them.

Additionally, while purchases and budget have local CRUD via `localProjectEconomyService.ts`, the product cost editing is missing entirely.

## Solution

Make the product cost columns **inline-editable** by storing local cost overrides in a new Supabase table, and merging those overrides with the external data.

## Plan

### 1. Create `product_cost_overrides` table (migration)

```sql
CREATE TABLE public.product_cost_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  booking_id TEXT,
  assembly_cost NUMERIC DEFAULT NULL,
  handling_cost NUMERIC DEFAULT NULL,
  purchase_cost NUMERIC DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  organization_id UUID REFERENCES public.organizations(id),
  UNIQUE(project_id, product_id)
);

ALTER TABLE public.product_cost_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on product_cost_overrides" ON public.product_cost_overrides FOR ALL USING (true) WITH CHECK (true);
```

### 2. Add override service functions

New file `src/services/productCostOverrideService.ts`:
- `fetchProductCostOverrides(projectId)` — returns all overrides for a project
- `upsertProductCostOverride(projectId, productId, costs)` — upserts a single product's cost override

### 3. Update `useProjectEconomy` hook

- Fetch `product_cost_overrides` for the project
- Merge overrides into the product costs data: for each product, if an override exists, replace `assembly_cost`, `handling_cost`, `purchase_cost` with the override values
- Expose a `updateProductCost` mutation

### 4. Make `ProductCostsCard` inline-editable

- The three cost columns (Montage/st, Lagerkostnad, Inköp/st) become **click-to-edit** fields
- On click, show an input field; on blur/enter, save via `updateProductCost`
- Changed values get a subtle visual indicator (e.g., slightly different background) to show they are local overrides
- Add a "reset" option to clear an override

### 5. Wire it all together

- Pass `onUpdateProductCost` callback from `ProjectEconomyTab` to `ProductCostsCard`
- Margin and totals recalculate automatically based on edited values

## Files changed

| File | Change |
|---|---|
| New migration | Create `product_cost_overrides` table |
| `src/services/productCostOverrideService.ts` | New — CRUD for overrides |
| `src/hooks/useProjectEconomy.tsx` | Fetch overrides, merge into product costs, expose mutation |
| `src/components/project/ProductCostsCard.tsx` | Inline-editable cost cells |
| `src/components/project/ProjectEconomyTab.tsx` | Pass edit handler to ProductCostsCard |

