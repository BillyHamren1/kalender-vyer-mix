
# Why Gröna Lund #2603-102 doesn't appear in the staff calendar

## Root Cause

Two things are missing for this booking (and 7 others):

1. **No calendar events** — The booking is CONFIRMED with `rigdowndate: 2026-03-26`, but `syncSingleBookingToCalendar` was never triggered for it. The existing "one-time sync" uses `localStorage`, which only runs per-browser and can easily be missed.

2. **No staff assignments** — The staff calendar query joins `booking_staff_assignments` with `calendar_events`. Even if calendar events existed, no staff are assigned to this booking, so it wouldn't appear on any staff member's calendar.

## Affected Bookings

8 confirmed bookings have zero calendar events:
`2603-20`, `2603-100`, `2603-5`, `2603-83`, `2603-6`, `2603-9`, `2603-102`, `2603-23`

## Plan

### Step 1: Create a server-side calendar sync failsafe

Add logic to `syncSingleBookingToCalendar` call within the booking detail page load. When a confirmed booking is opened and has no calendar events, auto-sync it. This replaces the unreliable localStorage-based one-time sync.

**File:** `src/services/bookingCalendarService.ts` — add an `ensureBookingCalendarEvents` function that checks if events exist and syncs if missing.

### Step 2: Trigger sync on booking detail load

**File:** `src/hooks/useCalendarEvents.tsx` or wherever booking detail data is fetched — call `ensureBookingCalendarEvents` when loading a confirmed booking that has no calendar events.

Alternatively, add this check inside the booking detail page component so every time a user views a confirmed booking, it self-heals.

### Step 3: Run a one-time migration to sync all missing bookings now

Create a small admin action or Edge Function that iterates all confirmed bookings without calendar events and syncs them. This fixes the 8 currently broken bookings immediately.

### Step 4: Surface staff assignment status

In the booking detail view, make it clear when no staff are assigned (which is why it won't appear on any staff calendar even after calendar events are created). The staff must be assigned via the planning UI or booking detail for the event to show on their personal calendar.

---

### Technical Details

- **Staff calendar query chain:** `booking_staff_assignments` (filtered by staff_id + date range) → `calendar_events` (matched by booking_id + team_id + date). Both must exist.
- The `localStorage`-based one-time sync in `useCalendarEvents.tsx` is fundamentally unreliable — it's per-browser, per-device, and resets if storage is cleared.
- The `ensureBookingCalendarEvents` function will do a lightweight check (`SELECT count(*) FROM calendar_events WHERE booking_id = ?`) before deciding to sync.
