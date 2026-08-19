# Borttagna produkter i Booking syns inte i Planning (2605-37)

## Vad som faktiskt är fel

Verifierat i databasen: 2605-37 har både nya `F8 - 8x5/300` (med tillbehör) och gamla `F10 - 10x5/300` (med tillbehör). Tillägget kom in, raderingen kom aldrig.

Grundorsaken är inte Planning-UI:t och inte importens raderingskod. Den är att **Booking-API:t inte talar om att produktlistan är komplett**. Importen raderar bara produkter när svaret innehåller `products_complete: true` (`_shared/productCompleteness.ts`). Utan flaggan blir läget `unknown` → all radering blockeras tyst, tillägg släpps igenom. Det är precis symptomet.

Spärren är korrekt i sig: utan komplettletshetsbesked kan en trunkerad eller delvis produktlista radera hela packlistor. Att kringgå den med heuristik i Planning vore att lägga en lösning ovanpå problemet.

## Grundlösningen: Booking ska ändras

Booking-API:t ska, i varje bokningssvar som innehåller produkter, skicka med att listan är hela sanningen:

```json
{
  "booking_number": "2605-37",
  "products_complete": true,
  "products": [ ... alla aktuella rader ... ]
}
```

Krav på Booking-sidan:
- `products_complete: true` när `products` är hela den aktuella produktlistan för bokningen (även när den är tom efter radering).
- Fältet utelämnas eller sätts `false` endast när svaret är partiellt/trunkerat.
- Gäller både enskild bokningshämtning och listnings-/cursor-sync.

När det är på plats raderas F10 automatiskt vid nästa sync — ingen kodändring behövs i Planning utöver verifiering.

## Steg

1. **Bekräfta råsvaret.** Hämta 2605-37 via `planning-api-proxy` och läs om `products_complete` (eller `meta.products_complete`) finns. Detta avgör om det är Booking som saknar fältet eller vår parser som missar det.
2. **Om fältet saknas** → detta är Booking-teamets ändring enligt ovan. Vi skickar kravet vidare; Planning ändras inte.
3. **Om fältet finns men vi missar det** → buggen är i `readProductSourceCompleteness` och fixas där (rätt plats i payloaden, rätt typ).
4. **Gör den tysta blockeringen synlig.** Idag loggas blockerad radering bara på servern. Vi visar `blockedRemovals` i bokningens produktlista som "Finns i Planning men saknas i Booking". Det är inte en workaround — det är att avvikelsen aldrig ska vara osynlig igen.
5. **Reparera 2605-37** efter att grundorsaken är åtgärdad, och kör en diff för att hitta andra bokningar med samma spöken.
6. **Test** som låser att radering kräver `products_complete: true` och att tom lista aldrig raderar utan flaggan.

## Teknisk sammanfattning
- Ingen uppmjukning av `canDeleteProducts` — kontraktet `products_complete` behålls som enda grund för radering.
- Eventuell fix begränsas till `supabase/functions/_shared/productCompleteness.ts` (parsning) om steg 1 visar att fältet redan skickas.
- Frontend: synlig lista över blockerade borttagningar i bokningens produktvy.
