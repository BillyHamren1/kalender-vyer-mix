

# Fix: Återställ bokningshämtningen och separera arkivlogiken

## Problem
`handleGetBookings` ändrades i onödan till att hämta 30 dagars gamla bokningar (inklusive COMPLETED) för alla vyer. Detta påverkar bokningslistan i appen och visar avslutade jobb som inte borde synas där.

## Åtgärd

### 1. Återställ `handleGetBookings` i edge function
- Ta bort `thirtyDaysAgo`-filtret — hämta framtida/aktuella bokningar som innan
- Ta bort `COMPLETED` från statusfiltret — bara `CONFIRMED`
- Dvs. allt som var före "arkiv"-ändringen

### 2. Skapa separat inbox-hämtning
Lägg till en ny action `get_inbox_jobs` i edge function som:
- Hämtar bokningar med assignments senaste 30 dagarna (inkl. COMPLETED)
- Returnerar bara det som inbox-jobblistan behöver (id, client, status, datum)
- Används **enbart** av `useMobileInbox` för jobbchattar

### 3. Uppdatera frontend
- `mobileApiService.ts`: Lägg till `getInboxJobs()` som anropar `get_inbox_jobs`
- `useMobileInbox.ts`: Byt `mobileApi.getBookings()` → `mobileApi.getInboxJobs()` i `jobQuery`

### Filer som ändras
- `supabase/functions/mobile-app-api/index.ts` — återställ `handleGetBookings` + ny `handleGetInboxJobs`
- `src/services/mobileApiService.ts` — ny metod
- `src/hooks/useMobileInbox.ts` — byt API-anrop

