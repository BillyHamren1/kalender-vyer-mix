# Projektkalender: 5 team som default + "+" för fler, samt fix av "Inga planerade dagar"

Två problem ska lösas i `src/components/project/ProjectCalendarView.tsx` (+ ett i `src/hooks/useProjectCalendarDays.ts`). Inga ändringar i personalkalendern, `CustomCalendar` eller DB.

## 1) Default = 5 team + Aktiviteter, övriga bakom "+"

Idag tvingar `PROJECT_REQUIRED_TEAMS` in `team-1..4 + transport + team-tasks` och `defaultVisibleTeams` lägger på **alla** team som finns i organisationen. Det gör att en projektdag visar 8–10 team-kolumner och måste komprimeras.

Ändring i `ProjectCalendarView.tsx`:

- `PROJECT_REQUIRED_TEAMS` → `['team-tasks']` (Aktiviteter-kolumnen är alltid där så taskdragg fungerar; alla andra team får togglas fritt).
- `defaultVisibleTeams` → första **5** "vanliga" team i deterministisk ordning (team-1..team-5 om de finns, annars de fem första i `teamResources` exkl. `team-11` och `team-tasks`) **+** `team-tasks`. Inga fler.
- `getVisibleTeamsForDay`: när användaren inte rört dagen → returnera default-listan. När användaren togglat → returnera deras val, men säkerställ att required-listan alltid är med.
- `handleToggleTeamForDay`: oförändrad logik, men eftersom required nu bara är `team-tasks` kan användaren ta bort vilket team-1..N som helst och lägga tillbaka via `+`-knappen som `CustomCalendar`/`TeamVisibilityControl` redan renderar per dag.

Ingen ny komponent, ingen ny prop till `CustomCalendar`. "+" finns redan i headern på varje dagkort (`TeamVisibilityControl` compact-mode) och styrs av `allTeams` + `getVisibleTeamsForDay` + `onToggleTeamForDay` som redan skickas in.

## 2) Ingen intern scroll per dag

Med 5 team + Aktiviteter (≈6 kolumner) ryms allt i `min-width: 520px` på dagkortet utan att klämmas ihop. Den existerande layouten (`.weekly-day-card .day-card { overflow-x: visible }`) har redan ingen intern horisontell scroll. När/om användaren klickar `+` och lägger till många team så växer dagkortet i bredd och hela `weekly-horizontal-grid` får sin yttre horisontella scroll (som idag) — det är vad användaren bett om: "alla valda team visas hela tiden", aldrig intern scroll inuti en dag.

För att garantera detta även vid extrem bredd: i `ProjectCalendarView.css` lägga till en regel som tvingar bort eventuell `overflow-x: auto` på `.project-weekly-day-card .day-card` och ger dagkortet `min-width: auto` (det kan växa hur brett som helst utan att klippa). `max-width: none` finns redan.

## 3) Fix för "Inga planerade dagar" på LP utan calendar_events

(Från förra meddelandet — samma vy.) `useProjectCalendarDays` läser bara `calendar_events`. För LP där `calendar_events` saknas men `bookings.rigdaydate/eventdate/rigdowndate` finns blir resultatet 0 dagar.

Ändring i `useProjectCalendarDays.ts`:

- Efter `calendar_events`-hämtningen: hämta `bookings` (`id, rigdaydate, eventdate, rigdowndate`) för `scope.bookingIds`.
- Bygg **syntetiska** `ProjectCalendarEvent`-rader för datum som inte redan finns i de riktiga raderna:
  - `rigdaydate` → `event_type='rig'`
  - `eventdate` → `event_type='event'`
  - `rigdowndate` → `event_type='rigDown'`
  - `id`: deterministiskt `synthetic-<booking_id>-<phase>-<date>`
  - `start_time/end_time`: `<date>T00:00:00Z` (används bara för datumutdrag i `phaseByDay`)
  - `resource_id: null`, `title: null`
- Returnera unionen. Personalkalenderns `useRealTimeCalendarEvents` gör samma "fallback från bookings" så `filteredEvents` i `ProjectCalendarView` får sina event från den ändå.

Inga writes, ingen DB-migration, inga ändringar i personalkalendern.

## Verifiering

- Lägg till/uppdatera vitest-test för `useProjectCalendarDays` som verifierar att rigdaydate/rigdowndate/eventdate på bookings genererar syntetiska events när `calendar_events` är tom.
- Lägg till test för `ProjectCalendarView.defaultVisibleTeams`-logiken (pure helper extraheras vid behov) som verifierar:
  - Default = 5 team-1..5 + team-tasks
  - Toggle bort team-3 ger 4 team + team-tasks
  - Toggle in team-7 ger 6 team + team-tasks
  - Required-listan innehåller bara `team-tasks`
- Manuell smoke: navigera till `/large-project/<id>/establishment` → Kalender. Innan: ev. 8+ team eller "Inga planerade dagar". Efter: 5 team + Aktiviteter, plus-knapp lägger till fler, projektdagar syns även utan calendar_events.

## Vad som INTE rörs

- `CustomCalendar`, `TeamVisibilityControl`, `useRealTimeCalendarEvents`, personalkalenderns kod, DB, edge functions.
- `LargeProjectBookingPlannerCalendar` (Planera-tabben), Excel-vy, övriga projektytor.
