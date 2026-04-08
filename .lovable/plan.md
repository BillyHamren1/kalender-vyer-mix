
Mål: göra kostnadsvyn för stora projekt lika öppen/redigerbar som vanliga projekt, få “Alla kostnader” att faktiskt visa data, och visa rätt bokningsnamn/-nummer konsekvent.

1. Fixa orsaken till tom “Alla kostnader”
- Gå igenom `LargeProjectBookingEconomyBreakdown.tsx` och normalisera inkommande booking-data innan rendering.
- Bygg den sammanslagna listan från samma datakällor som redan används i “Per bokning”, inklusive fallback för olika API-format på produkter/kostnader.
- Lägg till tydligt empty-state per kategori i stället för att hela fliken ser tom ut när vissa arrays saknas.

2. Gör kostnadsfälten öppna och redigerbara
- Produkten är idag bara visad som read-only i stora projekt, trots att vanliga projekt redan har inline-edit via `ProductCostsCard`.
- Återanvänd samma edit-mönster för produktkostnader även i large project-vyn: klickbara kostnadsfält direkt i tabellen, sparning via samma override-logik (`product_cost_overrides`) per projekt/bokning.
- Gör inköp permanent synligt redigerbara utan hover-beroende kontroller, så edit/delete/add alltid syns tydligt.
- Säkerställ att “lägg till kostnad” finns både per bokning och i den sammanslagna vyn.

3. Samla alla kostnader i en verklig total-lista
- Utöka “Alla kostnader”-fliken så den visar:
  - produkter
  - personal/tid
  - inköp
  - fakturor
  - leverantörsfakturor
  - lokala projektinköp
- Märk varje rad med bokning, typ och källa så användaren både kan se allt sammanslaget och förstå ursprung.

4. Rätta bokningsnamn/-nummer
- Nu prioriteras sparad `display_name` för högt, vilket kan visa gamla felaktiga etiketter.
- Ändra namnupplösningen så riktig bokningsdata (`client` + `booking_number`) alltid prioriteras före gamla generiska/sparade etiketter.
- Använd samma helper på alla ställen i large project-ekonomin så bokningsnamn blir konsekventa i både “Per bokning” och “Alla kostnader”.

5. Anpassa datalagret för edit i stora projekt
- `useLargeProjectEconomy` returnerar idag bara rå batchdata; för redigerbara produktkostnader behöver den även exponera mutations/funktioner motsvarande vanliga projektets `updateProductCost`/`resetProductCost`.
- Återanvänd befintlig override-service där det går, i linje med befintlig single-source-of-truth för ekonomi.

6. QA efter implementation
- Verifiera att:
  - “Alla kostnader” inte längre är tom
  - produktkostnader går att klicka och spara
  - inköp går att lägga till/redigera direkt utan dolda kontroller
  - bokningsnummer visas korrekt i båda vyerna
  - totaler uppdateras direkt efter ändringar

Tekniska filer som sannolikt påverkas
- `src/components/project/LargeProjectBookingEconomyBreakdown.tsx`
- `src/hooks/useLargeProjectEconomy.tsx`
- eventuellt en delad helper för bokningsnamn
- ev. återbruk av logik från:
  - `src/components/project/ProductCostsCard.tsx`
  - `src/hooks/useProjectEconomy.tsx`
  - `src/services/productCostOverrideService.ts`

Viktig observation från genomgången
- “Alla kostnader” är idag byggd separat och enklare än “vanliga projekt”-logiken.
- Large project-vyn saknar idag samma produkt-edit-flöde som standardprojektet redan har.
- Bokningsetiketter kommer från en blandning av `display_name` och bokningsdata, vilket gör att gamla felaktiga etiketter kan leva kvar.
