

## Problem

`booking_attachments` has **9,092 rows but only 687 unique URLs** — massive duplication from repeated imports. The reconciliation tool currently only compares attachment counts, not actual content. The user wants:

1. **Same attachment on both sides** → keep one copy, delete duplicates
2. **Different attachments** → keep all (merge both sides)

## Plan

### Step 1: Clean up existing duplicates in `booking_attachments`

Run a data operation to deduplicate — for each `(booking_id, url)` combo, keep one row, delete the rest. This alone should reduce ~9,092 rows to ~687.

```sql
DELETE FROM booking_attachments
WHERE id NOT IN (
  SELECT DISTINCT ON (booking_id, split_part(url, '?', 1)) id
  FROM booking_attachments
  ORDER BY booking_id, split_part(url, '?', 1), uploaded_at ASC
);
```

### Step 2: Update `sync-reconciliation` attachment comparison

Replace the simple count comparison (lines 453-468) with URL-based comparison:

- Normalize URLs by stripping query params (same logic as `import-bookings`)
- Identify attachments **only in Booking** (external) → flag for import
- Identify attachments **only in Planning** (local) → flag as extra local
- Identify attachments **in both** (same URL base) → mark as synced, no action needed
- Report individual missing/extra attachments instead of just count differences

### Step 3: Update `sync-reconciliation` apply logic

For attachment corrections:
- **Missing locally (exists in Booking only)**: trigger `import-bookings` for that booking to pull them in (already does this)
- **Extra locally (exists in Planning only)**: keep them — they may be map snapshots or manually uploaded files
- **Duplicates**: the dedup in Step 1 handles historical mess; prevent future dupes by ensuring `import-bookings` dedup logic (which already exists via `seenUrls` set) works correctly

### Step 4: Add unique constraint to prevent future duplicates

Add a migration with a unique index on `(booking_id, url_base)` or use a partial unique index to prevent the same URL from being inserted twice per booking.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS booking_attachments_booking_url_unique 
ON booking_attachments (booking_id, split_part(url, '?', 1));
```

### Files changed

1. **`supabase/functions/sync-reconciliation/index.ts`** — Enhanced attachment comparison (URL-based) and apply logic
2. **Database migration** — Dedup existing rows + unique index
3. Deploy edge function

### Technical detail

- URL normalization strips `?query` params for comparison (cache-busting tokens differ between imports)
- The `import-bookings` function already has `seenUrls` dedup logic but it only prevents dupes within a single import run — not across runs. The unique index fixes this permanently.

