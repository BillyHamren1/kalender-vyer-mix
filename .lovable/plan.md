

## Plan: Fix staff container alignment + click-to-assign workflow

### Problem 1: Staff container looks broken on the left
The "Personal" container above the day card spans the full width starting from the left edge, while the day card below has a TIME column (~60px) creating a visual misalignment. The staff pills should be offset to align with the team columns.

### Problem 2: New assignment flow
Currently, clicking the "+" button on a team header opens a dropdown/curtain to select staff. Instead, the flow should be:
1. User clicks "+" on a team header
2. This activates a "selection mode" where the staff names in the container above become clickable
3. User clicks a staff name above to assign them to the selected team
4. Selection mode deactivates after assignment

### Changes

**File: `src/components/Calendar/TimeGrid.tsx`**
- Fix the staff container layout: add left padding equal to the TIME column width so pills align with team columns
- Add state: `selectingForTeam: { resourceId, resourceTitle } | null`
- When "+" is clicked, instead of calling `onOpenStaffSelection`, set `selectingForTeam`
- Make staff pills clickable when `selectingForTeam` is active — clicking a pill calls `onStaffDrop(staffId, resourceId)` and clears selection mode
- Visual feedback: highlight the active team header and make staff pills show a cursor pointer + hover effect when in selection mode
- Add a subtle banner/indicator showing which team is being assigned to, with a cancel button

**File: `src/pages/CustomCalendarPage.tsx`** (and WarehouseCalendarPage)
- No changes needed — the staff curtain logic can remain but won't be triggered from TimeGrid anymore (TimeGrid handles assignment internally via `onStaffDrop`)

### Technical details
- The TIME column width is stored in `timeColumnWidth` variable (likely 60px)
- Staff container gets `paddingLeft: timeColumnWidth` to align with team columns
- Selection mode state lives in TimeGrid since it's purely UI interaction
- Staff pills get `onClick` handler gated by `selectingForTeam !== null`
- After successful assignment, clear `selectingForTeam` and the staff list refreshes automatically

