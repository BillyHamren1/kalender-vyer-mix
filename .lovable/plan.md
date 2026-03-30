

## Show Large Project Name & Consolidate Events in Calendar

### Problem
When multiple bookings are linked to a large project (stort projekt), each booking creates separate calendar events showing individual booking titles. The user wants:
1. Show the **project name** instead of individual booking names
2. Show only **one event per large project** (not one per booking)

### Solution
Modify `useRealTimeCalendarEvents` to detect bookings belonging to the same large project and consolidate their calendar events.

### Changes

**1. `src/hooks/useRealTimeCalendarEvents.tsx` — batch-fetch large project names & consolidate events**

In the `loadEvents` function, after fetching bookings:
- Add `large_project_id` to the booking select query
- Collect all unique `large_project_id` values and batch-fetch large project names from `large_projects` table
- After enhancing events, add a consolidation step:
  - Group events by `large_project_id + event_type + source_date`
  - For events sharing the same large project, keep only one representative event per group
  - Override its `title` with the large project name
  - Store original booking IDs in `extendedProps` for reference
  - Tag with `extendedProps.isLargeProject = true` and `extendedProps.largeProjectId`

**2. `src/components/Calendar/CustomEvent.tsx` — display project name**

- When `event.extendedProps?.isLargeProject` is true, show a "PROJEKT" badge or indicator
- The title already comes from the consolidated event, so `event.title` will show the project name automatically

### Consolidation Logic (pseudo-code)
```text
For each enhanced event:
  → look up booking's large_project_id
  → if null → keep as-is
  → if set → group by (large_project_id, event_type, source_date)
     → keep first event in group, discard rest
     → set title = large project name
     → set extendedProps.isLargeProject = true
```

### Files to modify
- `src/hooks/useRealTimeCalendarEvents.tsx` (main logic)
- `src/components/Calendar/CustomEvent.tsx` (optional visual indicator)

