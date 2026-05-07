# Verifierad rotorsak

Det är nu tydligt vad som bestämmer att produkterna ”försvinner”:

## Kedjan som orsakar felet

1. I `eventflow-booking` exporteras produkter från `booking_products` i `export_bookings`.
   - Där står uttryckligen att produkter skickas exakt som de ligger i databasen.
   - `export_bookings` hämtar bokningar först och gör sedan en separat query mot `booking_products` för dessa `booking_id`.

2. Men i samma projekt (`eventflow-booking`) finns en importväg som först raderar alla produkt­rader för en bokning och sedan lägger in dem igen.
   - Fil: `eventflow-booking/supabase/functions/import-bookings/index.ts`
   - Den gör:
     - `delete().eq('booking_id', booking.id)`
     - därefter loopar den och `insert()` produkterna igen

3. Under det korta fönstret mellan `delete` och sista `insert` kan `export_bookings` svara med bokningen men med `products: []`.
   - Alltså: i Booking-systemet ”finns produkterna” före och efter,
   - men just när Planning läser kan källan tillfälligt se tom ut.

4. I detta projekt (`Planning`) tolkar `supabase/functions/import-bookings/index.ts` en tom array som sanningen.
   - `checkProductChanges(...)` ser då alla lokala produkter som “removed”
   - sedan kör merge-logiken:
     - uppdaterar/infogar inget (för att arrayen är tom)
     - och därefter raderas alla gamla lokala produkter som inte blev “seen”
   - resultat: `booking_products` blir 0 lokalt

## Slutsats

Det som faktiskt bestämmer att de försvinner är alltså:

```text
Booking-projektet skapar ett tillfälligt tomt produktfönster
        +
Planning-importen litar destruktivt på tom array
        =
alla lokala produkter raderas
```

Det är därför det kan se helt orimligt ut:
- ”I Booking finns ju alla produkter” — ja, före/efter syncen
- men Planning råkar läsa precis när Booking-kopian är tillfälligt tom
- och Plannings importer tar då beslutet att radera allt lokalt

# Vad jag har verifierat

- GOPA-projektets UI läser direkt från lokala `booking_products`
- nätverksanropet för GOPA gav `[]`
- databasen i Planning har just nu `0` rader för GOPA-bokningen
- det finns många genomförda `booking_sync_jobs` för samma bokning idag
- Booking-projektets kod har en verklig `delete all -> reinsert all`-sekvens för produkter
- Planning-projektets kod har en verklig `empty external products -> delete unseen local products`-sekvens

# Plan för fix

## I detta projekt (kan fixas här först)
1. Hårdna `supabase/functions/import-bookings/index.ts`
   - Om extern payload kommer med `products: []` och lokalt redan finns produkter:
   - behandla det som `transient_empty_source`, inte som “delete all”
   - hoppa över destruktiv delete i både merge- och recovery-flödet

2. Lägg till tydlig audit/logg för produktbeslut
   - booking id
   - external product count
   - local product count
   - delete skipped / delete allowed
   - orsak

3. Gör GOPA-säker återställning
   - efter skyddet är på plats kan bokningen synkas om utan risk att ännu en tom upstream-snapshot rensar allt igen

## I källprojektet `eventflow-booking` (separat åtgärd i den koden)
4. Byt bort `delete + insert` för produkter
   - helst merge/upsert
   - alternativt gör hela produktbytet atomiskt så `export_bookings` aldrig ser ett tomt mellanläge

# Viktig slutsats

Den primära buggen är inte att exporten ”glömmer” produkter permanent.
Den verkliga buggen är att:
- källsystemet exponerar ett tomt mellanläge,
- och Planning-systemet behandlar det tomma mellanläget som auktoritativ sanning.

Godkänn så går jag vidare med skyddet i Planning-importen först, vilket stoppar att GOPA och liknande bokningar töms igen.