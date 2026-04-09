

## Plan: Separate Warehouse Calendar Resources from Staff Calendar

### Problem
The warehouse calendar reuses the same team resource IDs (`team-1`, `team-2`, etc.) from the staff calendar, just renaming them to "Lager 1", "Lager 2". This means booking events assigned to `team-1` in the staff calendar show up under "Lager 1" in the warehouse calendar. These should be **completely independent** systems.

### Solution
Give the warehouse calendar its own independent resource IDs (`lager-1`, `lager-2`, etc.) that are not coupled to the staff calendar's team resources.

### Changes

**1. Create `src/hooks/useWarehouseResources.tsx`**
- New hook that manages warehouse-specific resources with IDs like `lager-1`, `lager-2`, ..., `lager-10`, plus `Packning`
- Own localStorage key (`warehouseResources`) separate from the staff calendar
- Same add/remove/rename API as `useTeamResources` but for warehouse resources

**2. Update `src/pages/WarehouseCalendarPage.tsx`**
- Replace `useTeamResources()` with the new `useWarehouseResources()`
- Resources already have correct names (`Lager 1`, etc.) — remove the mapping logic
- Update default visible teams from `team-*` to `lager-*`
- Update all hardcoded `team-*` references in `getVisibleTeamsForDay` and `handleToggleTeamForDay`

**3. Update `src/hooks/useUnifiedStaffOperations.ts`**
- Ensure the warehouse variant (`'Lager'`) uses `lager-*` prefixed resource IDs for staff assignment storage, so warehouse staff assignments don't clash with staff calendar assignments

**4. Update warehouse event display**
- Calendar events from `useRealTimeCalendarEvents` (rig/event/rigDown) that have `resource_id: 'team-*'` should **not** be displayed in the warehouse calendar's `lager-*` columns
- Warehouse-specific events from `useWarehouseCalendarEvents` already use `resource_id: 'warehouse'` — this stays unchanged
- If warehouse events need to be assigned to specific lager columns, their `resource_id` should use `lager-*` IDs

### Result
- Staff calendar: `team-1` through `team-10` + `team-11` (Live)
- Warehouse calendar: `lager-1` through `lager-10` + `Packning`
- No shared resource IDs — events in one calendar never bleed into the other

