

## Plan: Highlight non-CONFIRMED bookings in sync reconciliation

### Problem
Bookings with status OFFER or DRAFT in the external Booking system still appear in the reconciliation list on `/admin/sync`. They need to be visually highlighted so it's immediately clear they are not confirmed.

### Changes

**1. Backend: `supabase/functions/sync-reconciliation/index.ts`**
- Include the external booking status in the discrepancy data returned to the frontend. Add a `bookingStatus` field to each discrepancy object so the UI knows the external status of each booking.

**2. Frontend: `src/pages/SyncReconciliation.tsx`**
- Update the `Discrepancy` interface to include `bookingStatus?: string`.
- In the grouped booking card rendering (line ~288), check if the booking's external status is not `CONFIRMED`. If so:
  - Add a colored warning banner/badge on the card header (e.g., orange for OFFER, gray for DRAFT)
  - Apply a distinct border/background color to the card (e.g., `border-orange-400 bg-orange-50`)
  - Show a clear status badge like "OFFERT" or "UTKAST" next to the booking number
- This makes it immediately visible which bookings are not confirmed without needing to find the status discrepancy row.

### Visual result
- CONFIRMED bookings: normal card appearance (as today)
- OFFER bookings: orange-tinted card with "OFFERT" badge
- DRAFT bookings: gray-tinted card with "UTKAST" badge
- CANCELLED bookings: red-tinted card with "AVBOKAD" badge

