

## Root Cause Analysis

The bug is a **status filter mismatch** between two components:

### The sequence of events

1. Booking originally CONFIRMED → a job (small project) was created → `assigned_to_project = true`
2. Booking CANCELLED externally → `import-bookings` sets the job status to **`completed`** (line 1968), deletes calendar/packing/products
3. Booking re-CONFIRMED externally → `import-bookings` correctly skips flag preservation (line 2621), resets `viewed = false` → booking appears in triage

### Where the conflict lives

**IncomingBookingsList** (line 55) filters correctly:
```
.not('status', 'in', '("completed","cancelled")')
```
The old job has status `completed`, so it's excluded → booking **appears in triage**. User sees it and clicks "Medel".

**CreateProjectWizard** (line 279-283) filters incorrectly:
```sql
SELECT id FROM jobs WHERE booking_id = ? AND deleted_at IS NULL
```
It checks for ANY job regardless of status. The old `completed` job still exists with `deleted_at IS NULL` → **blocks creation**.

The user sees the booking, is invited to act on it, but then gets told they can't.

### Why this will keep happening

Every cancelled-then-re-confirmed booking that previously had a small project will hit this. The old job is `completed` but not soft-deleted, so the guard fires forever.

## Fix

### File: `src/components/project/CreateProjectWizard.tsx` (lines 279-287)

**Option A (minimal):** Add the same status filter the triage list uses:

```typescript
const { data: existingJobs } = await supabase
  .from('jobs')
  .select('id')
  .eq('booking_id', bookingId)
  .not('status', 'in', '("completed","cancelled")')
  .is('deleted_at', null);
```

This makes the guard consistent: completed/cancelled jobs don't block. But the old job lingers in the DB.

**Option B (clean):** Remove the job guard entirely and instead soft-delete any existing completed/cancelled job when creating the new project:

```typescript
// Retire old completed/cancelled jobs for this booking
await supabase
  .from('jobs')
  .update({ deleted_at: new Date().toISOString() })
  .eq('booking_id', bookingId)
  .in('status', ['completed', 'cancelled']);
```

This cleans up properly — old deprecated jobs get retired, the new medium project takes over.

### Recommendation

**Option B** — it cleans up the data and prevents the old job from confusing any future queries. The guard for active jobs (planned/in-progress) stays intact via the project-exists check that already exists.

### What stays unchanged
- `import-bookings` cancellation flow (sets job to `completed`) — correct
- `import-bookings` re-confirmation flow (skips flag preservation) — correct
- `IncomingBookingsList` triage filter — correct
- `createJobFromBooking` reverse guard (blocks if project exists) — correct
- Soft-delete/audit infrastructure — used, not changed

