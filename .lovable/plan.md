

## Problem

Two issues:

1. **No lifecycle automation**: When a booking is cancelled (AVBOKAD), its linked project/job status is NOT automatically updated. The project stays in its old status (e.g. "planning") even though the booking is cancelled.

2. **Cancelled bookings invisible in triage**: The "Nya bokningar" lists only show `CONFIRMED` bookings. A cancelled booking that had a project should appear back in the triage — but with red styling instead of amber — so the user sees it needs attention.

## Plan

### A. Auto-update project/job status on booking cancellation

**File: `src/components/booking/StatusChangeForm.tsx`**

After successful status update in `handleStatusUpdate`, when `newStatus === 'CANCELLED'`:
- Query `jobs` table for any job with `booking_id = bookingId` → update status to `completed`
- Query `projects` table for any project with `booking_id = bookingId` → update status to `cancelled`
- Reset booking assignment flags (`assigned_to_project = false`, `assigned_project_id = null`, `assigned_project_name = null`)
- Invalidate `['jobs']`, `['projects']`, `['large-projects']` queries

Similarly when `newStatus === 'OFFER'` (downgrade from confirmed):
- Same logic: mark linked project/job as completed/cancelled, reset assignment flags

This logic will be extracted into a helper function (e.g. `handleBookingCancellationSideEffects`) in `bookingStatusService.ts` to keep the component clean.

### B. Show cancelled bookings in triage with red styling

**Files: `src/components/project/IncomingBookingsList.tsx` and `src/components/dashboard/DashboardNewBookings.tsx`**

- Expand the filter to include `CANCELLED` bookings that are unassigned (in addition to `CONFIRMED`)
- For cancelled bookings in the list: use red header/badge styling instead of amber
- Hide the "create project" action buttons for cancelled bookings (they're informational)
- Show a red "Avbokad" badge next to the booking name

### C. Invalidate project queries on status change

**File: `src/components/booking/StatusChangeForm.tsx`**

Add to the `finally` block:
```
queryClient.invalidateQueries({ queryKey: ['jobs'] });
queryClient.invalidateQueries({ queryKey: ['projects'] });
queryClient.invalidateQueries({ queryKey: ['large-projects'] });
queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
```

### Files to change

| File | Change |
|------|--------|
| `src/services/booking/bookingStatusService.ts` | Add `handleBookingLifecycleSideEffects()` that auto-cancels linked projects/jobs and resets assignment flags |
| `src/components/booking/StatusChangeForm.tsx` | Call the new side-effects function after status update; invalidate project queries |
| `src/components/project/IncomingBookingsList.tsx` | Include `CANCELLED` unassigned bookings with red styling, no action buttons |
| `src/components/dashboard/DashboardNewBookings.tsx` | Same cancelled booking display logic |

