

## Problem

`receive-booking` ignores `event_type` from the webhook and always delegates to `import-bookings`, which calls the external `export_bookings` API. Since that API returns ALL bookings (ignoring `booking_id` filter), two things go wrong:

1. **Cancellations fail silently** if the external API excludes cancelled bookings from its response
2. **Every webhook triggers a full sync** of all 49+ bookings — slow, wasteful, timeout-prone

The webhook already contains the critical information (`booking_id` + `event_type`), so we should act on it directly.

## Plan

### Rewrite `receive-booking` to handle status changes directly

**File:** `supabase/functions/receive-booking/index.ts`

Create a Supabase client with `service_role` and handle events directly:

**For `booking.cancelled`:**
- Look up booking in local DB by `booking_id` + `organization_id`
- If exists and not already CANCELLED:
  - Update status to `CANCELLED`
  - Delete `calendar_events`, `warehouse_calendar_events`
  - Set linked `projects` and `jobs` to `completed`
  - Delete `packing_projects` and `booking_products`
- Return success immediately — no call to `import-bookings`

**For `booking.confirmed` / `booking.updated` / other types:**
- Forward to `import-bookings` as before (metadata/products may have changed)
- Also pass `event_type` in the payload so `import-bookings` can use it as a hint

**For `booking.offer` (downgrade from confirmed):**
- Update status to `OFFER`
- Delete `calendar_events` and `warehouse_calendar_events` (offers don't appear in planning calendar)
- Keep projects/jobs but don't delete them

This reuses the exact same cancellation logic already proven in `import-bookings` (lines 1276-1377), just executed directly from the webhook handler without the external API round-trip.

### Technical details

- Use `createClient` from `@supabase/supabase-js` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- All queries filtered by `organization_id` (multi-tenant compliance)
- Log each action clearly for debugging
- Still fall back to `import-bookings` for non-status-change events

