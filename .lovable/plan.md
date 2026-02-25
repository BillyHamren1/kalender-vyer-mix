

## Problem

Two competing progress calculations:

- **`getVerificationProgress` (server, line 496-512)**: Counts ALL `packing_list_items` rows and checks `verified_at !== null`. This includes parent items, giving 19/20 = 95% even when all children are packed.
- **`recalcProgress` (local, line 143-161)**: Correctly excludes parent items and checks `quantity_packed` vs `quantity_to_pack`.

On initial load, the server version is used → shows 19/20 (95%). The "Signera" button checks `progress.percentage === 100` → never appears.

## Solution

**Remove the server progress call and always use `recalcProgress`** on the loaded items.

### Changes in `src/components/scanner/ManualChecklistView.tsx`

1. **In `loadData` (line 80-100)**: Remove `getVerificationProgress(packingId)` from the `Promise.all` call. After setting items, call `recalcProgress(typedItems)` (or the sorted version) to compute progress locally.

2. **Remove `progressData` variable** and the `setProgress(progressData)` call (line 100).

This ensures the same logic is used everywhere — parents are excluded, quantities are checked — and the "Signera" button will correctly appear at 100%.

```text
Before:
  loadData → getVerificationProgress (counts parents) → 19/20 = 95%
  tap +/−  → recalcProgress (excludes parents)         → 20/20 = 100%
  
After:
  loadData → recalcProgress (excludes parents) → 20/20 = 100% ✓
  tap +/−  → recalcProgress (excludes parents) → consistent ✓
```

