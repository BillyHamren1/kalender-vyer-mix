## Vad är trasigt

Verifierat mot databasen:

- **Swedish game fair** (large_project `f11cd5b3…`, projektnummer `260204-Projekt01`) har **64 sub‑bokningar**.
- Alla 64 har `bookings.large_project_id` korrekt satt OCH ligger i `large_project_bookings`. Länkningen finns alltså i datan.
- I `calendar_events` finns det dock **calendar_events för i princip alla 64 bokningar samtidigt** (33–37 bokningar per dag på team‑1, plus 2–3 på team‑2..team‑5). T.ex. `2026‑05‑15`: 35 rig‑rader på team‑1 för 35 olika bookings — ska vara 1 rep‑rad per (projekt, fas, dag, team).
- Det är resterna från det gamla läget då varje sub‑booking skrev egna calendar_events. Ny `import-bookings`-reconciler skriver bara via "rep"-bokningen (lägsta uuid:t = `018af6ab…`) och raderar non‑rep‑rader, MEN bara när den kallas för just den booking. De gamla bokningarna re‑importeras inte, så raderingen sker aldrig → de ligger kvar.

Konsekvens:
1. Visuellt fortfarande "alla gamefair‑bokningar var för sig" (en hög per dag).
2. Tiles visar `bookingNumber`/`title=client` (rad 138 i `plannerCalendarDerivation.ts`) eftersom `mapRealRowToCalendarEvent` används som fallback — men den vägen ska aldrig nås för LP‑bokningar. Den nås just nu indirekt: efter konsolidering finns rep‑raden, men **non‑rep raderna grupperas också** av `buildPlannerCalendarEvents` (de har projectId via membership) → en enda tile per (projekt, fas, dag, team), däremot ser man hög för team‑1 vs team‑2..5 (vilket är korrekt). Det som ser "fult" ut är att team‑1 t.ex. har 35 rader i samma grupp men det syns som EN tile. Däremot: när man gör drag/edit får man alla 35 underlying booking_ids vilket gör interaktioner mässiga och eventuellt skapar duplicates igen.
3. **Projektnummer saknas på tiles**: `eventService.ts` rad 136 selectar `id,name,address,start_date,event_date,end_date,deleted_at` — `project_number` är inte med, så `plannerCalendarDerivation` kan inte sätta det på tile. Inget UI visar därför projektnummer för stora projekt i kalendern.

## Plan

### 1. One‑shot SQL‑städ av stale calendar_events för stora projekt

Migration som för varje `large_project_id`:
- räknar ut rep‑booking (= `MIN(booking_id)` över `large_project_bookings ∪ bookings.large_project_id`),
- behåller endast calendar_events där `booking_id = rep`,
- raderar övriga rig/rigDown/event‑rader (event_type ≠ 'activity') för icke‑rep sub‑bokningar.

Säkerhet: körs inom transaktion, loggar antal raderade rader per LP. Påverkar bara LP‑sub‑bokningar; vanliga bokningar lämnas orörda.

### 2. Trigger så det inte uppstår igen

`AFTER INSERT` på `large_project_bookings` och `AFTER UPDATE OF large_project_id` på `bookings`: om bokningen blir non‑rep i sin LP → radera dess rig/rigDown/event calendar_events automatiskt. (Reconciler‑logiken i edge‑funktionen blir då en backup, inte enda försvarslinjen.)

### 3. Visa projektnummer på LP‑tiles

- `eventService.ts` rad 134–138 + 199–203: lägg till `project_number` i selecten.
- `plannerCalendarDerivation.ts`: skicka vidare `project?.project_number` till `extendedProps.largeProjectNumber` och inkludera i tile‑titeln, t.ex. `"260204-Projekt01 · Swedish game fair"` (eller separat fält som UI redan visar för bokningsnummer).
- Uppdatera `LargeProjectRow`-interface med `project_number`.

### 4. Liten guard för framtiden

I `bookingAssignmentService.recomputeBookingAssignment` (rad 36‑47): efter att `large_project_id` sätts på en bokning → anropa ett litet RPC `cleanup_non_rep_lp_calendar_events(booking_id)` som tar bort eventuella egna calendar_events om bokningen är non‑rep. Detta täcker även manuella konverteringar i UI.

### Filer som ändras

- `supabase/migrations/<ny>_cleanup_lp_calendar_events.sql` — engångsstäd + trigger + RPC.
- `src/services/eventService.ts` — utöka select med `project_number` (två ställen).
- `src/services/plannerCalendarDerivation.ts` — propagera `project_number` till `extendedProps` och tile‑titel.
- `src/services/bookingAssignmentService.ts` — anropa RPC efter LP‑uppdatering.

### Verifiering efter körning

Kör samma queries jag använt:
```sql
SELECT source_date, resource_id, COUNT(DISTINCT booking_id)
FROM calendar_events
WHERE booking_id IN (SELECT booking_id::text FROM large_project_bookings
                     WHERE large_project_id='f11cd5b3-c9f8-4a8f-9424-a623d6820a64')
  AND event_type='rig'
GROUP BY 1,2 ORDER BY 1,2;
```
Förväntat efter: max **1 booking per (datum, team)** för varje LP.

Säg "kör" så implementerar jag stegen i ordning (städ‑migration först, sedan trigger + UI‑fix).
