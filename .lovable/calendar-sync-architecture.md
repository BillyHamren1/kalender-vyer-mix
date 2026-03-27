# Calendar Sync Architecture — Single Writer Model

## Core Rule

**ONE writer** for booking → calendar_events sync: `supabase/functions/import-bookings/index.ts`

## How It Works

```
External System → receive-booking (intake only) → import-bookings (reconciler)
                                                        ↓
                                                  calendar_events table
                                                        ↓
                                              Frontend (read + display)
```

## Calendar Event Identity

Stable business key: `(booking_id, event_type, source_date, organization_id)`

- `start_time` is NOT part of the identity
- Time changes update the existing row, never create a duplicate
- Enforced by DB constraint: `uq_calendar_event_identity`

## Backend Reconciler (import-bookings)

For each confirmed booking:
1. Compute desired events from booking dates/times
2. Fetch existing calendar_events for booking
3. Match by `event_type|source_date` composite key
4. **CREATE** missing events
5. **UPDATE** events where time/title/address changed
6. **DELETE** stale events no longer in desired state

## Frontend Rules

### ALLOWED (Planner UI operations)
- Drag-and-drop between dates/teams → `updateCalendarEvent`
- Time editing → `updateCalendarEvent`
- Manual event creation (add extra day) → `createCalendarEvent`
- Copy/duplicate events → `createCalendarEvent`
- Delete events → `deleteCalendarEvent`
- Team reassignment → `updateCalendarEvent`

**All write operations MUST also update the `bookings` table** so the next
import-bookings reconciliation sees matching data and doesn't overwrite.

### FORBIDDEN (sync patterns)
- ❌ useEffect that syncs bookings → calendar
- ❌ Health check / restore / recovery logic
- ❌ Batch sync from bookings table
- ❌ "Ensure events exist" logic
- ❌ Any `calendar_events` write triggered by booking fetch/load

### Standalone Projects
- `projectCalendarService.ts` handles events for manual projects (`project-{id}`)
- These are NOT bookings, so they're not covered by import-bookings
- This is a separate, legitimate write path

## receive-booking (Edge Function)

Intake only:
1. Validate API key
2. Validate required fields
3. Forward to import-bookings
4. Return 202 Accepted

**MUST NOT** contain any calendar business logic.

## Audit Trail

- `sync_audit_log` table records each reconciliation pass
- Tracks expected vs actual events, mismatches, create/update/delete counts
- Frontend: `SyncAuditPanel` component for admin visibility

## Files

| File | Role |
|------|------|
| `supabase/functions/import-bookings/index.ts` | Single writer (reconciler) |
| `supabase/functions/receive-booking/index.ts` | Intake only |
| `src/services/eventService.ts` | Read + planner UI writes |
| `src/services/bookingCalendarService.ts` | Stubs (all no-ops) |
| `src/services/calendarService.ts` | Re-export barrel |
| `src/services/projectCalendarService.ts` | Standalone project events |
| `src/hooks/useSyncAuditLog.ts` | Audit log queries |
| `src/components/Calendar/SyncAuditPanel.tsx` | Admin audit UI |
