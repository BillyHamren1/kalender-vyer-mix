

## Problem Analysis

Two distinct issues causing the booking system to report timeouts:

### Issue 1: Webhook chain too slow (PRIMARY)
`receive-booking` synchronously calls `import-bookings` (line 74-83) and awaits the full response. `import-bookings` then calls the external API with up to 45s timeout. The booking system's webhook has a ~16s timeout, so the whole chain exceeds that limit every time.

### Issue 2: sync_state upsert failing (SECONDARY)
The `sync_state` table has a unique constraint on `sync_type` (`sync_state_sync_type_key`), but the upsert at lines 1044 and 1631 doesn't specify `onConflict: 'sync_type'`. Supabase JS defaults conflict detection to the primary key (`id`), so every call tries to INSERT a new row and fails with `duplicate key value violates unique constraint "sync_state_sync_type_key"`. This means the sync timestamp never updates, and incremental sync fetches the same window repeatedly.

---

## Plan

### Fix 1: Make webhook fire-and-forget
In `supabase/functions/receive-booking/index.ts`, respond to the webhook immediately with `202 Accepted`, then fire the `import-bookings` call without awaiting it. If the edge runtime terminates before import completes, the background sync (every 30s) will catch the booking anyway.

```typescript
// Fire import-bookings without awaiting
fetch(`${supabaseUrl}/functions/v1/import-bookings`, { ... })
  .catch(err => console.error('Background sync trigger failed:', err));

// Respond immediately
return new Response(
  JSON.stringify({ success: true, accepted: true, booking_id }),
  { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

### Fix 2: Add onConflict to sync_state upserts
In `supabase/functions/import-bookings/index.ts`, add `{ onConflict: 'sync_type' }` to both upsert calls (lines ~1044 and ~1631) so they correctly update the existing row instead of failing.

```typescript
.upsert({ sync_type: 'booking_import', ... }, { onConflict: 'sync_type' })
```

### Files to edit
- `supabase/functions/receive-booking/index.ts` — fire-and-forget pattern
- `supabase/functions/import-bookings/index.ts` — add `onConflict: 'sync_type'` to both upserts

### Expected result
- Booking system gets a 202 response in <1 second (no more timeouts)
- sync_state updates correctly, so incremental sync only fetches truly new/changed bookings
- Both fixes deployed automatically

