# Plan: show all assigned staff in each team column

## What I found
The problem is not in the data layer.

- `src/services/staffService.ts` fetches all assignments for the day.
- `src/hooks/useUnifiedStaffOperations.tsx` returns all matching staff for a team/date.
- `src/components/Calendar/TimeGrid.tsx` maps the full `assignedStaff` array.

So the 5-person limit is a layout bug, not a missing-data bug.

## Root cause
The calendar header row for assigned staff is still hard-locked to a fixed height and clips overflow in several places:

- `src/components/Calendar/TimeGrid.tsx`
  - `ASSIGNED_STAFF_ROW_HEIGHT = 88`
  - row 3 left time cell uses fixed `height`
  - each `.staff-assignment-header-row` gets a fixed minimum height from that constant
- `src/components/Calendar/TimeGrid.css`
  - `.staff-row-time-cell` is fixed to `88px`
  - `.staff-assignment-header-row` is fixed to `88px` and `overflow: hidden`
  - the inner list can wrap, but the parent row cannot grow, so extra names are still clipped

That is why you still only see about 5 names even though more are being rendered.

## Implementation plan
1. Remove the fixed 88px cap from the assigned-staff header row in both `TimeGrid.tsx` and `TimeGrid.css`.
2. Let row 3 grow to the tallest team column for that day instead of clipping each column at a fixed height.
3. Keep the header aligned by using a minimum height, not a forced height.
4. Ensure the left-side spacer/time cell for row 3 stretches with the row, so the grid stays visually aligned.
5. Keep weekly/day/fullscreen calendar behavior intact and avoid changing event rendering or staff assignment data logic.
6. Verify there are no extra CSS overrides reintroducing clipping in this calendar path.

## Technical details
Planned code changes are concentrated here:

- `src/components/Calendar/TimeGrid.tsx`
  - replace fixed `height` usage on row 3 with `minHeight`
  - stop forcing each team cell to a capped row height
- `src/components/Calendar/TimeGrid.css`
  - change `.staff-row-time-cell` from fixed height to minimum/stretch behavior
  - change `.staff-assignment-header-row` from `height/max-height: 88px` + `overflow: hidden` to expandable sizing
  - keep `.assigned-staff-header-list` wrapping, but let the parent actually expand

## Expected result
When a team has more than 5 assigned people, all names should be visible in the calendar header for that day, with the team column expanding vertically instead of clipping the extra names.

If you approve, I’ll implement the layout fix directly in the calendar components.