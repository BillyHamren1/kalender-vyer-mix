Jag hittade inte ett UI-cacheproblem först. Det lokala datalagret är faktiskt stale:

- `2604-144` finns i Planning och har fått en kö-rad idag, men senaste registrerade ändringen var bara projektkopplingsfält, inte Booking-fält.
- `2604-145` ligger kvar med `updated_at = 2026-06-03`, trots att den enligt dig är ändrad i Booking.
- De senaste `import-bookings`-körningarna loggar `Fetched 0 bookings from external API`, och `sync_state` har ändå flyttat fram cursorn till `2026-06-15 19:18:12`.
- Det betyder: Planning får inte in ändringspayloaden från Booking för de här bokningarna. Då finns inget i React/previewn att uppdatera.

Plan för fix:

1. **Verifiera importkontraktet för specifika bokningar**
   - Testa `import-bookings` med explicit `booking_id` för `2604-144` och `2604-145`.
   - Kontrollera om externa Booking-exporten kräver UUID, bokningsnummer eller annat id-format.
   - Bekräfta varför inkrementell sync returnerar 0 trots ändring i Booking.

2. **Stoppa tysta “lyckade” importer när inget faktiskt importerades**
   - Ändra syncflödet så en kö-rad inte markeras som färdig om en explicit bokningsuppdatering inte gav någon extern bokningsrad och ingen lokal ändring applicerades.
   - Logga tydligt: boknings-id, bokningsnummer, org, sync-läge och orsaken.

3. **Lägg till robust fallback för webhook/incremental**
   - Om webhook/kö bara har lokal UUID men externa API:t inte hittar den, slå upp lokalt `booking_number` och försök extern hämtning även via bokningsnummer om exporten stödjer det.
   - Inkrementell sync ska inte flytta fram cursor på ett sätt som kan svälja ändringar när exporten returnerar 0 oväntat.

4. **Se till att stora projekt invalidieras i UI när underbokningar ändras**
   - När `booking_changes` eller `bookings` ändras för en underbokning i ett stort projekt ska queryn `large-project-bookings-full` och relevant `large-project` invalidieras.
   - Det gör att Almedalen-vyn uppdateras utan manuell omladdning när datan väl kommit in.

5. **Testa på de faktiska bokningarna**
   - Kör riktad import för `2604-144` och `2604-145`.
   - Läs DB efteråt och verifiera att `bookings`, `booking_changes` och stora projektets bokningslista visar nya värden.
   - Kör automatisk test för importkontraktet så det inte kan återgå till “completed men ingen ändring”.

Målet är att uppdateringar i Booking antingen synkas igenom direkt, eller fastnar som tydligt fel i kö/logg — aldrig “completed” utan att Planning faktiskt ändras.