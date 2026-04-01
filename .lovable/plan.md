

## Problem

When a large project has no `start_date`/`end_date` set on the project record itself, the Gantt chart shows a "no dates" message — even though the underlying bookings and tasks DO have dates. This makes the planning view unusable for projects that haven't explicitly set project-level dates.

## Solution

Two changes to fix this:

### 1. Derive effective dates from tasks when project dates are missing (`EstablishmentGanttChart.tsx`)

After tasks are loaded (~line 165), compute fallback dates from the task data itself:

- If `startDate`/`endDate` props are null but tasks exist with `start_date`/`end_date`, derive the min/max from those tasks
- Update the `hasDates` check to also consider whether tasks with dates exist
- This way the Gantt renders its timeline from actual task dates even without project-level dates

### 2. Auto-populate project dates from bookings on creation (`LargeEstablishmentPage.tsx`)

When passing `startDate`/`endDate` to the Gantt, fall back to the earliest/latest dates found across the project's bookings (from `projectBookings` or analytics data) if the project record itself has no dates.

### Technical detail

In `EstablishmentGanttChart.tsx`:
- Add a `useMemo` that computes `derivedStartDate` and `derivedEndDate` from `allTasks` (min of `start_date`, max of `end_date`)
- Change the `effectiveStartDate`/`effectiveEndDate` to use these derived dates as fallback
- Update `hasDates` to: `isProjectMode ? (!!startDate || !!endDate || allTasks.some(t => t.start_date)) : (!!rigDate && !!eventDate)`

This is a minimal, non-architectural change — the Gantt simply becomes smarter about finding dates when they aren't explicitly provided at the project level.

