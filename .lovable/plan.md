

## Plan: Only show external booking changes for review

### Problem
When a Planning user edits a booking (via the proxy), it syncs back through `import-bookings`, triggering the `track_booking_changes` trigger which sets `needs_review = true`. This causes self-made changes to appear as needing review — only changes from the external Booking system should trigger review.

### Solution
Use a PostgreSQL session variable to signal "this update came from Planning" so the trigger can skip setting `needs_review`.

### Changes

**1. Update `import-bookings` edge function** (`supabase/functions/import-bookings/index.ts`)
- Accept a new `skip_review` parameter from the request body
- Before updating bookings, call `SET LOCAL app.skip_review = 'true'` via a raw SQL query when `skip_review` is true
- This session variable is transaction-scoped and auto-clears

**2. Update `track_booking_changes` trigger** (new migration)
- Before setting `needs_review := true`, check `current_setting('app.skip_review', true)`. If it equals `'true'`, skip setting `needs_review`
- This ensures only non-Planning updates (external webhooks, scheduled syncs) flag bookings for review

**3. Pass `skip_review: true` from Planning UI callers**
- `src/hooks/useRefreshBooking.ts` — add `skip_review: true` to the import-bookings body (user manually refreshing a booking they're working on)
- `src/pages/project/LargeProjectLayout.tsx` — add `skip_review: true` to the refresh calls

**4. Scheduled/webhook imports remain unchanged**
- `src/services/importService.ts` (auto-sync, manual "Uppdatera") does NOT pass `skip_review`, so external changes still trigger review as expected

### What stays the same
- The visual styling of the "Uppdaterade bokningar" card (amber theme, pulsing dot)
- The approve/dismiss workflow
- The booking_changes audit trail (all changes are still recorded)

