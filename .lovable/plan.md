

## Problem
1. **Fel namn i team-väljaren**: `CustomEvent.tsx` använder `loadResourcesFromStorage()` (planeringsteam: Team 1–10 + Live) även för warehouse-händelser. Den ska använda warehouse-resurserna (Lager 1–10 + Transport).
2. **Team-byte fungerar inte**: I `MoveEventDateDialog.handleMove` uppdateras endast `start_time`/`end_time` i `warehouse_calendar_events` — `resourceId` (kolumn `resource_id`) skrivs aldrig till databasen för warehouse-händelser.

## Lösning

### Fil 1: `src/components/Calendar/CustomEvent.tsx`
- Importera `useWarehouseResources` från `@/hooks/useWarehouseResources`.
- Härled `availableResources` baserat på om händelsen är warehouse (`isWarehouseEvent`):
  - Warehouse → `teamResources` från `useWarehouseResources()` (Lager 1–10, Transport).
  - Annars → behåll `loadResourcesFromStorage()` (Team 1–10).
- Filtrera bort pseudo-resurser som inte ska vara giltiga drop-targets (t.ex. `warehouse-event` om det är "Transport"-raden, behåll lagerteam + transport).

### Fil 2: `src/components/Calendar/MoveEventDateDialog.tsx`
- I warehouse-grenen (`isWarehouseEvent`): inkludera `resource_id: selectedResourceId` i update-payload när användaren har valt ett annat team.
- Uppdatera även den optimistiska UI-uppdateringen (det görs redan via `selectedResourceId !== event.resourceId`, men kontrollera att raden faktiskt skriver det nya id:t på warehouse-events).
- Säkerställ att toast-meddelandet "→ {teamName}" plockar rätt namn från `resources`-listan (kommer fungera när rätt resurser skickas in).

## Tekniska detaljer
- Tabellen `warehouse_calendar_events` har kolumnen `resource_id` (snake_case). Update-payloaden får alltså:
  ```ts
  { start_time, end_time, resource_id: selectedResourceId, manually_adjusted: true, has_source_changes: false }
  ```
  endast om `selectedResourceId && selectedResourceId !== event.resourceId`.
- `useWarehouseResources` exporterar `teamResources` redan sorterad (lager-1…N, transport, warehouse-event sist). Vi använder den listan rakt av i selecten.

## Resultat
- Dialogen "Flytta eller kopiera händelse" i warehouse-kalendern visar **Lager 1, Lager 2, …, Transport** istället för Team 1, Team 2, …, Live.
- Att välja ett annat lagerteam och klicka "Flytta" sparar nu det nya `resource_id` i `warehouse_calendar_events` och händelsen flyttas korrekt mellan lagerkolumnerna.

