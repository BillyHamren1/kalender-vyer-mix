# Sales är facit: borttagna produkter ska slå igenom, och PDF:er ska komma med (2609-19)

## Vad som hände
- I Sales togs 10 produkter bort från 2609-19. Booking skickade en komplett produktlista (`completeness=complete`).
- Operations försökte ta bort motsvarande 31 rader från packlistan. Spärren stoppade det eftersom den bara tillåter 25 borttagningar per uppdatering, oavsett om borttagningen är riktig eller inte.
- Uppdateringen avbröts mitt i, innan bilagorna hämtades. Därför kom PDF:en aldrig in, och sedan 12:42 UTC misslyckas varje nytt försök på samma sätt.
- Projektets sidhuvud läser dessutom filer från den gamla lokala kopian i stället för direkt från Booking.

## Ny regel
**När Booking skickar en komplett och bekräftad produktlista genomförs borttagningen fullt ut, utan någon gräns för antal.** Det Sales säger gäller.

Spärren finns kvar för ett enda fall: när Booking svarar med en tom, ofullständig eller okänd lista, till exempel vid ett nätverksfel. Då tas ingenting bort. Det skyddet tömmer aldrig en packlista som Sales inte har tömt.

Oförändrat: packlistor som redan är påbörjade eller slutförda skrivs inte om.

## Åtgärder
1. **Spärren:** `enforceDestructiveLimit` får veta om produktlistan är komplett. Vid `complete` gäller ingen gräns för borttagning av produkter och packlisterader. Vid `unknown` eller `partial` gäller samma blockering som i dag.
2. **Bilagor hämtas alltid:** bilagesteget körs separat, så att ett fel i produkt- eller packlistesteget aldrig stoppar PDF:er.
3. **Sidhuvudet läser live från Booking:** samma källa som filfliken. Om Booking inte svarar visas ett tydligt fel och inte gamla filer.
4. **2609-19:** efter deploy körs en ny uppdatering av bokningen. De 10 produkterna och deras packlisterader försvinner och PDF:en kommer in.

## Test
- Vitest:
  - En komplett lista med 31 borttagningar går igenom.
  - En okänd eller tom lista blockeras fortfarande.
  - Bilagor sparas även när packlistesteget misslyckas.
  - Sidhuvudet använder live-läsningen.
- Efter deploy: synken för 2609-19 ska ge `applied`, och PDF:en ska synas i projektet i preview.

## Tekniskt
- `supabase/functions/_shared/syncObservability.ts`: `checkDestructiveLimit` och `enforceDestructiveLimit` tar emot `completeness`. `product_deletes` och tillhörande `total_deletes` undantas vid `complete`. Övriga typer (kalender, status, avbokning) är oförändrade.
- `supabase/functions/import-bookings/index.ts`: skicka `completeness` till `guardedDeleteByIds` i `syncPackingListAfterExpansion` och i produkt-delete. Kör attachment-upsert i ett eget try-block före packlistesteget.
- `src/components/project/BookingInfoHeader.tsx`: `useQuery(['booking-attachments', id], fetchBookingAttachments)`.
- Deploy: endast `import-bookings`. Inga databasändringar.
