
Mina faktiska fynd efter kodgranskningen:

1. Jag kan inte bevisa originalhändelsen via edge-loggar just nu
- Det finns inga bevarade loggar som matchar den aktuella bokningen/numret i de tillgängliga edge-loggarna.
- Det betyder att jag inte kan läsa upp exakt request-payloaden från den dagen enbart från loggarna som finns kvar.

2. Det viktiga: nuvarande webhook-kedja verkar inte vara boven
- `receive-booking` tar emot `organization_id` och sparar det oförändrat i `booking_sync_jobs`.
- `process-sync-jobs` skickar samma `organization_id` vidare till `import-bookings`.
- `import-bookings` sätter sedan `bookingData.organization_id = organizationId` innan insert/update i `bookings`.
- Jag hittar ingen `BEFORE INSERT`-trigger på `bookings` som skriver över `organization_id`.

Slutsats:
- Den tidigare trigger-teorin håller inte för `bookings`.
- Om bokningen har sparats under fel organisation så är det mycket mer sannolikt att den skapades via fel importväg/fel anropskontext, inte att databasen skrev över org-id i efterhand.

Trolig rotorsak utifrån koden:
- `import-bookings` litar på `organization_id` från anropet, inte på något `organization_id` i själva externa bokningsobjektet.
- Om en bokning någon gång importerades via fel tenant-kontekst, eller via en äldre importväg, så skulle den sparas under den organisation som anropet kördes med.
- Med andra ord: även om BOOKING “har rätt org”, så kan Planning fortfarande spara den fel om importanropet sker med fel org-kontext.

Detta är extra viktigt eftersom:
- det finns frontend-anrop som kör `import-bookings` direkt,
- och jag ser åtminstone ett nuvarande anrop i `LargeProjectLayout.tsx` som skickar fel body-format (`bookingId` i stället för `booking_id`) och dessutom utan `organization_id`.
- Det verkar inte vara orsaken till just den historiska felbokningen, men det visar att det finns fler vägar in än webhook-kedjan.

Reviderad plan för att få det exakta svaret och samtidigt täppa igen hålet:

1. Forensisk spårning av just den bokningen
- Läs historiken för bokningen i databasen via:
  - `booking_changes`
  - `sync_audit_log`
  - eventuell första förekomst i `booking_sync_jobs`
  - `created_at`/`updated_at` och första ändring
- Målet är att avgöra om bokningen:
  - kom via webhook-kedjan
  - kom via manuell/frontend-import
  - eller skapades innan nuvarande kö-system infördes

2. Hårdsäkra importen
- Uppdatera `import-bookings` så att den:
  - loggar både `request.organization_id` och `externalBooking.organization_id` om det externa svaret innehåller det
  - avbryter importen med tydligt fel om de inte matchar
- Då kan en bokning aldrig sparas under “anropets org” om exporten egentligen tillhör en annan org.

3. Skapa permanent ingest-audit
- Lägg till en enkel audit-tabell för varje booking-import:
  - `booking_id`
  - `source` (`webhook`, `worker`, `manual`, `background`, `single_refresh`)
  - `request_organization_id`
  - `external_organization_id`
  - `resolved_organization_id`
  - `matched` true/false
  - timestamp
- Då går det framåt att se exakt hur en bokning kom in och vem/vad som satte org.

4. Täta alla direkta import-anrop i appen
- Gå igenom alla ställen som kallar `import-bookings` direkt.
- Säkerställ att alla skickar:
  - rätt `booking_id`
  - rätt `organization_id`
  - och helst samma säkra väg som webhook/worker använder
- Särskilt `LargeProjectLayout.tsx` behöver rättas eftersom det just nu inte följer samma kontrakt.

5. Efterbevisning på Tiomila-bokningen
- När historiken är läst ska resultatet kunna besvaras exakt:
  - “den skapades av X”
  - “med organization_id Y”
  - “vid tidpunkt Z”
  - “via webhook/manual import”
- Först därefter bör själva datan korrigeras, så att vi inte bara lappar utan verkligen vet varför det hände.

Tekniska detaljer
- Bekräftad kedja i kod:
  - `supabase/functions/receive-booking/index.ts`
  - `supabase/functions/process-sync-jobs/index.ts`
  - `supabase/functions/import-bookings/index.ts`
- Viktig observation:
  - `import-bookings` använder `organization_id` från requesten som sanning när bokningen skrivs lokalt.
- Viktig korrigering av tidigare spår:
  - jag hittar ingen aktiv insert-trigger på `bookings` som skulle skriva över org-id där.
- Riskfil att åtgärda:
  - `src/pages/project/LargeProjectLayout.tsx` har ett direktanrop till `import-bookings` som inte skickar korrekt org-data.

Kort sagt:
- Jag kan inte läsa den historiska original-loggen just nu.
- Men koden visar att felet sannolikt inte är “BOOKING skickade fel”, utan att Planning vid något tillfälle importerade bokningen under fel org-kontext.
- Nästa steg ska därför vara forensisk verifiering i historiktabeller + hårt skydd i importpipen så detta aldrig kan ske igen.
