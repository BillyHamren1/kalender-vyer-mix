## Mål
Stoppa Planning-flödet som idag hämtar en bokning i taget via `export_bookings?booking_id=...` och ersätt det med ett stabilt, batchat inkrementellt synkmönster utan loopar.

## Vad jag kommer att ändra
1. **Bryta den felaktiga call chainen**
   - Ändra webhook/queue-vägen så att `receive-booking -> process-sync-jobs` inte längre driver `import-bookings` i **single-booking external fetch**-läge.
   - Behålla `booking_id` endast för manuell/explicit engångsuppdatering där det verkligen behövs.

2. **Flytta webhook-driven sync till inkrementell batch**
   - Låta webhookar markera organisation/bokning som "dirty" i kön, men själva hämtningen mot EventFlow ska ske via **inkrementell batch** (`since`/cursor) i stället för ett anrop per bokning.
   - Coalesca flera webhookar till en gemensam batchkörning per organisation.

3. **Hårdna kön mot studs och dubletter**
   - Normalisera event-typer som idag blandas (`booking.updated` vs `booking_updated`).
   - Införa dedupe/cooldown så samma bokning inte kan köas om och om igen inom kort tid om den redan är pending/processing eller precis nyss har körts.
   - Säkerställa att webhookar inte bygger upp en oändlig backlog snabbare än worker hinner tömma den.

4. **Ta bort aggressiv single-booking-pollning i bakgrundsflödet**
   - Single-booking-retryloopen i `import-bookings` ska inte användas för webhook/worker-driven synk.
   - Om single-booking-läge behålls för admin/manual refresh ska det vara strikt avgränsat och inte kunna triggas av webhook-kedjan.

5. **Lägga till verifiering och spårbarhet**
   - Förbättra loggarna så det tydligt framgår om ett jobb kom från webhook, batch, manuell refresh eller safety-net.
   - Lägga tester som bevisar att upprepade webhookar inte orsakar per-booking-anrop mot extern exportfunktion.

## Varför detta är rätt fix
- Den nuvarande koden visar exakt kedjan:
  - `receive-booking` skapar jobb i `booking_sync_jobs`
  - `process-sync-jobs` kör `import-bookings` med `syncMode: 'single'` och `booking_id`
  - `import-bookings` anropar extern `export_bookings` med `booking_id`
  - dessutom finns en retry/poll-loop för single-booking-pathen
- Det är alltså inte bara "misstänkt" — mönstret finns explicit i Planning-koden.
- Safety-net-funktionen `incremental-sync-all-orgs` använder redan rätt modell: batchad inkrementell synk per organisation. Den modellen ska vara normen, inte single-booking-loopen.

## Tekniska detaljer
- Berörda delar:
  - `supabase/functions/receive-booking/index.ts`
  - `supabase/functions/process-sync-jobs/index.ts`
  - `supabase/functions/import-bookings/index.ts`
  - ev. migration för starkare dedupe/queue-regler i `booking_sync_jobs`
- Verifiering efter ändring:
  - Edge-loggar ska sluta visa återkommande single-booking-jobb som leder till extern `booking_id`-hämtning
  - Kövolymen i `booking_sync_jobs` ska plana ut i stället för att växa/studsa
  - Endast inkrementella batchanrop ska återstå för normal bakgrundssynk
  - manuella refreshar ska fortfarande fungera separat

## Förväntat resultat
- Ingen kontinuerlig `bookingId=<uuid>`-loop från Planning
- Betydligt färre externa anrop
- Ingen multiplikatoreffekt mot EventFlow/WMS
- Preview och edge-runtime blir normala igen