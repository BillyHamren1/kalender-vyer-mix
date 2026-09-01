# 2605-43: packlistan går inte att jobba i

## Vad jag hittade (verifierat i databasen)

- Bokning 2605-43 (Visible Works AB, 11–12 sep) finns och är CONFIRMED, med **18 orderrader** i `booking_products`.
- Packprojektet finns: `Visible Works AB - 2026-09-11`, status `planning`, skapat 2026-08-05.
- Packprojektet har **0 rader i `packing_list_items`**.
- Inga spärrar är satta: `blocked_by_short_notice_change = false`, `needs_packing_review = false`, inga väntande ändringsförfrågningar, inga produkter markerade som borttagna i Booking.

Slutsats: packlistan är inte "låst" av en spärr — den är **tom**. Scanner/desktop har inget att packa, därför går det inte att starta eller jobba i den. `get_packing_items` i scanner-api är medvetet strikt read-only: den upptäcker och loggar avvikelsen ("+18 ins") men lagar den aldrig, och det finns i dag ingen reparationsknapp någonstans i UI:t.

Detta är inte unikt: **18 aktiva packprojekt** i databasen saknar helt packrader.

## Plan

1. **Reparationsväg i backend**
   - Lägg till action `repair_packing_items` i `scanner-api` som anropar den befintliga `sync-booking-to-packing` för packningens bokning (endast när status är `planning`/`in_progress`, aldrig mot frusna/avslutade snapshots).
   - `get_packing_items` förblir read-only; den returnerar dessutom en tydlig avvikelsesignal (antal saknade/felaktiga rader) så UI:t kan visa läget.

2. **Synligt tomt-läge i stället för tyst stopp**
   - I packvyn (desktop) och i scannerns packlista: när listan är tom men bokningen har orderrader, visa "Packlistan är inte genererad – X orderrader väntar" med knappen **Generera/reparera packlista** (kör punkt 1 och laddar om).

3. **Engångsfix för 2605-43**
   - Kör reparationen på packprojektet så de 18 raderna skapas, och verifiera att antal och kvantiteter matchar Booking exakt (inklusive paketkomponenter).

4. **Bredare avstämning**
   - Diagnostiklista över alla aktiva packprojekt utan rader (18 st i dag) i Warehouse Self-Test, med möjlighet att reparera en i taget. Ingen automatisk massuppdatering.

5. **Regressionstest**
   - Vitest som låser: tomt packprojekt + bokning med rader → reparation skapar exakt en rad per orderrad, är idempotent vid omkörning, och rör aldrig ett packprojekt med status `packed`/`delivered`/`returned`/`completed`.

## Tekniska detaljer

- Berörda filer: `supabase/functions/scanner-api/index.ts` (ny action), `src/services/booking/bookingPackingSyncService.ts` (återanvänds), packlistevyn i warehouse samt scannerns packlistesida, `src/pages/admin/WarehouseSelfTest`-vyn, nytt test under `src/__tests__/`.
- Inga databasmigrationer och inga raderingar av data; reparationen skriver bara rader som saknas via befintlig sync-funktion.
