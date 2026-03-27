

## Root Cause Analysis

There are **two distinct bugs** causing specific booking times to show as default (08:00) in the calendar:

### Bug 1: Calendar reconciliation is skipped for "unchanged" bookings

The deterministic calendar reconciliation code (line ~2647) only runs if the code reaches that point. But there are **three `continue` statements** that skip it:

1. **Line 1837**: `hasBookingChanged` returns false → `continue` (skips calendar reconcile entirely)
2. **Line 1855**: Only warehouse recovery needed → `continue` (skips calendar reconcile)
3. **Line 1859+**: Only product recovery needed → `continue` (skips calendar reconcile)

This means: if a booking was imported **before** the calendar reconciliation code was added (or was imported with default times), and the booking data hasn't changed since, the reconciliation **never runs** and calendar events stay on default times forever.

### Bug 2: process-sync-jobs gets 0 bookings from external API

The logs show every single-booking refresh via `process-sync-jobs` results in "Fetched 0 bookings from external API" after 3 retry attempts. The webhook path is essentially a no-op — bookings are never actually processed through it.

---

## Plan

### Step 1: Always reconcile calendar events for confirmed bookings

Move the calendar reconciliation out of the "only runs if booking changed" gate. For every confirmed booking that passes through `import-bookings` — whether changed or unchanged — run the deterministic reconciliation. This is safe because the reconciliation is idempotent (it compares desired vs actual state).

Specifically:
- At each `continue` statement (lines 1837, 1855, ~product-recovery), add the calendar reconciliation block **before** continuing
- Or better: extract the reconciliation into a helper function and call it at all three early-exit paths plus the main path

### Step 2: Fix the external API single-booking lookup

The `process-sync-jobs` worker sends `organization_id` from the webhook payload (org `c00d649b-...`) but the external API at `wpzhsmrbjmxglowyoyky.supabase.co` may not recognize that org or booking ID. Need to investigate and fix:
- Add logging of the actual external API URL being called for single-booking refreshes
- Ensure the correct `organization_id` is used when querying the external API
- If the external API doesn't support single-booking lookup by that org's IDs, fall back to fetching from the local `bookings` table and reconciling calendar events from stored data

### Step 3: Add a local-data reconciliation fallback

When the external API returns 0 bookings for a single-booking refresh, the worker should fall back to reading the booking from the local `bookings` table and still run calendar reconciliation. The booking data is already stored locally — the times are there.

### Technical Details

**File: `supabase/functions/import-bookings/index.ts`**

1. Extract calendar reconciliation (lines ~2647–2830) into a standalone async function:
   ```
   async function reconcileCalendarEvents(supabase, bookingData, organizationId, results)
   ```

2. Call this function at every exit path for CONFIRMED bookings:
   - Before `continue` at line 1837 (unchanged skip)
   - Before `continue` at line 1855 (warehouse-only recovery)
   - Before `continue` at product-only recovery
   - At the existing location (main path)

3. Add local-data fallback when external API returns 0 for single-booking refresh:
   - Query the local `bookings` table for the booking_id
   - If found and CONFIRMED, run `reconcileCalendarEvents` using local data
   - This ensures webhook-triggered syncs always produce correct calendar events

