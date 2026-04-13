

## Problem
The "Uppdatera" button calls `import-bookings` with only `{ syncMode: 'incremental' }`. The edge function now requires `organization_id` explicitly and rejects the request with a 500.

## Fix
**File: `src/pages/ProjectManagement.tsx`** — Update `handleSyncBookings` to fetch the user's `organization_id` from their profile before invoking the edge function, matching the pattern already used in `useRefreshBooking.ts`.

Changes:
1. Before the `supabase.functions.invoke` call, get the current user via `supabase.auth.getUser()`
2. Look up their `organization_id` from the `profiles` table
3. Include `organization_id` in the request body: `{ syncMode: 'incremental', organization_id: orgId }`

This is a single-file, ~10-line change. No database or edge function changes needed.

