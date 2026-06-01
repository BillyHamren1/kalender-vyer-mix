# Bilar i personalkalenderns team-rutor

Visa tilldelade egna fordon (från Transportplanering → Fordon & Partners → Egna fordon) i personalkalenderns team-header, en tilldelning per team + dag, klickbar via en lastbilsikon bredvid "+".

## Datamodell (ny tabell)

Per-dag-tilldelning, exakt samma logik som personal (men separat tabell — påverkar inte `staff_assignments`).

```sql
CREATE TABLE public.team_vehicle_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  team_id         text NOT NULL,        -- t.ex. "team-1" (matchar Resource.id)
  date            date NOT NULL,
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  UNIQUE (organization_id, team_id, date, vehicle_id)
);
```

- RESTRICTIVE RLS på `organization_id` (samma mönster som `vehicles`).
- GRANT till `authenticated` + `service_role`.
- Index på `(organization_id, date)` och `(vehicle_id, date)` för snabb realtidsuppslagning.
- Realtime publication aktiverad så ändringar speglas direkt i kalendern.

Ingen koppling till `staff_assignments`, inga ändringar i `vehicles`-tabellen, inga schemaändringar i `calendar_events`.

## Frontend

### Ny hook `useTeamVehicleAssignmentsForDay(date)`
- Returnerar `Map<teamId, Vehicle[]>` + `assign(teamId, vehicleId)` / `unassign(...)`.
- Filtrerar `vehicles` på `is_external = false` och `is_active = true` (= Egna fordon, aktiva).
- Lyssnar på `postgres_changes` för `team_vehicle_assignments` filtrerat på dagens datum → invaliderar.

### Ny komponent `TeamVehiclePickerPopover`
- Speglar `TeamStaffPickerPopover`: lista över egna aktiva fordon, kryssruta = tilldelad för dagen, klick togglar.
- Tom-state: "Inga egna fordon registrerade — lägg till under Transportplanering".

### `TimeGrid.tsx` (row 2 / team-header)
Två tillägg per team-cell (inom `team-header-content`, dolda när `plannerMode`):
1. **Lastbilsikon-knapp** (lucide `Truck`, samma höjd som `+`) **till vänster om** `+`-knappen. Klick öppnar `TeamVehiclePickerPopover` för det teamet.
   - Badge med antal när `vehicles.length > 0`.
2. **Bilrad ovanför `team-title`**: när teamet har 1 bil visas `Bil: <namn>`, vid flera `Bil1: <namn>, Bil2: <namn>, …`. Liten muted text, en rad, trunkeras med ellipsis, full lista i `title`-tooltip.

Layoutändringen håller sig inom `team-header-cell` — ingen ändring av grid/kolumnbredder. CSS-tillägg i `TimeGrid.css` (`.team-vehicle-line`, `.add-vehicle-button-header`).

### Realtime
React Query-key `['team-vehicles', orgId, isoDate]` invalideras via befintlig `realtime-event-driven-invalidation`-pipeline.

## Scope-avgränsningar
- Bilar visas bara på **personalkalendern** (CustomCalendar/TimeGrid). Warehouse-kalendern, mobilkalendern, projektkalendern och plannerMode (stora projekt) är orörda.
- Ingen koppling till GPS, time_reports, tidsregistrering eller transportbokningar — endast en visuell etikett + tilldelning per dag.
- Endast egna fordon (`is_external = false`). Transportbolag exkluderas.

## Tester (vitest)
- `useTeamVehicleAssignmentsForDay`: assign/unassign reducer + filtrering external/inactive.
- `TeamVehiclePickerPopover`: render tomt-state, render lista med kryss, toggle anropar mutation.
- `TimeGrid` smoke: när hook returnerar 2 fordon för team-1 → "Bil1: …, Bil2: …" syns i headern och Truck-knappen finns till vänster om `+`.

## Filer
- Migration: `team_vehicle_assignments` + RLS + GRANT + index + realtime.
- Ny: `src/hooks/useTeamVehicleAssignmentsForDay.ts`
- Ny: `src/components/Calendar/TeamVehiclePickerPopover.tsx`
- Ändras: `src/components/Calendar/TimeGrid.tsx`, `src/components/Calendar/TimeGrid.css`
- Tester: `src/test/teamVehicleAssignments.test.ts`, `src/test/teamVehiclePicker.test.tsx`
