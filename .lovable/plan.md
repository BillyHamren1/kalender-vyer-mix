

## Problem

Every time you tap **+** or **−**, `handleIncrement`/`handleDecrement` calls `loadData()` which sets `isLoading = true` (line 79). This triggers the full-screen spinner (lines 181-187) and re-fetches all data from the database, causing the screen to flash/blink.

## Solution: Optimistic local state updates

Instead of calling `loadData()` (which shows a spinner and re-fetches everything), we update the local state immediately after a successful database operation.

### Changes in `src/components/scanner/ManualChecklistView.tsx`

1. **`handleIncrement`** — After a successful API call, update `items` state locally by incrementing `quantity_packed` for that item. Recalculate `progress` locally. Remove the `loadData()` call.

2. **`handleDecrement`** — Same approach: update `items` state locally by decrementing `quantity_packed`. Recalculate progress. Remove the `loadData()` call.

3. **Add a helper function** `recalcProgress(updatedItems)` that computes `{ total, verified, percentage }` from the local items array, so we don't need a server round-trip.

4. **Keep `loadData()`** only for initial load and the manual refresh button — no changes there.

This means tapping +/− will feel instant with no spinner or flicker.

