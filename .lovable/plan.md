

# Webhook for Booking Sync

## Overview
A new Edge Function `receive-booking` will act as a webhook endpoint that the external booking system (EventFlow) can call whenever a booking is created, updated, or cancelled. This endpoint will trigger the existing `import-bookings` logic in "single booking" mode, ensuring near real-time synchronization without changing the proven import pipeline.

## Architecture

The flow will be:

```text
External Booking System (EventFlow)
        |
        | HTTP POST with booking_id + event type
        v
  receive-booking (new Edge Function)
        |
        | Validates API key (WEBHOOK_SECRET)
        | Logs the incoming webhook event
        |
        | Calls import-bookings internally
        | with syncMode: "single" + booking_id
        v
  import-bookings (existing, unchanged)
        |
        | Fetches latest data from external API
        | Upserts booking, products, attachments
        | Syncs calendar + warehouse events
        | Creates/updates packing projects
        v
  Local Supabase tables updated
```

## What will be built

### 1. New Edge Function: `receive-booking`
- **URL**: `https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/receive-booking`
- **Auth**: `x-api-key` header validated against the existing `WEBHOOK_SECRET` secret (same pattern as `receive-invoice`)
- **Accepts POST** with JSON body containing at minimum `booking_id` and optionally `event_type` (e.g., `created`, `updated`, `cancelled`, `confirmed`)
- On valid request: internally calls the Supabase `import-bookings` function with `{ booking_id, syncMode: "single" }`
- Returns success/failure response with sync results
- Logs all incoming webhooks for debugging

### 2. Config update: `supabase/config.toml`
- Add `[functions.receive-booking]` with `verify_jwt = false` (webhook must be callable without JWT)

### 3. No database changes required
- The existing `import-bookings` function already handles single-booking refresh mode and all downstream sync (products, calendar, warehouse, packing)
- No new tables or columns needed

## Technical Details

- The `receive-booking` function will use the Supabase service role key to invoke `import-bookings` via an internal HTTP call (same project, full URL)
- The existing `WEBHOOK_SECRET` secret will be reused for authentication (already configured)
- The function will support both `x-api-key` header and `Authorization: Bearer` header for flexibility
- Error responses follow the same pattern as `receive-invoice` (structured JSON with status codes)

## What needs to happen on the external system side
After deployment, the external booking system (EventFlow) needs to be configured to send POST requests to the webhook URL whenever a booking changes. This is something you would set up in EventFlow's admin/settings. The payload should include at least `booking_id`.

