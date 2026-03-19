

# Plan: Skicka booking_number istället för booking_id till allocate-instance

## Problem
Scanner-API:t skickar `packing_projects.booking_id` (ett UUID som `0fac33aa-013f-48eb-987c-862ef211a9ee`) som `reservation_id` till det externa lagersystemet. Det externa systemet känner troligen igen bokningar via `booking_number` (t.ex. `2603-95`), inte via UUID.

## Lösning

### Fil: `supabase/functions/scanner-api/index.ts`

Ändra databasfrågan i `verify_product`-casen så att den hämtar `booking_number` från `bookings`-tabellen via en join:

1. Uppdatera SELECT-frågan från:
   ```sql
   packing_projects.select('booking_id').eq('id', packingId)
   ```
   till att även joina mot `bookings`-tabellen:
   ```sql
   packing_projects.select('booking_id, bookings!inner(booking_number)').eq('id', packingId)
   ```

2. Använd `packing.bookings.booking_number` som `reservation_id` i POST-anropet till `allocate-instance` istället för `packing.booking_id`.

3. Behåll `booking_id` i loggningen så vi kan se båda värdena vid felsökning.

## Resultat
`reservation_id` skickas som `"2603-95"` istället för `"0fac33aa-..."`.

## Filer som ändras
1. `supabase/functions/scanner-api/index.ts` — Ändra query och payload i verify_product

