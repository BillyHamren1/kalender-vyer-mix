# Varför rig-raden försvann för bokning 2604-8

## Vad jag hittade i datan

**Bokning 2604-8 (Westmans Uthyrning):**
- `bookings`-raden är korrekt: `rigdaydate = 2026-06-03`, `rig_start_time/end_time` satta, `eventdate = 2026-06-05`, `rigdowndate = 2026-06-08`.
- `calendar_events` har bara EN rad: `rigDown @ 2026-06-08, team-4`. Ingen rig-rad. Ingen event-rad.

**Audit-spår (`booking_changes` version 6, 2026-05-27 09:04:10):**
Endast `rigdaydate`, `rig_start_time`, `rig_end_time` ändrades — från `2026-06-04` → `2026-06-03`. Det var ditt datumbyte igår.

## Vad som hände — rotorsak

Två skrivvägar slåss om `calendar_events`, och de stämmer inte överens efter ett datumbyte:

1. **UI-vägen (`savePhaseDays` i `src/lib/calendar/phaseDaysWriter.ts`)** uppdaterade `bookings.rigdaydate` till 06-03 och försökte INSERT-a en ny `calendar_events`-rad för rig@06-03. Den **raderade aldrig** den gamla rig-raden på 06-04. Best case: två rig-rader (gammal + ny). Worst case: insert skippades tyst om sticky-team inte kunde härledas (se rad 186-193 — bara `console.log`).

2. **`import-bookings`-reconcilern** (supabase/functions/import-bookings/index.ts, rad 1135-1251) körs sedan när bokningen importeras nästa gång från det externa systemet. Den bygger `desiredEvents` från **vad det externa systemet skickar**, matchar mot existing via `event_type|date` och **DELETE:ar allt som inte matchar** (rad 1238-1251).

   Det externa systemet har inte registrerat ditt UI-datumbyte (det skedde lokalt via phaseDaysWriter — inte mot Bokningssystemet). Så reconcilern fick ett desired som inte innehöll rig@06-03, och raderade den nya raden som stale. Event-dagen på 06-05 raderades samtidigt — det är by design (rad 1101: "Event days are NO LONGER persisted to calendar_events").

Resultat: bara rigDown@06-08 överlever.

## Vad vi behöver fixa

### A. Akut: återskapa rig-raden för 2604-8

En engångs-INSERT i `calendar_events`:
- `booking_id = f60e2565-7a09-42f3-bc90-164f29c17ddd`
- `event_type = 'rig'`
- `start_time = 2026-06-03 08:00:00+00`, `end_time = 2026-06-03 12:00:00+00`
- `source_date = 2026-06-03`
- `resource_id = team-4` (samma som rigDown — sticky team)
- `booking_number = '2604-8'`, `title = 'Westmans Uthyrning'`, adress från bokningen, `organization_id` från bokningen.

Görs via vanlig migration eller en liten admin-action — ingen kodändring krävs för detta steget.

### B. Strukturell fix: phaseDaysWriter ska migrera gammal rad i stället för att lämna kvar den

I `src/lib/calendar/phaseDaysWriter.ts`:

1. **Innan** vi letar/INSERT:ar på det nya datumet — leta upp eventuell befintlig rad för `(booking_id, event_type)` vars `source_date` INTE finns i den nya `dates`-listan. Om det är **exakt en sådan föräldralös rad** och vi är på väg att skapa en ny rad: gör en `UPDATE` på den gamla i stället (flytta `source_date`, `start_time`, `end_time`, `title`). Det bevarar `resource_id` (team stickiness).
2. Om sticky-team saknas → returnera ett **tydligt fel** i `failures[]` i stället för bara `console.log`, så UI:t kan visa "datum bytt men kalender ej uppdaterad".

### C. Skydda mot import-bookings stale-delete för lokalt ändrade datum

I `supabase/functions/import-bookings/index.ts` runt rad 1238-1251 (stale-delete-passet):

- Lägg till en guard: om en existing rad har `source_date` som matchar bokningens nuvarande `rigdaydate`/`eventdate`/`rigdowndate` (det "sanna" datumet enligt vår lokala booking-rad), **radera inte** den även om externa desiredEvents inte innehåller den. Då vinner alltid det lokala bookings-fältet, vilket är vad memory-regeln **Booking Dates Single Source** föreskriver.
- Logga `[Calendar Reconcile] KEEP-LOCAL` för spårbarhet.

### D. Test som låser beteendet

Ny test i `supabase/functions/import-bookings/__tests__/` (eller motsvarande):
- Setup: bokning med `rigdaydate=2026-06-03` lokalt, calendar_events har rig@06-03.
- Kör reconcileCalendarEvents med externt desired som saknar rig (simulerar EventFlow-glitch).
- Förvänta: rig@06-03 finns kvar efteråt.

Och en `phaseDaysWriter.test.ts`-fall:
- Befintlig rig@06-04 + savePhaseDays för rig@06-03 → resultat: en (1) rig-rad på 06-03, samma `resource_id` som tidigare. Ingen kvarvarande 06-04-rad.

## Filer som ändras

- `src/lib/calendar/phaseDaysWriter.ts` (logik B)
- `src/lib/calendar/__tests__/phaseDaysWriter.test.ts` (ny, eller utöka befintlig)
- `supabase/functions/import-bookings/index.ts` (logik C, rad ~1238-1251)
- Ny test för reconciler-guarden
- Engångs-INSERT för 2604-8 (migration eller manuell SQL)

## Vad jag INTE rör

- Personalkalendern-renderingen (bara saknad data, inte renderfel).
- `calendar_events`-schemat.
- BSA-recompute / staff_assignments — de följer automatiskt när rig-raden är på plats igen.
- Stora projekt-planerarens egen tabell (`large_project_booking_plan_items`).
