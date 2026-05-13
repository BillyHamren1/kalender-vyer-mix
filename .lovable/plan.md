# Plan: Säkerställ att uppdateringar från Booking når Planning direkt

## Vad jag hittade när jag undersökte 2603-103

- Bokningen i Planning (`e0f22435-…`) hade kvar gammalt kundnamn `"Vile AB / Jobbfestivalen"`. Källsystemet hade ändrat det till `"bosse with friends AB"`.
- Jag triggade `import-bookings` manuellt i `single`-läge → kundnamnet uppdaterades direkt och produktlistan rättades. Update‑pathen i `import-bookings` (`hasBookingChanged` + UPDATE-blocket) fungerar alltså korrekt — `client`, `booking_number`, `status`, datum, tider, kontakt, m.m. uppdateras när data faktiskt processas.
- I `booking_sync_jobs` finns INGA jobb för 2603-103 idag innan min manuella körning. Senaste jobb var igår 21:08. Dvs Booking-systemet skickade aldrig någon `booking.updated`-webhook för dagens namnändring.
- Vi har bara en cron: `process-sync-jobs-every-minute` som dränerar kön. Det finns ingen periodisk `incremental` poll mot Booking-systemet som skulle fånga ändringar som missar webhooken.

**Slutsats:** Pipelinen (receive-booking → booking_sync_jobs → process-sync-jobs → import-bookings) är korrekt. Problemet är att vi är 100% beroende av att källsystemet skickar webhook för varje fältändring. När den uteblir (som idag för kundnamn på 2603-103) ser vi ingenting förrän någon manuellt re-syncar.

## Förslag

### 1. Säkerhetsnät: incremental sync var 5:e minut (rekommenderat)
Ny cron som anropar `import-bookings` med `syncMode: 'incremental'` per organisation. `import-bookings` använder redan `last_sync_timestamp` och `since`-parametern mot `export_bookings`, så detta plockar upp ALLT som ändrats sen sist (inkl. kundnamn, booking_number, datum osv.) — även när webhooken aldrig kom.

- Påverkar inte realtid när webhook fungerar (de är fortfarande primär väg, ankommer på sekunder).
- Worst case-latens utan webhook: ~5 minuter istället för "aldrig".
- Ingen risk för dubbel-import: `hasBookingChanged` skippar oförändrade rader.

### 2. Direktverifiering på 2603-103
Redan gjort under undersökningen. `client = "bosse with friends AB"`, `updated_at = 2026-05-13 10:14`. Inget mer behövs på just denna bokning.

### 3. (Valfritt, om webhooken ska bli pålitligare) Kontakta Booking-sidan
Om Booking-systemet är vårt eget och vi vill att webhook ska skickas även vid kundnamnsändring — felet ligger där, inte i Planning. Men det ligger utanför vad jag kan fixa här.

## Tekniska detaljer

- Ny cron-jobb (skapas via migration på `cron.schedule`):
  - Schedule: `*/5 * * * *`
  - POST → `https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/import-bookings`
  - Body: `{ "syncMode": "incremental" }` (utan `organization_id` → kör för alla aktiva orgs; behöver verifieras att `import-bookings` stöder det, annars en rad per org).
- Jag kollar att `import-bookings` redan hanterar `incremental` utan `booking_id` och loopar per organisation. Om inte → enkel patch i `import-bookings` att iterera över aktiva orgs.
- Inga schemaändringar.

## Frågor jag behöver svar på

1. Vill du att jag lägger upp **incremental poll var 5:e minut** som säkerhetsnät? (Ja = jag implementerar direkt efter godkännande.)
2. Är intervallet 5 min OK, eller vill du tätare (t.ex. var minut)?

