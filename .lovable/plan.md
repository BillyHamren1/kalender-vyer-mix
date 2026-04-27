## Plan

I will replace the current fragmented staff-calendar logic with one deterministic source of truth so personal calendars stop dropping jobs like Skolfest/Tiomila.

### What I found
- There are currently multiple competing calendar pipelines:
  - `src/services/staffCalendarService.ts` has newer large-project consolidation + fallback logic.
  - `supabase/functions/staff-management/index.ts` still uses an older per-team/per-day lookup against `calendar_events` only.
  - `mobile-app-api` overview also reads raw `calendar_events` only.
- `import-bookings` is the single writer for `calendar_events`, but it intentionally no longer persists `event` days to `calendar_events` after the Live column removal.
- Because some views still assume `calendar_events` contains the full job schedule, jobs can appear/disappear when backend syncs briefly remove or omit rows, especially for large projects and project-wide assignments.

### Implementation
1. Build a shared staff-calendar derivation layer
- Create one canonical function that derives staff-visible job days from:
  - `booking_staff_assignments`
  - `large_project_staff`
  - `large_projects.start_date[] / event_date[] / end_date[]`
  - `large_project_bookings`
  - `bookings`
  - `calendar_events` only as a timing/team-detail source when present
- Make this function produce a stable result even if some `calendar_events` rows are temporarily missing.
- Use `source_date` / project date arrays as the identity for a visible staff day, not transient row presence.

2. Stop relying on raw `calendar_events` as the only visibility source
- Refactor `src/services/staffCalendarService.ts` so visibility is assignment/date-driven first, event-row-driven second.
- Ensure large projects always render from project-owned dates, with optional enrichment from linked calendar rows.
- Ensure single bookings still render when assignments exist, even if a sync pass has not yet recreated a row.

3. Unify the server-side APIs with the same logic
- Update `supabase/functions/staff-management/index.ts` so `get_staff_calendar_events` uses the same canonical derivation rules as the web UI.
- Update `mobile-app-api` overview calendar endpoint so planner/mobile overview uses the same stable event set instead of raw `calendar_events`.
- Remove the current mismatch where different screens compute different answers.

4. Normalize identities and consolidation rules
- Use stable grouping keys for staff-visible rows:
  - normal booking: `staff_id + booking_id + source_date + phase`
  - large project: `staff_id + large_project_id + source_date + phase`
- Consolidate large-project sub-bookings into one row per project/day/phase for each staff member.
- Preserve explicit times from `calendar_events` when available; otherwise use deterministic fallback windows.

5. Harden against temporary sync gaps
- Add guards so transient empty or incomplete backend payloads do not blank the staff calendar.
- Prefer last-known valid derived row for the same identity within the fetch pass instead of treating missing enrichment as deletion.
- Keep rendering project date-array rows even when linked booking event rows are incomplete.

6. Verify with the failing scenarios
- Tiomila: all project days must render, not only Wednesday.
- Skolfest 27:e: job must remain visible and not blink in/out.
- Large projects must stay visible in both personal calendar and planner/mobile overview.
- Sequential jobs on the same team/day must still keep correct ordering logic after the refactor.

## Technical details
- Files likely to change:
  - `src/services/staffCalendarService.ts`
  - `supabase/functions/staff-management/index.ts`
  - `supabase/functions/mobile-app-api/index.ts`
  - possibly a new shared calendar-derivation utility to avoid logic drift
- Key architectural rule:
  - `import-bookings` remains the only writer to `calendar_events`
  - staff visibility logic becomes assignment/date-driven and tolerant of partial event sync state
- Goal state:
```text
Assignments + project date arrays
        │
        ├─ determine whether a staff-visible day exists
        │
calendar_events (optional enrichment)
        │
        ├─ provide explicit team/start/end/details when available
        │
Canonical derived staff calendar rows
        │
        ├─ web staff calendar
        ├─ staff-management edge function
        └─ mobile/planner overview
```

## Expected outcome
After this rewrite, the staff calendar will no longer depend on fragile moment-to-moment `calendar_events` presence to decide whether a job exists. Jobs should remain visible consistently, especially for large projects and multi-day assignments, while still showing real times when synced calendar rows are available.