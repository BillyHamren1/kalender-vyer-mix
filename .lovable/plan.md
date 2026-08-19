# Borttagna produkter i Booking försvinner inte i Planning

## Vad som faktiskt hänt med 2605-37

Verifierat i databasen just nu: bokningen har BÅDE `F8 - 8x5/300` (med F8 Tak, F8 Vägg, F8 Gaveltriangel) OCH den gamla `F10 - 10x5/300` (med F10 Tak, F10 Vägg, F10 Gaveltriangel). Tillägget av F8 kom in, men raderingen av F10 kom aldrig fram.

Orsaken är en säkerhetsspärr i importen (`_shared/productCompleteness.ts` + `import-bookings`): en produkt får bara raderas lokalt när Booking-svaret EXPLICIT innehåller `products_complete: true`. Saknas fältet blir läget `unknown` och all radering blockeras (loggas som `product_destructive_sync_blocked_incomplete_source`) — tillägg och uppdateringar släpps ändå igenom. Det är exakt det beteende vi ser: F8 in, F10 kvar.

Spärren byggdes för att en trunkerad/tom produktlista från Booking inte ska radera hela packlistor. Problemet är att den nu är permanent påslagen eftersom Booking-API:t inte skickar flaggan alls.

## Vad som ska göras

### 1. Bekräfta vad Booking faktiskt skickar (första steget)
Hämta råsvaret för 2605-37 via `planning-api-proxy` och logga om `products_complete` (eller `meta.products_complete`) finns. Resultatet avgör steg 2a eller 2b. Ingen gissning innan detta är läst.

### 2a. Om Booking kan skicka flaggan
Ingen kodändring i Planning behövs utöver att verifiera att `readProductSourceCompleteness` plockar upp den. Vi begär att Booking sätter `products_complete: true` på hela produktlistan.

### 2b. Om Booking inte skickar flaggan (troligast)
Inför en "verifierad komplett hämtning"-regel i importen istället för att kräva flaggan:

- När vi hämtar EN specifik bokning direkt via id/bokningsnummer (targeted sync / "Uppdatera bokningar"), och svaret innehåller en icke-tom `products`-array, behandlas källan som `complete`.
- Vid bulk-/cursor-sync behålls dagens fail-closed-beteende.
- Kvarvarande skydd: tom produktlista = aldrig radering, och en takregel — om fler än X % (t.ex. 50 %) av lokala produkter skulle raderas i en och samma körning stoppas raderingen och loggas som avvikelse istället.

### 3. Synlig varning istället för tyst blockering
Idag är blockerad radering bara en serverlogg. Vi visar i produktlistan för bokningen en varningsrad: "Finns i Planning men saknas i Booking" på produkter som ligger i `blockedRemovals`, med knapp "Ta bort lokalt" för manuell åtgärd. Ingen tyst avvikelse igen.

### 4. Reparera 2605-37
Efter att fixen är på plats: kör targeted sync på 2605-37 och verifiera i databasen att F10-raderna (inkl. tillbehör) och deras packlisterader är borta och att F8 ligger kvar. Kontrollera även andra bokningar med samma symptom via en diff-körning.

### 5. Tester
- Utöka `src/test/productCompleteness.contract.test.ts`: targeted fetch med produkter → `deleteAllowed = true`; bulk-sync utan flagga → fortsatt blockerad; tom lista → alltid blockerad; takregeln stoppar massradering.
- Regressionstest på scenariot "produkt ersatt med annan" (F10 → F8): en add + en delete.

## Teknisk sammanfattning
- `supabase/functions/_shared/productCompleteness.ts` — ny källkontext (`fetch_mode: 'targeted' | 'bulk'`) i completeness-beräkningen + takregel.
- `supabase/functions/import-bookings/index.ts` — skickar med fetch-mode, exponerar `blockedRemovals` i sync-resultat/`sync_audit_log`.
- Frontend: produktlistan i bokning/projekt visar blockerade borttagningar med manuell rensning.
