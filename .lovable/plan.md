

## Re-import historical bookings with incorrect package components

### Problem
The fix to `import-bookings` (multiplying component quantities by parent package quantity) only applies to future imports. There are **27 existing bookings** in the database where packages with `quantity > 1` have under-counted components (e.g., 3x "Apro 5x5" but only 1 set of components).

### Solution
Create a one-off edge function `reprocess-packages` that:

1. Queries all `booking_products` rows where `parent_product_id IS NULL`, `package_components IS NOT NULL`, and `quantity > 1` to get the list of affected booking IDs
2. For each affected booking, calls `import-bookings` with `syncMode: 'single'` and the booking ID — this triggers the updated deduplication and component-expansion logic
3. Returns a summary of how many bookings were re-processed and any errors

### File to create
**`supabase/functions/reprocess-packages/index.ts`**
- Authenticates the calling user (same pattern as other edge functions)
- Gets the user's `organization_id` from profiles
- Queries affected booking IDs from `booking_products`
- Loops through each booking and invokes `import-bookings` with `syncMode: 'single'`
- Returns `{ success: true, processed: N, errors: [...] }`

### How to run
After deploying, call it once from the browser console or via the Supabase curl tool. After confirming all bookings are fixed, the function can be deleted.

### What stays the same
- No changes to `import-bookings` (the fix is already deployed)
- No database schema changes
- No UI changes needed

### Affected bookings (27 total)
Clients include: Stockholm Pride (8 package types), Tiomila 2026, Westmans Uthyrning, Robot Event AB, and others.

