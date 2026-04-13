

## Problem

2,190 package component rows (`is_package_component = true`) in `booking_products` are showing as "Extra lokal produkt" in the reconciliation view. These are sub-components of packages (e.g., "-- M Krysstag", "-- M Snabblås") that don't exist as separate products in the external Booking API. They were created during import as package breakdowns and should be deleted.

## Plan

### Step 1: Delete all package component rows from the database

Create a migration that removes all rows where `is_package_component = true`:

```sql
DELETE FROM booking_products WHERE is_package_component = true;
```

This removes ~2,190 rows, leaving ~1,613 actual products.

### Step 2: Filter package components in reconciliation comparison

Update `sync-reconciliation/index.ts` (line ~305) to exclude `is_package_component` products from the local comparison set so they never appear as "extra local" even if re-imported:

```typescript
for (const p of (localProducts || [])) {
  if (p.is_package_component) continue;  // skip package components
  const arr = localProductsByBooking.get(p.booking_id) || [];
  arr.push(p);
  localProductsByBooking.set(p.booking_id, arr);
}
```

### Step 3: Also ensure the "Alla" view shows metadata and attachments

The user also complained that ONLY products are shown, not metadata or attachments. I will verify the UI renders all three categories and fix if the discrepancies for metadata/attachments are being filtered out or not generated.

### Files changed

1. **Database migration** -- delete package component rows
2. **`supabase/functions/sync-reconciliation/index.ts`** -- filter out package components from local product comparison
3. Deploy edge function

