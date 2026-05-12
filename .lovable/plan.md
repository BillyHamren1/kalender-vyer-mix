## Problem

"Swedish game fair"-blocken på 2026-05-12 visas som grå **ARBETE** i Gantt-vyn (`/staff-management/time-reports`), men i personalkalendern visas samma datum som **rig** (ljusgrön).

### Rotorsak

`StaffTimeReports.tsx` bygger `bookingPhaseByDate` genom att läsa `bookings.rigdaydate / eventdate / rigdowndate`:

```ts
.from('bookings')
.select('id, rigdaydate, eventdate, rigdowndate')
.or(`rigdaydate.eq.${dateStr},eventdate.eq.${dateStr},rigdowndate.eq.${dateStr}`);
```

Men för det stora projektet "Swedish game fair" (large_project `f11cd5b3…`) säger varje syskonbokning `rigdaydate = 2026-05-25`. Trots det finns ett **calendar_event** den 2026-05-12 med `event_type = 'rig'` (verifierat i DB: booking `LOGOSOL AB`, team-1, 08:00–18:00). Det är detta event som personalkalendern och mobilen visar som "rig idag" — det är **förrigg** som lagts in direkt i kalendern utan att uppdatera bookings-datumkolumnerna.

Eftersom phasen inte hittas i bookings-tabellen faller `mapReportCandidateKind` tillbaka på `'work'` → grå.

Dessutom: även om vi hittade phasen så skulle nuvarande check bara träffa `targetType === 'booking'`. För stora projekt har candidate-blocket sannolikt `targetType === 'large_project'` (eller `'project'`) och `targetId = large_project_id`, vilket aldrig matchar en `bookings.id`-keyed map.

## Lösning

Personalkalendern ÄR sanningen för fas-visualisering — så Gantt-vyn ska härleda phase från `calendar_events.event_type` på det valda datumet, inte från bookings-datumkolumnerna.

### Steg

1. **Ersätt phase-queryn i `src/pages/StaffTimeReports.tsx` (rad 1739–1757).**
   Läs `calendar_events` för dagen istället:
   ```sql
   select id, booking_id, event_type, start_time
   from calendar_events
   where start_time::date = :dateStr
     and event_type in ('rig','event','rigdown')
   ```
   Bygg två maps:
   - `bookingPhaseByDate: Record<bookingId, 'rig'|'event'|'rigdown'>` — direkt från event_type.
   - `largeProjectPhaseByDate: Record<largeProjectId, 'rig'|'event'|'rigdown'>` — slå upp `bookings.large_project_id` för alla träffade booking_id, prioritera rig > rigdown > event om flera syskonbokningar har olika event_type samma dag.

   Behåll prio rig > rigdown > event vid flera matches per booking.

2. **Skicka båda mapparna till `StaffGanttView`** (`src/components/staff/StaffGanttView.tsx`).
   Lägg till `largeProjectPhaseByDate` i props, gänga ner till `blocksFromStaff` och `mapReportCandidateKind`.

3. **Uppdatera `mapReportCandidateKind` (rad 184–198):**
   ```ts
   if (b.targetType === 'booking' && b.targetId) {
     const phase = bookingPhaseByDate?.[b.targetId];
     if (phase) return phase === 'event' ? 'work' : phase;
   }
   if ((b.targetType === 'large_project' || b.targetType === 'project') && b.targetId) {
     const phase = largeProjectPhaseByDate?.[b.targetId];
     if (phase) return phase === 'event' ? 'work' : phase;
   }
   ```
   Behåll heuristik (`detectPhase`) som sista fallback.

4. **Test (vitest):** lägg till en testfil `src/test/staffGanttView.phaseColor.test.ts` med två fall:
   - Booking-block där `bookingPhaseByDate[id] = 'rig'` → `mapReportCandidateKind` returnerar `'rig'`.
   - Large-project-block där `largeProjectPhaseByDate[id] = 'rig'` → returnerar `'rig'`.
   - Block utan phase → `'work'`.

   Eftersom `mapReportCandidateKind` är intern, exportera den (eller wrap-funktionen) eller flytta logiken till `src/lib/staff/ganttPhaseColor.ts` och importera den i komponenten — föredra extraktion för testbarhet och för att hålla komponentfilen liten (memory: file-size).

5. **Verifiera i preview** på `/staff-management/time-reports` 2026-05-12: "Swedish game fair"-blocken ska bli ljusgröna (rig) istället för grå.

### Filer som påverkas

- `src/pages/StaffTimeReports.tsx` — ny phase-query mot calendar_events + ny map.
- `src/components/staff/StaffGanttView.tsx` — ny prop, utökad phase-lookup.
- `src/lib/staff/ganttPhaseColor.ts` (ny) — extraherad ren funktion.
- `src/test/staffGanttView.phaseColor.test.ts` (ny) — vitest.

### Vad som INTE ändras

- Inga schemaändringar.
- KIND_STYLE-färgerna rörs inte (lila/ljusgrön/ljusröd kvar).
- Time engine och buildReportCandidateBlocks rörs inte — det här är ren UI-färgkodning.
- bookings.rigdaydate-kolumnen behålls som auktoritativ för planerings-API:t; vi använder den bara inte längre för Gantt-färgning.
