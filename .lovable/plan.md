# PDF från Sales syns inte i projektet (2609-19)

## Orsak (bekräftad)
1. **Synken för 2609-19 stoppas av en säkerhetsspärr.** Sedan 12:42 UTC avbryts varje uppdatering av bokningen. Den skulle ta bort 31 packlisterader men spärren tillåter max 25 (`safety_circuit_breaker:product_deletes`). Bokningen fick 10 produkter borttagna i Booking. Eftersom körningen avbryts innan bilagorna hämtas kommer den nya PDF:en aldrig in. Den lokala kopian har bara 9 bilder/jpg från 8 sept och ingen PDF.
2. **Projektets sidhuvud läser bilagor från den lokala kopian** (`BookingInfoHeader` → `booking_attachments`) i stället för direkt från Booking. Det bryter mot regeln att projektvyer ska läsa live från Booking, så allt som synken missar syns inte där.

## Åtgärd
1. Byt sidhuvudets bilagelista till samma live-läsning som filfliken (`fetchBookingAttachments` via `booking-source-read`). Då syns Bookings aktuella bilagor oavsett synkstatus. Om Booking inte svarar visas ett tydligt fel och inte gamla filer.
2. Säkerhetsspärren för 2609-19: jag höjer inte gränsen och tar inte bort några rader på egen hand. Efter att du godkänt kör jag en en-gångs-synk av just den här bokningen med spärren tillfälligt upphävd, så att de 31 inaktuella packlisteraderna (från de 10 borttagna produkterna) försvinner och bilagorna hämtas. Innan dess visar jag listan över raderna som tas bort.
3. Flytta hämtningen av bilagor så att den körs även när produktsteget stoppas av spärren. Bilagor är ofarliga att uppdatera.

## Test
- Vitest: sidhuvudet använder live-läsningen; bilagesteget körs även när produktsteget kastar circuit breaker.
- Preview: öppna projektet för 2609-19 och kontrollera att PDF:en syns både i sidhuvudet och i filfliken.

## Tekniskt
- `src/components/project/BookingInfoHeader.tsx`: ersätt den direkta tabellfrågan med `useQuery(['booking-attachments', id], fetchBookingAttachments)`.
- `supabase/functions/import-bookings/index.ts`: kör attachment-upsert före `syncPackingListAfterExpansion` eller i en egen try-block. Kräver deploy av `import-bookings`.
