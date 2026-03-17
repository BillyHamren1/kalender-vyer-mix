

## Problem

When a booking has been assigned to a project (small, medium, or large), there is no way to change that assignment. The user wants three capabilities:

1. **Re-link a booking to a different project type** (e.g., move from small to large)
2. **Delete a project** (already exists in UnifiedProjectList, but should also be accessible from detail views)
3. **Convert/upgrade project type** (e.g., small → medium, small → large)

## Current State

- Delete functionality exists in `UnifiedProjectList` for all three types (small/medium/large)
- `deleteJob` in `jobService.ts` correctly un-assigns the booking (resets `assigned_to_project`, `assigned_project_id`, `assigned_project_name`)
- No convert/upgrade functionality exists anywhere
- The `IncomingBookingsList` only shows unassigned bookings, so once assigned, there's no way back without deleting

## Plan

### 1. Add a "Convert Project" service function

Create a new service function `convertProjectType` in a shared location (e.g., `src/services/projectConversionService.ts`) that:
- Takes the current project type + ID and target type as parameters
- Deletes the current project (reusing existing delete logic to un-assign the booking)
- Then creates the new project type from the same booking (reusing existing create logic)
- For "large project", opens the large project creation dialog with the booking pre-selected

### 2. Add action menu to UnifiedProjectList rows

Expand each project row in `UnifiedProjectList.tsx` with a dropdown menu (using `DropdownMenu`) that offers:
- **Ändra till Litet** / **Medel** / **Stort** (hide current type)
- **Ta bort projekt** (existing delete, moved into dropdown)

The conversion options will:
1. Delete the current project (un-assigning the booking)
2. Create the new project type from the same `booking_id`
3. Navigate to the new project detail view

### 3. Add action buttons to JobDetail page

Add a dropdown or button group in the `JobDetail.tsx` header area with:
- "Ändra till Medelprojekt" — deletes job, creates medium project, navigates
- "Ändra till Stort projekt" — deletes job, opens large project creation flow
- "Ta bort projekt" — deletes job, navigates back to /projects

### 4. Service layer changes

**New file: `src/services/projectConversionService.ts`**
- `convertToSmall(bookingId)` — calls `deleteCurrentProject()` then `createJobFromBooking(bookingId)`
- `convertToMedium(bookingId)` — calls `deleteCurrentProject()` then creates a medium project via `projectService`
- `convertToLarge(bookingId)` — calls `deleteCurrentProject()`, returns booking ID for large project dialog

Each conversion function needs the current project type + ID to delete, plus the `booking_id` to recreate.

### 5. Files to modify

| File | Change |
|------|--------|
| `src/services/projectConversionService.ts` | New — conversion logic |
| `src/components/project/UnifiedProjectList.tsx` | Add dropdown menu with convert + delete options per row |
| `src/pages/JobDetail.tsx` | Add convert/delete actions in header |
| `src/pages/ProjectView.tsx` (medium) | Add convert/delete actions if applicable |

### Technical notes

- Conversion is implemented as delete-then-create to reuse existing, well-tested logic and booking flag management
- The booking's `assigned_to_project` / `assigned_project_id` flags are automatically reset by existing delete functions and re-set by existing create functions
- For large projects (which can hold multiple bookings), conversion opens the existing large project dialog with the booking pre-selected rather than auto-creating

