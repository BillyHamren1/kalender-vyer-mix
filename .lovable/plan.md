

## Problem Analysis

When dates are changed in a large project ("Projekt stort"), the booking disappears from the calendar. Here's what happens:

1. User changes dates in `LargeProjectLayout.tsx`
2. `updateBookingDateWithTimes()` updates the **local** `bookings` table with new dates
3. Immediately after, `import-bookings` edge function is called with `syncMode: 'single'`
4. `import-bookings` fetches the booking from the **external API** — which still has the **old** dates
5. The external data overwrites the locally-changed dates back to old values (line 2610-2667)
6. `reconcileCalendarEvents` runs with the **old** dates from the external API
7. If the old dates differed from what was already in the calendar (because the user just changed them), the reconciler marks the calendar events with new dates as "stale" and deletes them

**Result**: The calendar events created with the new dates are deleted, and the old dates are restored on the booking. The project "disappears" because the calendar now shows events on the old dates (or the events were deleted as stale).

## Root Cause

The `LargeProjectLayout.tsx` date update flow (lines 288-327) is fundamentally broken:
- It first writes new dates to the local DB
- Then calls `import-bookings`, which fetches from the external system and **overwrites** local dates

The external system is the source of truth for `import-bookings`, but for locally-initiated date changes, **the local DB should be the source of truth**.

## Solution

**Stop calling `import-bookings` after local date changes in large projects.** Instead, use the **local fallback reconciliation** path directly — or better yet, call a dedicated calendar reconciliation that reads from the local DB.

### Changes

**File: `src/pages/project/LargeProjectLayout.tsx`** (lines 305-318)

Replace the `import-bookings` edge function call with a direct call to reconcile calendar events using **local booking data**. Two approaches:

**Option A (Recommended — minimal change):** After `updateBookingDateWithTimes`, skip the `import-bookings` call entirely. Instead, call `import-bookings` with a new flag `localOnly: true` that tells it to skip the external API fetch and go straight to the local fallback path.

**File: `supabase/functions/import-bookings/index.ts`**

Add support for a `localOnly` flag in the request body. When `localOnly: true` AND `booking_id` is provided:
- Skip the external API fetch entirely
- Go directly to the local fallback path (lines 1698-1736) which reads from the local `bookings` table
- This ensures calendar reconciliation uses the dates the user just saved

### Specific code changes:

1. **`supabase/functions/import-bookings/index.ts`** — around line 1521, read `localOnly` from body. Around line 1598, if `localOnly && isSingleBookingRefresh`, skip the external API fetch and jump directly to the local fallback block.

2. **`src/pages/project/LargeProjectLayout.tsx`** — line 315, add `localOnly: true` to the `import-bookings` call body:
```typescript
body: { booking_id: bid, syncMode: 'single', organization_id: orgId, localOnly: true }
```

### Why this works
- The user just wrote the correct dates to the `bookings` table
- The local fallback path in `import-bookings` reads from that table
- `reconcileCalendarEvents` then computes desired events from the correct (new) dates
- No external API fetch = no date overwrite

### Files to change
- `supabase/functions/import-bookings/index.ts` — add `localOnly` support
- `src/pages/project/LargeProjectLayout.tsx` — pass `localOnly: true`
- `src/components/project/ProjectScheduleEditable.tsx` — also needs `localOnly: true` if it calls import-bookings (check needed)

