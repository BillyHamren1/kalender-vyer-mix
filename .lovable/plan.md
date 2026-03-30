

## Etableringsschema (Gantt) for Stora Projekt + Personalassignment

### Problem
Large projects currently show only a booking list overview on the Establishment tab. They lack the real Gantt chart that medium projects have, and there's no way to assign staff to individual tasks/activities.

### Solution

#### 1. Database: Add `large_project_id` to `establishment_tasks`
Add an optional `large_project_id` column to `establishment_tasks` so tasks can belong directly to a large project (not just a booking). Make `booking_id` nullable since large project tasks won't have a specific booking.

```sql
ALTER TABLE establishment_tasks 
  ADD COLUMN large_project_id uuid REFERENCES large_projects(id) ON DELETE CASCADE,
  ALTER COLUMN booking_id DROP NOT NULL;

-- Add constraint: must have either booking_id or large_project_id
ALTER TABLE establishment_tasks 
  ADD CONSTRAINT establishment_tasks_parent_check 
  CHECK (booking_id IS NOT NULL OR large_project_id IS NOT NULL);
```

#### 2. Service layer: Extend `establishmentTaskService.ts`
- Add `fetchEstablishmentTasksByProject(largeProjectId)` to fetch tasks by `large_project_id`
- Add `generateDefaultTasksForProject(largeProjectId, startDate, endDate)` for auto-generating defaults
- Update `createEstablishmentTask` to accept optional `large_project_id` instead of `booking_id`

#### 3. Replace `LargeEstablishmentPage.tsx` with real Gantt
Replace the current booking list view with a layout matching medium projects:
- **Tabs**: Etablering / Avetablering (same as medium)
- **Gantt chart**: Reuse or adapt `EstablishmentGanttChart` to accept `largeProjectId` as an alternative to `bookingId`
- **Task detail sheet**: Same `EstablishmentTaskDetailSheet` with staff assignment
- Keep the booking overview summary cards at the top for context

#### 4. Staff assignment on tasks
- Update `EstablishmentTaskDetailSheet` to accept an optional `staffPool` prop
- For large projects, fetch staff assigned to the project's bookings via `booking_staff_assignments` joined through `large_project_bookings`
- The staff dropdown in the detail sheet shows only project-assigned staff (not all staff)
- Both the main task and subtasks can be assigned to staff from this pool

#### 5. Adapt `EstablishmentGanttChart` for dual use
Add optional `largeProjectId` prop alongside existing `bookingId`:
- When `largeProjectId` is provided, fetch tasks by project instead of booking
- Dates derived from project's `start_date`/`end_date` or from earliest/latest booking dates
- `AddEstablishmentTaskDialog` updated to work with `largeProjectId`

### Files to edit
- **Migration**: Add `large_project_id` column, make `booking_id` nullable
- `src/services/establishmentTaskService.ts` — project-level fetch/create functions
- `src/components/project/EstablishmentGanttChart.tsx` — accept `largeProjectId` prop
- `src/components/project/AddEstablishmentTaskDialog.tsx` — support `largeProjectId`
- `src/components/project/EstablishmentTaskDetailSheet.tsx` — accept `staffPool` prop for filtered staff list
- `src/pages/project/LargeEstablishmentPage.tsx` — replace with Gantt-based UI with tabs
- `src/components/project/DeestablishmentGanttChart.tsx` — accept `largeProjectId` prop

### Staff assignment flow
```text
Large project has N bookings
  → Each booking has staff via booking_staff_assignments
  → Fetch unique staff across all bookings
  → Show these staff in task/subtask assignment dropdowns
  → assigned_to on establishment_tasks references staff_members(id)
```

