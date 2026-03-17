

## Problem

"Ta bort" on cancelled bookings tries to DELETE the booking row and all related data from the database. This fails because:
1. The `track_booking_deletions` trigger fires and inserts into `booking_changes` — potential RLS conflicts
2. There are many related tables (packing_projects, transport_assignments, large_project_bookings, warehouse_calendar_events, etc.) that aren't cleaned up first
3. Deleting bookings entirely is destructive and breaks sync — the next import would re-create them

## Fix

"Ta bort" should NOT delete the booking from the database. Instead, it should mark the booking as "handled" by setting `assigned_to_project = true`. This hides it from the triage list without destroying data.

### Changes

**`src/components/project/IncomingBookingsList.tsx`** and **`src/components/dashboard/DashboardNewBookings.tsx`**:

Replace `deleteMutation` logic — instead of deleting the booking row and all related data:
```typescript
mutationFn: async (bookingId: string) => {
  const { error } = await supabase
    .from('bookings')
    .update({ assigned_to_project: true })
    .eq('id', bookingId);
  if (error) throw error;
}
```

This is a simple, safe flag update. The booking stays in the database for audit/sync but disappears from "Nya bokningar". The "Ångra" button already restores status to CONFIRMED — it should also reset `assigned_to_project = false` so confirmed bookings reappear properly.

Both files get the same change.

