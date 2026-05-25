# Återställ Kalender-tabben i stora projekt till personalkalenderns motor

## Problem

I `LargeEstablishmentPage` renderar `Kalender`-tabben den nybyggda `LargeProjectBookingPlannerCalendar` — en egen rad-per-personal-tabell. Den har varken samma utseende, logik eller funktioner som personalkalendern.

Vi har redan en komponent som **är** personalkalendern fast filtrerad på projektets dagar: `src/components/project/ProjectCalendarView.tsx`. Den använder samma `CustomCalendar`, samma `useRealTimeCalendarEvents`, samma team-kolumner, samma drag-and-drop, samma +-knapp som `/personalkalendern` — bara med `daysOverride` så att enbart projektets rig/event/rigDown-dagar visas sida vid sida.

## Ändring

**Endast UI-koppling. Ingen ny logik, ingen DB.**

`src/pages/project/LargeEstablishmentPage.tsx`:

1. Ta bort importen av `LargeProjectBookingPlannerCalendar`.
2. Importera istället `ProjectCalendarView` från `@/components/project/ProjectCalendarView`.
3. I `pageMode === "calendar"`-grenen: rendera `<ProjectCalendarView projectId={project.id} isLargeProject />` istället för planner-kalendern. Behåll Card-ramen och rubriken "Bokningsplanering i projektet" om vi vill, eller släng den helt så att det blir 1:1 personalkalendern — föreslår att vi tar bort wrappen så att vyn är identisk.

## Vad som INTE rörs

- `Planera`-tabben (`pageMode === "plan"`) — fortsätter använda `LargeProjectBookingPlannerCalendar`/dnd-flödet som idag.
- `Excel-vy`-tabben — oförändrad.
- `LargeProjectBookingPlannerCalendar.tsx` finns kvar för Planera-tabben; ingen kod tas bort.
- Inga ändringar i `personalkalendern`, `CustomCalendar`, hooks eller DB.
- Migrationen från förra steget (`large_project_booking_plan_items`) lämnas orörd; den används av Planera-tabben.

## Resultat

`Kalender`-tabben i stora projekt visar exakt personalkalenderns kalender, fast bara projektets rig/event/rigDown-dagar — med samma team-kolumner, samma drag-and-drop, samma utseende, samma realtidsuppdatering. `Planera`-tabben behåller den nya planner-vyn.
