---
name: Unplanned Projects Staging
description: Nya projekt (medel + stort) hamnar i "Att planera"-container ovanför kalendern istället för auto-placering. Tider/team sätts i ProjectPlanningSheet, sedan flippas planning_status till 'planned'.
type: feature
---

## Modell
- `projects.planning_status` och `large_projects.planning_status` enum: `needs_planning` (default på nya rader) | `planned`.
- Migration satte alla befintliga projekt till `planned` — endast nya projekt går igenom det nya flödet.

## Backend
- `import-bookings`-reconcilern (`reconcileCalendarEvents`) har en early-return: om kopplat projekt eller large_project har `planning_status='needs_planning'` så materialiseras inga `calendar_events`.
- När användaren sparar i `ProjectPlanningSheet`:
  1. `addCalendarEvent` per dag/fas (rig + rigDown) × varje länkad bokning.
  2. `bookings.rig_*_time` / `rigdown_*_time` / `event_*_time` uppdateras.
  3. `planning_status` flippas till `planned`.

## Frontend
- `useUnplannedProjects()` (src/hooks): query + realtime på `projects` + `large_projects`.
- `UnplannedProjectsBanner` (src/components/Calendar): listan ovanför kalendern på `/calendar`.
- `ProjectPlanningSheet` (src/components/project): sheet med en rad per dag (datum, start, slut, team-dropdown). Toggle "Använd samma team för alla dagar".
- `MoveDayPopover` (src/components/Calendar): liten ⇄-knapp på event-kortet i kalendern. Två actions per måltea: "Denna dag" eller "Alla dagar". "Alla dagar" hämtar syskon via `large_project_id` och flyttar resource_id på alla calendar_events. Kallar `recompute_booking_staff_for_day` RPC efter flytt så BSA speglas.

## Constraints
- Personal följer aldrig med vid team-byte (per `calendar-team-model-v1`).
- `event`-fasen skrivs ej till `calendar_events` (per `live-column-removed-v1`); planeringssheet:en låter användaren sätta event-tider men de hamnar bara på bokningen.
- Mobil ser inget av detta — `UnplannedProjectsBanner` monteras bara desktop.
