

## Problem

When a booking is re-confirmed in the external booking system (EventFlow), the `import-bookings` Edge Function automatically:
1. Finds the old cancelled project/job linked to that booking
2. Reactivates it (sets status back to `planning`/`planned`)
3. Sets `assigned_to_project = true`

This means the booking **never appears in the triage list** — it skips straight to the reactivated project. The user wants re-confirmed bookings to appear in "Nya bokningar" so they can choose what to do with them.

## Fix

In `supabase/functions/import-bookings/index.ts`, remove the auto-reactivation logic for re-confirmed bookings (lines ~2009-2057). When a booking transitions from non-CONFIRMED to CONFIRMED:

- Reset `viewed = false` (keep this — it's correct)
- Do **NOT** reactivate cancelled projects/jobs
- Do **NOT** set `assigned_to_project = true`
- Let the booking appear in triage as a fresh confirmed booking

### Changes

**`supabase/functions/import-bookings/index.ts`** (lines ~1996-2057):

Remove the entire block that checks for existing projects/jobs and reactivates them. Keep only:
```typescript
if (!wasConfirmed && isNowConfirmed) {
  updateData.viewed = false;
  console.log(`Resetting viewed flag for re-confirmed booking ${bookingData.id}`);
  // Do NOT auto-reactivate projects/jobs — let booking appear in triage
}
```

Also need to ensure the "Preserve Flags" block (lines ~1960-1988) does NOT preserve flags when a booking is transitioning from CANCELLED to CONFIRMED. Currently it checks for active projects but cancelled projects were already set to cancelled status, so this should be safe. But we should add a guard: skip flag preservation if the booking was previously cancelled.

