
## Problem

Bokning **2604-65** hade 0 produkter i planeringen trots att Booking hade dem. En manuell re-sync jag körde precis hämtade tillbaka 4 produkter — så produkterna finns i Booking, de var bara borttagna lokalt.

## Rotorsak (verifierad i koden och i booking_changes)

`booking_changes` för 2604-65 visar:
- 2026-07-26 15:32 — `status_change` OFFER → CONFIRMED (av `booking-import`)

I `supabase/functions/import-bookings/index.ts` (rad 2395–2438) finns en "Status Demote"-gren som körs när ett single-booking-refresh från webhook får **0 träffar** från externa API:t för en lokalt CONFIRMED bokning. Den:

1. Flippar `status` till `OFFER`
2. Raderar `calendar_events`, `warehouse_calendar_events`, `packing_projects`
3. **Raderar även `booking_products`** ← detta är felet

När bokningen sedan flippas tillbaka till CONFIRMED är produkterna borta. Product-recovery-grenen (rad 2944–3008) återhämtar dem endast om nästa import faktiskt körs med produktpayload — mellan de körningarna är bokningen tom.

Detta träffar godtycklig bokning i Booking som råkar hamna i ett kort webhook-fönster där externa API:t svarar med tom lista (draft-flip, snabb-spara, cache-glitch).

## Åtgärd

**En kirurgisk ändring i `supabase/functions/import-bookings/index.ts` (Status Demote-grenen, rad ~2428–2434):**

Ta bort `booking_products`-raderingen ur `cleanupOps`. Kalender/warehouse/packing får fortsätta städas eftersom de återskapas deterministiskt vid nästa CONFIRMED-sync, men produkter är dyrbar data som inte alltid kommer tillbaka i webhook-payloaden.

Behåll produkterna precis som `[Product Recovery GUARD]` och `[Merge GUARD]` på rad 3093 och 3876 redan gör i sina fall — "external returned 0" är per definition transient och får aldrig radera lokala produkter. Det är exakt samma princip.

## Reparation av redan tömda bokningar

Kör en engångsscan som listar alla CONFIRMED-bokningar med 0 lokala produkter, och trigga `import-bookings` (single-mode) på var och en så de återhämtar produkter från Booking. Ingen datadestruktion — bara backfill.

För 2604-65 specifikt är det redan gjort i denna felsökning (4 produkter tillbaka).

## Test

- Lägg till kontraktstest i `supabase/functions/import-bookings/` som säkerställer att Status Demote-grenen aldrig innehåller `booking_products`-delete (statisk kontroll på källkoden, samma stil som befintliga contract-tester).
- Kör `bash scripts/test-time-reporting.sh`-motsvarigheten för import-bookings om det finns; annars bara typecheck + de nya contract-testerna.

## Filer som ändras

- `supabase/functions/import-bookings/index.ts` — ta bort en rad i cleanupOps-arrayen
- `supabase/functions/import-bookings/statusDemoteProductGuard.contract.test.ts` — ny fil, statisk kontroll

## Vad ändras INTE

- Ingen ändring i frontend
- Ingen ändring av OFFER-statushanteringen i sig
- Ingen ändring av calendar/warehouse/packing-städningen
- Ingen ny kolumn/tabell/migration
