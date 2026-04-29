---
name: Planning Calendar Lager Column
description: Planeringskalenderns "Lager"-kolumn (legacy id 'transport') = brygga till lagerkalendern. Internt Lagerprojekt 07–16, staff_assignments speglas till warehouse availability.
type: feature
---

## Planeringskalenderns Lager-kolumn

Kolumnen i planeringskalendern (`/calendar`) som tidigare hette "Transporter" heter nu **"Lager"**.
Kolumn-id är fortfarande `'transport'` (för bakåtkompatibilitet med staff_assignments, transport_assignments, färgschema).

### Beteende
- **Internt Lagerprojekt** (`projects.is_internal = true`) renderas som virtuella read-only event 07:00–16:00 varje dag i kolumnen via `useInternalLagerCalendarEvents`. Inga rader skapas i `calendar_events`.
- Personal som dras in i Lager-kolumnen i planeringskalendern (`staff_assignments.team_id = 'transport'`) **syns automatiskt som tillgänglig i lagerkalendern** (`/warehouse/calendar`) samma datum, utan att man behöver "Aktivera personal" via `WarehouseStaffActivationCard`.

### Implementation
- `src/hooks/useInternalLagerCalendarEvents.ts` — virtuella 07–16 events.
- `useWarehouseAvailableStaff(date, view)` i `useWarehouseStaffActivations.ts` — union av permanenta/temporära aktiveringar + `staff_assignments.team_id='transport'` för intervallet, med realtime på `staff_assignments`.
- `WarehouseCalendarPage` använder `useWarehouseAvailableStaff` istället för `useWarehouseStaffActivations` för att avgöra `activeStaffIds`.
- `useWarehouseStaffTimeline` + `useWarehouseStaffScheduleOverview` inkluderar `team_id='transport'` så Lager-passet syns i tidslinjen som ett 07–16 lagerpass.

### Vad som INTE ändras
- Kolumn-id förblir `'transport'`. Byt aldrig.
- Lagerkalenderns egna kolumner (`lager-1`..`lager-N`) påverkas inte.
- Inga schemamigrationer — vi återanvänder `staff_assignments` och `projects.is_internal`.
