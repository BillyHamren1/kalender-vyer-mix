

## Plan: Distribute warehouse events across Lager 1–N (round-robin)

### Problem
All warehouse calendar events are hardcoded to `resource_id: 'warehouse'` (the "Packning" column). Events should instead be distributed across Lager 1, Lager 2, Lager 3, etc. — using the same round-robin collision-avoidance logic as the planning calendar's team assignment.

### Approach
Apply round-robin + sequential scheduling at the **frontend mapping layer** (not in the DB sync service), so existing warehouse events get distributed across lager resources dynamically based on time overlap — identical logic to `findAvailableTeam` in `teamAvailability.ts`.

### Changes

**1. Create `src/utils/warehouseTeamAvailability.ts`**
- New utility mirroring `findAvailableTeam` but for `lager-1` through `lager-N` resources
- For each event: find the first lager resource with no time overlap on that day
- If all are busy, assign to the lager with the fewest events (round-robin)

**2. Update `src/pages/WarehouseCalendarPage.tsx`**
- In `mapWarehouseEventsToCalendarEvents`: instead of hardcoding `resourceId: 'warehouse'`, call the new warehouse team availability function to assign each event to a lager resource
- Process events chronologically so earlier events get assigned first
- Remove the static `warehouseResource` ("Packning" column) from the resources list since events will now live in lager columns

**3. Update `src/services/warehouseCalendarService.ts`** (optional/future)
- Optionally persist the computed `resource_id` to the DB so it's stable across reloads
- For now, frontend-only distribution is simpler and allows dynamic recalculation

### Technical Detail
The distribution algorithm:
1. Sort all warehouse events for the day by start time
2. For each event, iterate lager-1 → lager-N
3. Pick the first lager with no time overlap (event_start < existing_end && event_end > existing_start)
4. If all overlap, pick the lager with the fewest events (lowest number breaks ties)
5. Standard booking events (rig/event/rigdown from planning calendar) that also appear in the warehouse view should be considered when checking overlaps

