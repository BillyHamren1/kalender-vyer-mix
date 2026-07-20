## Problem

"Uppdaterade bokningar"-listan lyser upp av interna ändringar, inte bara ändringar från Booking-systemet.

Rotorsak: triggern `track_booking_changes` klassar alla ändringar från `service_role` som externa (`is_external_source = resolved_changed_by IN ('service_role','booking-import','booking-webhook')`). Men **alla våra egna edge functions kör som service_role** — `apply-project-dates`, projekt-tilldelning, `sync-booking-to-packing`, `assign-booking-to-large-project`, m.fl. Alla flaggar därför `needs_review = true`.

Bevis från `booking_changes` senaste dygnet:
- `changed_by='service_role'` + `changed_fields={assigned_project_id, assigned_project_name, assigned_to_project}` → 100% intern (projektplacering)
- `changed_by='service_role'` + `changed_fields={eventdate, rigdaydate, rigdowndate}` på nyskapad bokning som just placerats → intern (apply-project-dates)
- `changed_by='service_role'` + `changed_fields={internalnotes}` → intern

Enda vägar som ska räknas som externa: `booking-webhook` (Booking-systemets webhook) och `import-bookings` (pull från Booking-systemet).

## Lösning: explicit opt-in för extern källa

Vänd på default. `service_role` = intern. Externa importer måste själva markera sig som externa. Vi använder redan-existerande GUC:en `app.current_user` men gör den obligatorisk för extern klassning.

### 1. Migration: strama trigger + hjälpfunktion

- Skriv om `public.track_booking_changes` så att:
  ```
  is_external_source := resolved_changed_by IN ('booking-import','booking-webhook');
  ```
  Notera: `service_role` är BORTA ur listan. Loggning i `booking_changes` fortsätter oförändrat (audit-loggen är intakt).
- Ny `public.set_change_source(p_source text)` — `SECURITY DEFINER`, sätter `SET LOCAL app.current_user = p_source`. GRANT EXECUTE till `service_role`. Endast värden `'booking-import'` och `'booking-webhook'` accepteras (whitelist); allt annat blir no-op.

### 2. Externa importer opt-in

- `supabase/functions/import-bookings/index.ts` — precis före varje write-vändpunkt (upsert/update/insert mot `bookings` och `booking_products` när triggern läser dessa) kör `await supabase.rpc('set_change_source', { p_source: 'booking-import' })`.
  Eftersom PostgREST öppnar ny transaktion per request behöver vi antingen (a) göra RPC:n till en wrapper som gör write i samma call, eller (b) samla import-writes bakom en ny SECURITY DEFINER-RPC `apply_external_booking_upsert(p_rows jsonb)` som gör `PERFORM set_config('app.current_user','booking-import',true)` + upsert i samma tx.

  Valet: **(b)** för `bookings`-upserten (rad 287 och 4069 i import-bookings) — vi flyttar den till en RPC `public.upsert_bookings_external(p_rows jsonb, p_org uuid)`. För sekundära UPDATE:s (rad 881, 1008, 2116, 2377, 2475, 2631, 3022, 3526, 3541, 3578, 3609, 3993, 4004) som INTE ändrar bevakade fält lämnar vi som de är — de triggar ändå inte `has_external_changes`.

- `supabase/functions/booking-webhook/index.ts` — samma sak: writes måste gå via RPC:er som sätter `app.current_user='booking-webhook'`.

### 3. Sanering av gamla flaggor

Engångs-UPDATE i migrationen: `UPDATE bookings SET needs_review=false, needs_review_reason=NULL WHERE needs_review=true AND NOT EXISTS (SELECT 1 FROM booking_changes bc WHERE bc.booking_id = bookings.id AND bc.changed_by IN ('booking-import','booking-webhook') AND bc.change_type IN ('update','status_change'))` — rensar de ~27 bokningar i skärmdumpen som flaggats felaktigt av interna edge functions.

### 4. Kontrakts-test uppdateras

- `src/test/bookingNeedsReviewSource.contract.test.ts` — låsa nya regeln: `is_external_source := resolved_changed_by IN ('booking-import','booking-webhook')` (INTE `service_role`).
- `src/test/getUnseenBookingUpdatesSource.contract.test.ts` — samma filter i den funktionen.
- `src/services/booking/bookingChangeService.ts` — filtret `.eq('changed_by','service_role')` byts till `.in('changed_by', ['booking-import','booking-webhook'])`. Nytt test som låser detta.

## Filer som ändras

- `supabase/migrations/<ny>.sql` — trigger-omskrivning, `set_change_source`-RPC, `upsert_bookings_external`-RPC, engångsstädning + uppdatera `get_unseen_booking_updates`.
- `supabase/functions/import-bookings/index.ts` — bookings-upsert (rad 287 och 4069) går via ny RPC.
- `supabase/functions/booking-webhook/index.ts` — writes via RPC med `booking-webhook`-källa.
- `src/services/booking/bookingChangeService.ts` — nytt källfilter.
- `src/test/bookingNeedsReviewSource.contract.test.ts` — låser nya regeln.
- `src/test/getUnseenBookingUpdatesSource.contract.test.ts` — låser nya regeln.
- Nytt `src/services/booking/__tests__/bookingChangeSource.contract.test.ts`.

## Effekt

- "Uppdaterade bokningar"-listan lyser bara vid ändringar som kommit från Booking-webhook eller import-bookings pull.
- Interna operationer (projektplacering, datumpropagation via apply-project-dates, packningssync, assign-project) markerar aldrig `needs_review`.
- Audit-loggen (`booking_changes`) är oförändrad — vi ser fortfarande exakt vem som ändrade vad.
- De 27 falska flaggorna i skärmdumpen rensas av migrationen.
