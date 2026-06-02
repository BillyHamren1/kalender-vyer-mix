# Fix: avbokningar fastnar i Booking-systemet och syncas aldrig hit

## Problem (rotorsak, inte symptom)

`incremental-sync-all-orgs` frågar externa Booking-API:t med `?since=<last_sync_timestamp>`. För 2606-1 (och troligen andra avbokade bokningar) returnerar externa API:t **0 rader** — antingen för att avbokningen inte bumpade `updated_at` där, eller för att deras `export_bookings`-endpoint filtrerar bort `status=CANCELLED` ur svaret.

Konsekvens: CANCELLED-grenen i `import-bookings` (rad 2558) körs aldrig för dessa bokningar. `bookings.status` förblir `CONFIRMED`, projektet `planning`, och `calendar_events` ligger kvar i kalendern.

Det här är inte en bugg på *denna* bokning — det är en strukturell svaghet i hela pull-syncen. **Vi kan inte lita på `?since` för att fånga avbokningar.**

## Lösning: aktiv cancellation-reconciler

Lägg till en ny edge function `reconcile-booking-status` som körs på cron (var 5–10 min). Den gör:

1. Hämta alla lokala bokningar per organization där:
   - `status IN ('CONFIRMED', 'OFFER')`
   - `rigdaydate` eller `eventdate` ligger inom ett rullande fönster (t.ex. dagens datum till +90 dagar)
2. Anropa externa Booking-API:t i batch (eller per bokning via `?booking_id=…`) och hämta aktuell `status`.
3. För varje bokning där lokal status ≠ extern status:
   - Återanvänd **exakt samma logik** som idag finns i `import-bookings/index.ts` rad 2558–2689 (uppdatera status, radera calendar_events, sätta projects/jobs till `cancelled`, ta bort packing). Lyft ut den till `_shared/cancellation-handler.ts` så båda funktionerna delar kod.
   - Logga reconciliation-händelsen så vi ser hur ofta detta räddar oss.
4. Skriv en sync_state-rad med `sync_type='cancellation_reconcile'` så vi har historik.

## Schemaläggning

Lägg till en pg_cron-rad som triggar `reconcile-booking-status` var 10:e minut, separat från `incremental-sync-all-orgs`. (Behöver göras via insert-tool, inte migration, eftersom URL+anon-key är miljöspecifikt — enligt projektets cron-konvention.)

## Backfill / engångskörning

Första körningen av reconcilern kommer att städa upp 2606-1 och alla andra bokningar som hängt sig i samma fälla. Ingen separat migration krävs — reconcilern är idempotent.

## Filer som ändras

- **Ny:** `supabase/functions/reconcile-booking-status/index.ts`
- **Ny:** `supabase/functions/_shared/cancellation-handler.ts` (extraherad logik)
- **Ändrad:** `supabase/functions/import-bookings/index.ts` — anropar nya shared-helpern istället för inline-blocket (gör koden lättare och säkrare att dela).
- **Ny:** `supabase/functions/reconcile-booking-status/index.test.ts` — Deno-test som mockar externa API och verifierar att en bokning som lokalt är `CONFIRMED` men externt `CANCELLED` triggar fullständig städning.
- **Ny:** cron-insert (via `supabase--read_query`-systrar/insert-flödet).

## Vad detta INTE löser

- Om externa Booking-API:t inte ens svarar med korrekt status när vi explicit frågar, måste det fixas där. Reconcilern täcker fallet då avbokningen *finns* externt men inte exporteras via `?since`.
- Ändrar inte hur planeraren/kalendern *renderar* — när städningen körts försvinner blocket av sig självt eftersom `calendar_events`-raden tas bort.

## Memory-uppdatering

Efter implementation: uppdatera `mem://features/planning/data-sync-integrity-v3` med en notering om reconcilern, så framtida arbete vet att avbokningar har två oberoende vägar in (incremental + reconcile).
