

## Problem

Products with quantity > 1 (e.g. "H Mastertent - 3x3 x7") are shown as a single row. The user needs to split them into individual unit rows so they can assign specific units to different activities or people (e.g. 3 tents to person X, 4 to person Y).

## Solution

Add an "expand/split" feature to the product list in `ActivityPlannerSheet.tsx` that explodes a product with quantity N into N individual selectable rows.

### How it works

1. **Split button**: Next to each product with `quantity > 1`, show a small split/expand icon button
2. **Expanded state**: When clicked, the single "H Mastertent - 3x3 x7" row is replaced by 7 individual rows labeled "H Mastertent - 3x3 (1/7)", "H Mastertent - 3x3 (2/7)", etc.
3. **Collapse button**: A button to collapse them back into a single row
4. **Individual selection**: Each expanded row gets its own checkbox so the user can select e.g. 3 of the 7 and attach them to one activity, then select the remaining 4 for another
5. **Virtual IDs**: Expanded rows use virtual IDs like `{productId}__unit_1`, `{productId}__unit_2` etc. since the DB has one row. When saving, the task stores the original `product.id` but with a quantity override

### Technical changes

**`ActivityPlannerSheet.tsx`**:
- Add `expandedProductIds` state (`Set<string>`) tracking which products are currently split
- Modify `renderProductNode`: if product is expanded, render N individual checkbox rows instead of one; if not expanded but qty > 1, show a split button
- Update `attachProductsToRow` to handle virtual unit IDs — store them in `productIds` with quantity metadata
- Update the product chip display to show "H Mastertent - 3x3 (3 av 7)" when partial units are attached

**`ActivityRow` interface**: Add optional `productQuantities` field (`Record<string, number>`) mapping product ID to how many units are assigned to this row, so when saving we know "3 of 7 mastertents go to this activity"

**`createEstablishmentTask` call**: Pass the quantity-per-product info so it can be stored (likely as part of `source_product_ids` metadata or a new field)

### UX flow
1. User sees "H Mastertent - 3x3  x7" with a split icon
2. Clicks split → 7 rows appear with individual checkboxes
3. Checks 3 of them, attaches to "Montering Team A"
4. Checks remaining 4, attaches to "Montering Team B"
5. Each activity knows exactly which units it owns

