## Mål

`calendar_events` blir den **enda interna sanningen** för rig/event/rigDown-dagar för alla projekt-vyer. `projects.<phase>date` slutar läsas av UI. **Personalkalendern, planeringskalendern och `import-bookings` rörs inte.**

## Säkerhetsprinciper (icke-förhandlingsbara)

1. **Inga UPDATE/DELETE på befintliga `calendar_events`-rader** i migreringen. Migreringen är **additiv only** — skriver bara nya rader för saknade dagar.
2. **Personalkalenderns läsväg är fryst** — låst med kontraktstest före första ändring:
   - `src/services/staffCalendarService.ts`
   - `src/services/plannerCalendarDerivation.ts`
   - `src/lib/staffCalendar/deriveStaffEvents.ts`
   - `src/services/eventService.ts` (write API som personalkalendern använder)
3. **`import-bookings` och `receive-booking` rörs inte alls.** Ingen ny logik där.
4. **Backup-tabell innan migrering**: `_backup_projects_phase_dates_20260515` (full kopia av `projects.id, rigdaydate, eventdate, rigdowndate, updated_at`).
5. **Dry-run-rapport innan migrering körs** — listar alla projekt där `projects.<phase>date` skulle leda till en ny `calendar_events`-rad. Användaren godkänner siffran innan INSERT.
6. **`projects.<phase>date`-kolumnerna droppas INTE** i denna omgång. De görs bara obsoleta som läskälla. Drop sker i en framtida städ-migrering.

## Steg

### 1. Frys personalkalenderns kontrakt (ren testfil, ingen prod-ändring)
Ny `src/test/personalkalenderUntouched.contract.test.ts`:
- Snapshot av exporterade funktionssignaturer från staffCalendarService, plannerCalendarDerivation, deriveStaffEvents, eventService.
- Snapshot av SELECT-fälten dessa hämtar från `calendar_events`.
- Asserta att inga `projects.rigdaydate`-references injiceras i dessa filer.

### 2. Inventarisera läsare av `projects.<phase>date`
Read-only sweep, dokumenterad i `.lovable/phase-date-readers.md`:
- Filtrera till **UI-läsare i projekt-/dashboard-vyer** (de som ska migreras till `useBookingPhaseDays`).
- Markera **icke-UI-läsare** (export-functions, sync-reconciliation, planning/economy services) — dessa får ligga kvar i denna omgång.

### 3. Backup + dry-run
- Migration A (ren `CREATE TABLE`): `_backup_projects_phase_dates_20260515` med snapshot.
- Edge function `dry-run-phase-date-consolidation` (read-only) som returnerar:
  ```
  { projectsScanned, divergencesFound, eventsToInsert, examples: [...10] }
  ```
  För varje projekt: jämför `projects.<phase>date` mot existerande `calendar_events` för dess `booking_id`. Om ingen rad finns för (booking_id, phase, that_date) → kandidat för INSERT.

### 4. Additiv migration (efter användarens godkännande av dry-run-siffrorna)
Migration B: ren INSERT, en transaktion:
- För varje kandidat: `INSERT INTO calendar_events (booking_id, event_type, source_date, start_time, end_time, organization_id, ...) ON CONFLICT (booking_id, event_type, source_date, organization_id) DO NOTHING`.
- `start_time`/`end_time` defaultas till bookingens `<phase>_start_time`/`<phase>_end_time` (samma som `import-bookings` skulle skrivit).
- Loggas till `sync_audit_log` med `source='phase_date_consolidation_v1'`.
- **Ingen UPDATE, ingen DELETE.**

### 5. Verifieringstester (vitest + edge test)
- `src/test/bookingPhaseDaysParity.contract.test.ts`: för 10 sample-projekt, asserta att `useBookingPhaseDays(booking_id)` returnerar minst alla dagar som finns i `projects.<phase>date`.
- `src/test/personalkalenderUntouched.contract.test.ts` körs igen → måste vara grön.
- Edge test som räknar `calendar_events`-rader före/efter på sample bookings → diff matchar dry-run.

### 6. Stegvis UI-migrering (en fil i taget, varje med vitest)
Prioritet (UI som visar "fel" antal dagar idag):
1. `src/pages/project/ProjectLayout.tsx` (medium) → läs via `useBookingPhaseDays`, skriv via `syncBookingPhaseDays`.
2. `src/components/project/ProjectScheduleEditable.tsx` → läsa `phaseDays` från props.
3. `src/pages/project/ProjectViewPage.tsx`, dashboard-widgets, ekonomi-listor — efter att (1)+(2) är gröna.

`LargeProjectLayout.tsx` är redan korrekt (läser från `large_projects.*` enligt LP-policy) → ingen ändring.

### 7. Kvar för framtid (NOT i denna plan)
- Drop av `projects.<phase>date`-kolumner (separat städ-migrering när alla läsare är borta).
- Push tillbaka av extra-dagar till externa systemet via `planning-api-proxy` (eget arbete, kräver API-kontrakt).
- Rensning av icke-UI-läsare som listades i steg 2.

## Tekniska detaljer

**Identitetsnyckel för INSERT**: `(booking_id, event_type, source_date, organization_id)` — matchar befintligt unique constraint `uq_calendar_event_identity`. `ON CONFLICT DO NOTHING` garanterar att vi aldrig rör en rad personalkalendern redan känner till.

**Standalone-projekt** (utan `booking_id`): hoppas över i denna migration. De använder redan `projectCalendarService` med `booking_id='project-<uuid>'` och har egna calendar_events. UI-migreringen i steg 6 fallback:ar till `projects.<phase>date` när inget `booking_id` finns.

**Time-fält**: när `bookings.<phase>_start_time` saknas defaultas till `08:00:00` (samma defaults som `import-bookings` använder idag — speglas exakt).

**Rollback-plan**: backup-tabellen + sync_audit_log innebär att vi kan köra `DELETE FROM calendar_events WHERE id IN (SELECT created_event_id FROM sync_audit_log WHERE source='phase_date_consolidation_v1')` om något gått fel. Eftersom migreringen bara INSERT:ar är detta garanterat säkert.

## Vad jag behöver godkänt innan jag börjar

1. OK att skapa backup-tabell + dry-run edge function (steg 1–3, ingen data ändras).
2. Du tittar på dry-run-rapporten innan steg 4 körs.
3. UI-migreringen i steg 6 sker en fil i taget med din review mellan varje.
