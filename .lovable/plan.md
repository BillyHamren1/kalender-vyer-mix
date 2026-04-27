## Goal
Make the mobile calendar reflect the personnel calendar exactly: no extra inferred jobs, no project-wide spillover onto days where the staff member is not actually scheduled. Large projects should appear as one project card per day in the mobile calendar, and only show underlying bookings after opening the project.

## What will change
1. Tighten mobile API visibility so scheduled days come only from actual personnel-calendar scheduling rows.
2. Stop using project membership or project-wide expansion as a scheduling source for mobile shift cards.
3. Consolidate large-project shifts in the mobile calendar into one card per project per day.
4. Keep project detail behavior so tapping the project card opens the project page and shows its individual bookings there.
5. Add tests covering the “Billy on another job Tuesday” case and large-project consolidation.

## Implementation plan
### 1) Fix the scheduling authority in `mobile-app-api`
Update `handleGetBookings` so the mobile calendar is derived from the same authority as the personnel calendar:
- Treat only real per-day schedule rows as shift sources for mobile calendar days.
- Do not let `team_id='project'` create visible scheduled shifts by itself.
- Do not expand a scheduled date on one booking into all bookings in the large project for shift generation.
- Keep date filtering strict: if Billy is not scheduled on Tiomila on Tuesday in the personnel calendar, Tiomila must not appear on Tuesday in the mobile app.

### 2) Separate visibility from scheduling
Preserve project/team membership where needed for navigation or data access, but not for calendar placement:
- Membership may still help identify which project a booking belongs to.
- Membership must not create a shift card or a scheduled day.
- The returned `shifts` payload should represent actual scheduled work only.

### 3) Consolidate large projects in the mobile calendar UI
Update mobile calendar rendering so daily shift cards are grouped by large project:
- If multiple shifts belong to the same `large_project_id` on the same day, render one project card.
- Use project name/address on the card.
- Navigate project cards to `/m/project/:projectId` instead of `/m/job/:bookingId`.
- Non-project jobs should continue to render as booking cards.

### 4) Keep drill-down behavior intact
When opening a large project card:
- Show the project detail page that already lists the project’s underlying bookings.
- Ensure this remains the only place where many sub-bookings are exposed, so the calendar stays clean even for very large projects.

### 5) Add regression coverage
Add or update tests to lock in the intended behavior:
- A staff member scheduled on another job Tuesday must not also see Tiomila Tuesday unless Tiomila has an actual personnel-calendar assignment for that day.
- `team_id='project'` alone must not create a visible mobile shift.
- Multiple same-day bookings inside one large project should collapse into one mobile calendar card.
- Tapping a project card should route to the project detail screen.

## Technical details
Files likely involved:
- `supabase/functions/mobile-app-api/index.ts`
- `supabase/functions/mobile-app-api/index.test.ts` and/or related edge-function tests
- `src/hooks/useBookingsByDate.ts` or a new mobile-calendar grouping helper
- `src/components/mobile-app/DayTimeline.tsx`
- `src/components/mobile-app/calendar/MobileDayView.tsx`
- potentially `MobileWeekView.tsx` / `MobileMonthView.tsx` if counts must reflect consolidated project cards instead of raw shifts

Expected behavioral rule:
```text
Personnel calendar = source of truth
Mobile calendar = exact mirror of scheduled workdays
Large project in calendar = one card per project/day
Project detail = place where underlying bookings are shown
```

## Result
After this change, the mobile app will no longer invent extra project days. Staff will only see the job/project they are actually scheduled for that day, and large projects will stay collapsed to a single clean card in the calendar.