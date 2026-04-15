

## Plan: Add "Event" column to warehouse calendar

### Problem
After removing the "Packning" column, there's a blank column. The user wants this column renamed to "Event" and used to display rig/event/rigdown events stacked vertically in 3h blocks — identical to how the "Live" column (team-11) works in the planning calendar.

### Changes

**1. Add "Event" resource to `useWarehouseResources.tsx`**
- Add `{ id: 'warehouse-event', title: 'Event', eventColor: '#f59e0b' }` as a permanent resource
- Include it in the default visible teams alongside lager-1 through lager-4

**2. Update `distributeWarehouseEvents` in `warehouseTeamAvailability.ts`**
- Before round-robin distribution, separate events by type:
  - `rig`, `event`, `rigDown` → assigned to `warehouse-event` resource
  - `packing_start`, `packing_end`, etc. → distributed across lager-1…N as before
- For `warehouse-event` events: stack them in 3h blocks (08:00–11:00, 11:00–14:00, 14:00–17:00) per day, same sequential logic as team-11 in import-bookings

**3. Update `WarehouseCalendarPage.tsx`**
- Update default visible teams to include `warehouse-event`
- Update toggle logic to make `warehouse-event` non-hideable (like lager-1–4)
- Ensure the Event column events are read-only (already handled by `isEventReadOnly`)

### Result
- Lager 1–4: packing events distributed via round-robin
- Event column: rig/event/rigdown stacked vertically in 3h blocks, matching the Live column behavior

