

## Problem

Every time you open the staff planning view, it calls the external staff API (`fetch_staff_for_planning` Edge Function). This is unnecessary because:

- Staff data is already stored locally in `staff_members` table
- `useUnifiedStaffOperations` already reads and caches from that local table
- Staff rarely changes — syncing on every view is wasteful and slow

There are **three redundant external API callers**:
1. **`StaffSyncManager`** — fires on every mount + date change
2. **`StaffCurtain`** — fires every time the curtain opens (legacy, not even used anymore — replaced by `SimpleStaffCurtain`)
3. **`staffImportService`** — manual import functions

## Plan

### 1. Remove `StaffSyncManager` usage
This component calls the external API on every mount. Remove it from wherever it's rendered. Staff sync should only happen as part of the booking import flow (which already runs `fetch_staff_for_planning` in the Edge Function).

### 2. Remove the old `StaffCurtain` component
It's been replaced by `SimpleStaffCurtain` which correctly uses cached data from `useUnifiedStaffOperations`. The old component makes a redundant external API call.

### 3. Add a manual "Sync Staff" option
Keep `staffImportService` for the rare case when a user explicitly wants to refresh staff from the external system (e.g., a button in settings or on the dashboard). No automatic calls.

### Result
- Opening staff planning: **instant** (reads from cached local data)
- Staff sync: happens automatically during booking import, or manually on demand
- No external API calls on every page navigation

