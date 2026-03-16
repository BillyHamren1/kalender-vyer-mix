

## Problem Analysis

Calendar events disappear because of a chain of bugs in `import-bookings`:

1. **`hasBookingChanged` triggers false positives**: It compares `assigned_project_id`, `assigned_project_name`, `assigned_to_project` -- fields set locally when a job is created, but absent from external data. This causes `hasChanged = true` on every sync cycle for any booking with a local project/job.

2. **Calendar events are deleted unconditionally**: When `hasChanged` is true (line 2053-2060), ALL calendar events for that booking are deleted.

3. **Calendar events fail to recreate**: The upsert at line 2559-2570 does NOT include `organization_id`. Since `service_role` bypasses auth, `get_user_organization_id(auth.uid())` returns NULL, violating the NOT NULL constraint. Events silently fail to insert.

4. **Client-side realtime doesn't compensate**: The booking UPDATE fires a realtime event, but `smartUpdateBookingCalendar` sees CONFIRMED→CONFIRMED with unchanged dates and does nothing.

**Result**: Every sync cycle, calendar events for bookings with local jobs/projects get deleted and never recreated.

## Fix Plan

### 1. Remove project assignment fields from `hasBookingChanged` (import-bookings)
Remove `assigned_project_id`, `assigned_project_name`, `assigned_to_project` from the comparison fields array. These are local-only fields and should never trigger a "changed" state from external data.

### 2. Add `organization_id` to calendar event upserts (import-bookings)  
Add `organization_id: organizationId` to the calendar event upsert object at line 2561-2569, matching how warehouse events already include it.

### 3. Stop deleting calendar events on non-date changes (import-bookings)
Change the `if (hasChanged)` block (line 2053-2060) to only delete calendar events when date/time fields actually changed, not for any metadata change. This prevents unnecessary event deletion.

### Technical Details

**File**: `supabase/functions/import-bookings/index.ts`

- **Line 810-813**: Remove `assigned_project_id`, `assigned_project_name`, `assigned_to_project` from `hasBookingChanged` fields array
- **Lines 2053-2061**: Change condition from `if (hasChanged)` to only delete calendar events when date fields changed:
  ```typescript
  const datesChanged = ['rigdaydate','eventdate','rigdowndate'].some(f => 
    (bookingData[f] || '') !== (existingBooking[f] || '')
  );
  if (datesChanged) {
    // delete calendar events
  }
  ```
- **Line 2561-2569**: Add `organization_id: organizationId` to the calendar event upsert object

