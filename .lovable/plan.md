

# Fix: Updated booking times not synced + Team move not visually updating

## Two root causes identified

### Issue 1 — Booking time changes ignored by import
The `hasBookingChanged` function in the `import-bookings` edge function (line 820) only checks these fields:
`client, rigdaydate, eventdate, rigdowndate, deliveryaddress, delivery_city, delivery_postal_code, status, booking_number`

**Time fields are completely missing**: `rig_start_time`, `rig_end_time`, `event_start_time`, `event_end_time`, `rigdown_start_time`, `rigdown_end_time`.

When booking #2603-31R1 gets updated times from the external system, the import function says "no changes detected" and skips the entire update — the booking row never gets updated, so calendar events are never refreshed.

Additionally, even when dates DO change and events are recreated, the import uses **hardcoded** `08:00:00` start times (line 2540, 2557, 2574) instead of the actual booking times.

### Issue 2 — Team move succeeds in DB but doesn't visually update
The `calendar_events` table is **NOT in the `supabase_realtime` publication**. The app subscribes to realtime changes on `calendar_events` (line 274 of `useRealTimeCalendarEvents.tsx`), but Supabase never sends events because the table isn't published.

The `refreshEvents()` call after the move DOES run and re-fetches data, but there's a timing issue: the `MoveEventDateDialog` calls `onOpenChange(false)` then `onUpdate()` — but the dialog close may trigger a re-render that prevents the refresh from propagating correctly.

## Plan

### Step 1 — Add time fields to `hasBookingChanged` in the edge function
**File:** `supabase/functions/import-bookings/index.ts` (line ~821)

Add the six time fields to the comparison array so that time-only changes are detected and trigger a booking update + calendar event refresh.

### Step 2 — Use actual booking times when recreating calendar events
**File:** `supabase/functions/import-bookings/index.ts` (lines ~2539-2587)

When creating calendar events after a date change, use `bookingData.rig_start_time` / `rig_end_time` etc. instead of hardcoded `08:00:00`. Fall back to defaults only when the time fields are null.

### Step 3 — Add `calendar_events` to realtime publication
**Migration:** Add `ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;`

This makes the existing realtime subscription in `useRealTimeCalendarEvents.tsx` actually receive events, enabling instant visual updates when events are moved between teams.

### Step 4 — Fix refresh after team move in MoveEventDateDialog
**File:** `src/components/Calendar/MoveEventDateDialog.tsx`

Ensure `onUpdate` is awaited before closing the dialog, so the data refresh completes and the UI sees the new resource assignment. Currently `onOpenChange(false)` runs first (line 119), then `onUpdate()` (line 120) — reverse this order.

---

### Technical details
- `hasBookingChanged` needs: `rig_start_time`, `rig_end_time`, `event_start_time`, `event_end_time`, `rigdown_start_time`, `rigdown_end_time`
- Calendar event creation at lines 2540/2557/2574 should extract time from booking fields like `syncSingleBookingToCalendar` does (line 177)
- The `supabase_realtime` publication change may need `IF NOT EXISTS` guard to avoid errors if already added

