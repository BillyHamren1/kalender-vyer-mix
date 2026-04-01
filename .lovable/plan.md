

## Add "Markera alla" (Select All) to product list

### Change

In `ActivityPlannerSheet.tsx`, add a "Markera alla" checkbox/button in the product list header (lines 817-826) that toggles selection of all visible products. When clicked, it adds all product IDs from `productTree` to `selectedIds`. Clicking again deselects all.

### Details

- Add a `selectAllProducts` function that collects all product IDs from `productTree` (root-level only, since package components are already filtered out) and sets them into `selectedIds`
- If all are already selected, clear the selection instead (toggle behavior)
- Place the checkbox+label "Markera alla" next to the header text, visible only when `attachingToRowId` is set (i.e. when the user is in "attaching" mode)
- Uses the existing `Checkbox` component for consistency

**File**: `src/components/project/ActivityPlannerSheet.tsx` — ~10 lines added

