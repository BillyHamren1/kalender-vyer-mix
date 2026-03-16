
Mottaget. Jag har hittat varför den fortfarande är tom.

## Vad som faktiskt är fel nu
Jobbet du står på (`/jobs/95ff003c-1f69-4223-967f-afac3dea397b`) pekar på booking `5ce4ef0e-...`.

- `jobs.organization_id` = **Frans August AB** (`f5e5cade-...`)
- `bookings.organization_id` för samma booking = **Doomie Design AB** (`08186612-...`)

Därför blir `fetchJobById()` tom på booking-delen i UI (RLS blockerar raden), och du ser “Ingen bokning kopplad”.

Jag ser även att detta inte bara gäller en booking:
- Minst **6 bookings** har fel org på parent-raden
- Samtidigt ligger deras produkter/bilagor/events i **Frans August**-org  
=> parent och child är osynkade.

## Rotorsak i koden
I `import-bookings` finns två kritiska delar som låser fast felet:

1) `existingBookings` hämtas utan org-filter (alla tenants)
2) `bookingData.organization_id` sätts till `existingBooking?.organization_id || organizationId`

Det betyder att om en booking en gång hamnat i fel org så fortsätter importen att skriva parent-raden i fel org, medan flera child-tabeller skrivs med requestens org.

## Plan (implementation)
1. **Hårda tenant-gränser i import-bookings**
   - Filtrera `existingBookings` med `.eq('organization_id', organizationId)`
   - Ta bort fallbacken till `existingBooking?.organization_id`
   - Sätt alltid `bookingData.organization_id = organizationId`
   - Lägg `.eq('organization_id', organizationId)` på booking-updates för extra skydd

2. **Konflikthantering vid “ID finns i annan org”**
   - Om booking-id finns globalt men inte i aktuell org:
     - markera som tenant-konflikt i logg/resultat
     - vid single-sync + tydlig lokal koppling (jobb/projekt i aktuell org), auto-heala parent booking till aktuell org
     - annars faila tydligt (ingen tyst fel-assign)

3. **Säker datamigration (kirurgisk, inte global)**
   - Flytta endast bookings som har tydlig koppling till Frans August (jobb/projekt/large_project_bookings eller child-data i Frans-org)
   - Uppdatera samma booking-id i relaterade tabeller vid behov (`booking_changes`, ev. events) för konsekvens
   - Undvik “UPDATE ... WHERE organization_id = 0818...” på hela tabeller (för riskabelt)

4. **Verifiering efter fix**
   - SQL-kontroll: inga org-mismatches mellan bookings och deras child-tabeller
   - SQL-kontroll: inga mismatch mellan jobs/projects och kopplad booking
   - Kontrollera att just `/jobs/95ff...` nu visar kundinfo, schema och bokningsdata korrekt

## Tekniska detaljer
```text
Nuvarande dataflöde (fel):
import-bookings (org=f5)
  -> hittar existingBooking från annan org (0818)
  -> bookingData.organization_id = 0818
  -> bookings parent kvar i 0818
  -> child-tabeller skrivs ofta med f5
  -> RLS gör booking osynlig i JobDetail

Efter fix:
import-bookings (org=f5)
  -> söker existingBooking endast i org=f5
  -> bookingData.organization_id = f5 (alltid)
  -> parent + child hålls i samma tenant
  -> JobDetail kan läsa booking-raden
```

Om du godkänner detta så implementerar jag exakt denna fix och kör den säkra migrationen direkt efter.
