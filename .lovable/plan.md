
Problem:
UI:n visar fortfarande produktavvikelser trots att produkten redan har raderats lokalt. Koden i `sync-reconciliation` raderar produkten under `compare`, men samma körning kan fortfarande bygga eller returnera avvikelse-data från en tidigare/stale snapshot. Det gör att användaren ser “raderad”/kvarvarande produktkort trots att raden inte längre finns i databasen.

Vad jag hittade:
- `supabase/functions/sync-reconciliation/index.ts` raderar extra lokala produkter direkt i `compare` (`booking_products.delete().in('id', idsToDelete)`).
- UI:n på `src/pages/SyncReconciliation.tsx` visar bara det som edge-funktionen returnerar i `discrepancies`.
- Om compare-körningen bygger avvikelselistan från data som hämtades före raderingen, eller om svaret innehåller historiska/stale items, så ligger kortet kvar tills nästa rena jämförelse.
- Det finns idag ingen garanti att en produkt som just raderats filtreras bort från det svar som skickas tillbaka samma körning.

Lösning:
1. Gör `compare` deterministisk:
   - Samla extra lokala produkter först
   - Radera dem
   - Bygg sedan avvikelselistan från ett “rent” läge där de borttagna produkterna inte längre får delta
   - Alternativt: filtrera bort alla produkter vars id finns i `idsToDelete` innan discrepancy-arrayen returneras

2. Ta bort “success state” som ser ut som aktiv avvikelse:
   - Om vi vill visa att något raderades ska det vara separat info, inte en kvarvarande discrepancy-rad
   - Standardbeteendet bör vara: raderad produkt = ingen avvikelse längre

3. Säkerställ att UI alltid visar ny jämförelse:
   - Efter compare/apply ska sidan bara rendera färska `discrepancies`
   - Ingen lokal återanvändning av tidigare avvikelseobjekt för produkter som redan är borttagna

4. Verifiering efter implementation:
   - Kör compare på en bokning med extra lokal produkt
   - Bekräfta att produkten raderas ur `booking_products`
   - Bekräfta att samma compare-svar inte längre innehåller den produkten
   - Bekräfta att kortet försvinner direkt i `/admin/sync`

Tekniska detaljer:
- Fil att ändra: `supabase/functions/sync-reconciliation/index.ts`
- Trolig implementation:
  - bygg en `Set` med deleted product ids
  - exkludera dessa ids från `allLocalProductsByBooking` / `localProductsByBooking` innan produktjämförelsen avslutas
  - returnera inte `_product_extra:*` om delete lyckades
- Möjligen även liten UI-justering i `src/pages/SyncReconciliation.tsx` om någon “deleted” rad fortfarande behandlas som vanlig discrepancy

Förväntat resultat:
- Finns produkten inte längre i Planning-databasen, så visas ingen produktavvikelse för den
- `/admin/sync` speglar faktiskt aktuellt DB-läge direkt efter körningen
- Inga fler “spökavvikelser” för redan raderade extra lokala produkter
