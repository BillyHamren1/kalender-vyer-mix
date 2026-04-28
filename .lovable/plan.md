
# Enhetligt Gantt ⇄ Personalkalender (alla projekt)

## Mål
Ett och samma Gantt-schema för **alla projekt** (medel + stora, med eller utan koppling till booking). Gantt visar exakt samma fas-rader som personalkalendern och håller dem i synk åt båda hållen. "Live"-kolumnen är borttagen från personalkalendern (per [Live Column Removed](mem://features/planning/live-column-removed-v1)) — det betyder att Gantt visar **Rigg** och **Demontering** per dag (eventdagen filtreras bort i personalkalendern).

## Vad det ska se ut som
Tre "swimlanes" i Gantt — `Riggning`, `Event`, `Demontering` — och under varje swimlane en stapel per planerad dag med dynamisk text:

```text
Riggning      [ Rigg dag 1 ][ Rigg dag 2 ][ Rigg dag 3 ]
Event                                                      [ Event ]
Demontering                                                          [ Demont. dag 1 ][ Demont. dag 2 ]
```

- Varje stapel = en `calendar_events`-rad (en per dag/fas/syskon-booking).
- Texten "Rigg dag N" räknas från första rig-dagen i projektet.
- För stora projekt slås syskon-bookings samman per fas+datum (samma sannings­källa som [Phase Time Sync](mem://features/planning/phase-time-sync-v1) använder).
- Eventdagen visas som en grå/ljusblå milstolpe i Gantt men är icke-redigerbar där (eftersom den inte längre ligger i personalkalendern).

## Tvåvägssync — kontrakt

| Åtgärd                                            | Effekt                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Drag stapel i Gantt (annan dag)                   | Uppdaterar `start_time` + `end_time` på motsvarande `calendar_events`-rader                     |
| Resize stapel i Gantt                             | Uppdaterar tider på alla syskon i samma fas+datum via `timeSync.applyPhaseTime`                 |
| Lägg till dag i Gantt (klicka "+")                | Skapar nya `calendar_events` (rig/rigDown) + uppdaterar `bookings.<phase>_*_time/date`          |
| Ta bort dag i Gantt                               | Tar bort motsvarande `calendar_events`-rad (med bekräftelse)                                    |
| Drag/resize i personalkalendern                   | Realtime `postgres_changes` på `calendar_events` → Gantt re-renderar utan reload                |
| Tidsändring via "Phase Time Sync"-flödet          | Speglas direkt i Gantt (samma källa)                                                            |

Allt skrivande går genom **`eventService.updateCalendarEvent`** + **`src/services/timeSync.ts`** (befintlig single-writer för fas-tider). Inget nytt sync-lager — vi byter bara källa för Gantt-vyn.

## Arkitektur — en Gantt, tre call-sites

### Ny komponent
`src/components/project/UnifiedProjectGantt.tsx` (~250 rader)
- Tar `projectId` (UUID) + valfritt `bookingId` som indata.
- Hämtar `calendar_events` via befintlig `fetchEventsByBookingId` — för stora projekt loopas över alla syskon-bookings (`large_projects` → `bookings`).
- Grupperar events per fas (`event_type`) + datum → swimlanes.
- Renderar drag/resize via befintlig `react-day-picker`-style timeline (samma look som dagens `EstablishmentGanttChart`, så vi kan återanvända delar av dess CSS).
- Lyssnar på Supabase Realtime för `calendar_events` filtrerat på de aktuella `booking_id`s.
- Skriver via `eventService.updateCalendarEvent` + `timeSync.applyPhaseTime`.

### Hook
`src/hooks/useProjectGanttEvents.ts` (~120 rader)
- Resolver: tar `projectId` → returnerar lista av `bookingId`s (single eller multi för stora projekt) + standalone-fallback (`project-<uuid>` enligt `projectCalendarService`).
- React Query-key: `['project-gantt', projectId]`.
- Realtime-subscription registrerar på alla `booking_id`s och invalidaterar query.

### Ersätter
- `src/components/project/EstablishmentGanttChart.tsx` (906 rader) — **ersätts**. Det gamla planerings­läget med `establishment_tasks` blir kvar som **separat** "Checklista/uppgifter"-sektion under Gantt (eftersom det inte är tider, utan TODOs). Inga data raderas.
- `src/components/project/LargeProjectGanttChart.tsx` (179 rader) — **ersätts** av samma `UnifiedProjectGantt`.
- `src/components/project/ProjectGanttChart.tsx` (322 rader, deadline-baserad) — **tas bort** från projekt-flikarna. Den var en parallell vy som inte längre behövs när Gantt = kalendern.

### Call-sites som uppdateras
- `src/pages/project/EstablishmentPage.tsx` → använd `UnifiedProjectGantt`
- `src/pages/project/LargeEstablishmentPage.tsx` → använd `UnifiedProjectGantt`
- `src/pages/project/LargeProjectViewPage.tsx` → använd `UnifiedProjectGantt` (ersätter "Projektschema"-kortet)

## Tekniska detaljer

**Datakälla (single source):** `calendar_events` filtrerade på `booking_id IN (...projektets bookings...)`. För standalone-projekt: `booking_id = 'project-<uuid>'` (befintlig konvention från `projectCalendarService.ts`).

**Stora projekt — syskon-resolution:** Använd samma logik som `timeSync.ts` redan gör: hämta alla bookings under `large_project_id`, gruppera events per `(event_type, source_date)` och rendera *en* stapel per grupp. Klick → expanderar och visar vilka syskon-bookings som ingår.

**Dag-numrering:** "Rigg dag N" räknas på unika sorterade rig-datum i projektet (1-indexerat). Samma för Demontering. Event = ingen numrering (ofta 1 dag).

**Realtime:** En enda `supabase.channel('project-gantt-<projectId>')` med `postgres_changes`-filter `booking_id=in.(...)`. Auto-invalidate av React Query-key vid INSERT/UPDATE/DELETE. Följer [Realtime Event Invalidation](mem://infrastructure/realtime-event-driven-invalidation).

**Skrivvägen:**
- Drag/resize → `timeSync.applyPhaseTime(projectId, phase, date, startTime, endTime)` (sprider till alla syskon)
- Add day → `eventService.addCalendarEvent` + uppdatera `bookings.<phase>date` via `planning-api-proxy` om bookingbaserat, annars via `projectCalendarService` för standalone.
- Delete day → `eventService.deleteCalendarEvent` (med confirm-dialog).

**Eventdagen (icke-redigerbar i Gantt):** Visas som markör eftersom den inte längre ligger i personalkalendern (per memory). Klick → öppnar projekt­detaljer för att ändra eventdate.

**Filer som rörs:**
- ➕ `src/components/project/UnifiedProjectGantt.tsx`
- ➕ `src/hooks/useProjectGanttEvents.ts`
- ✏️ `src/pages/project/EstablishmentPage.tsx`
- ✏️ `src/pages/project/LargeEstablishmentPage.tsx`
- ✏️ `src/pages/project/LargeProjectViewPage.tsx`
- 🗑️ `src/components/project/EstablishmentGanttChart.tsx` (ersätts)
- 🗑️ `src/components/project/LargeProjectGanttChart.tsx` (ersätts)
- 🗑️ `src/components/project/ProjectGanttChart.tsx` (tas bort från projektvyn)
- ⚠️ `establishment_tasks` (DB) lämnas orörd — checklistan kan flyttas till en separat "Uppgifter"-sektion i samma flik om du vill, säg till.

**Memory som uppdateras efter implementation:** Ny memory `mem://features/projects/unified-gantt-calendar-sync-v1` som låser regeln "Ett Gantt = personalkalendern, gäller alla projekt".

## Frågor du redan svarat på
- ✅ Vilket Gantt: **båda** (medel + stora) — enhetligt.
- 🟡 Sync-riktning: Jag antar **båda riktningar** (drag i Gantt → kalender, drag i kalender → Gantt) eftersom det var det du beskrev ("tvåvägssync"). Säg till om du bara vill ha en riktning.
- 🟡 Dag-indelning: Jag antar **en stapel per dag och fas** med text "Rigg dag 1, dag 2…" eftersom det var ditt exempel. Säg till om du hellre vill ha en lång stapel som spänner alla dagar.

Godkänn så bygger jag.
