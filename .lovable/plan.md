

## Problem

When a project is deleted for a **cancelled** booking, the `recomputeBookingAssignment` service clears all assignment flags (`assigned_to_project = false`). This makes the cancelled booking reappear in the "Nya bokningar" triage list — which is wrong. A cancelled booking with no project should simply stay hidden, not come back for re-assignment.

## Root Cause

`recomputeBookingAssignment` doesn't check the booking's own status. When no active project/job/large-link exists, it blindly sets `assigned_to_project = false`, regardless of whether the booking is `CANCELLED`.

## Fix

**File: `src/services/bookingAssignmentService.ts`**

In the "no active links" branch (the `else` block at line 72), before clearing flags, check the booking's status. If the booking is `CANCELLED` or `OFFER`, keep `assigned_to_project = true` so it stays hidden from triage:

```typescript
} else {
  // No active links — check if booking is cancelled/offer
  const { data: booking } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', bookingId)
    .single();

  const isCancelledOrOffer = booking?.status === 'CANCELLED' || booking?.status === 'OFFER';

  const { error } = await supabase
    .from('bookings')
    .update({
      assigned_to_project: isCancelledOrOffer ? true : false,
      assigned_project_id: null,
      assigned_project_name: null,
      large_project_id: null,
    })
    .eq('id', bookingId);
  if (error) throw new Error(`Kunde inte uppdatera bokning: ${error.message}`);
}
```

This way:
- **CONFIRMED** booking + no project → reappears in triage (correct, user can re-assign)
- **CANCELLED/OFFER** booking + no project → stays hidden (correct, nothing to do)

Also remove `CANCELLED` from the triage filter in `IncomingBookingsList.tsx` and `DashboardNewBookings.tsx` — cancelled bookings should not appear in "Nya bokningar" at all. The red styling from the previous change becomes unnecessary.

### Files to change

| File | Change |
|------|--------|
| `src/services/bookingAssignmentService.ts` | Check booking status before clearing flags; keep `assigned_to_project = true` for cancelled/offer |
| `src/components/project/IncomingBookingsList.tsx` | Remove `CANCELLED` from triage filter (revert to CONFIRMED-only) |
| `src/components/dashboard/DashboardNewBookings.tsx` | Same — remove CANCELLED from filter |

