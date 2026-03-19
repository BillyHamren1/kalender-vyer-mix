

# Analys: Sync-robusthet mellan Booking och Planning

## Identifierade problem

### 1. KRITISK: Dubbla cancellation-flöden med motstridiga beteenden

Det finns **tre separata ställen** som hanterar avbokningar, och de gör **olika saker**:

| Källa | Sätter `assigned_to_project` | Sätter projects till | Sätter jobs till |
|---|---|---|---|
| `receive-booking` (webhook) | **Ändrar ej** | `cancelled` | `cancelled` |
| `import-bookings` (sync) | **Ändrar ej** | `completed` | `completed` |
| `handleBookingLifecycleSideEffects` (frontend) | **`false`** | `cancelled` | `completed` |

**Konsekvenser:**
- Webhook-avbokning sätter projekt till `cancelled` men rör **inte** `assigned_to_project` → bokningen dyker **inte** upp i triage (bra enligt policy)
- Frontend-avbokning (StatusChangeForm) sätter `assigned_to_project = false` → bokningen dyker upp i triage som "Ny bokning" trots att den just avbokades — **detta orsakar "flashen"**
- `import-bookings` sätter projektstatus till `completed` istället för `cancelled` — inkonsekvent

**Fix:** Konsolidera logiken:
- `handleBookingLifecycleSideEffects` ska **inte** sätta `assigned_to_project = false` för `CANCELLED`. Den ska sätta `assigned_to_project = true` (markera som "hanterad") precis som `receive-booking` gör implicit
- `import-bookings` ska sätta projekt till `cancelled` (inte `completed`) vid avbokning, för konsekvens

### 2. MEDEL: "Nya bokningar"-flash vid sidnavigering

`IncomingBookingsList` använder `queryKey: ['bookings-without-project']` men det finns **ingen realtime-invalidation** för den. Däremot invalideras cachen manuellt på ~13 ställen. Problemet:

1. Användaren öppnar `/projects` → `fetchBookings()` körs (hämtar ALL bookings)
2. Under laddning kan stale cache visa bokningar som sedan filtreras bort → kortvarigt flash
3. Realtime-ändringar (t.ex. webhook sätter `status=CANCELLED`) invaliderar **inte** `bookings-without-project`-cachen

**Fix:**
- Lägg till `'bookings-without-project'` i realtime-invalidation för `bookings`-tabellen
- Alternativt: Använd `placeholderData: []` i queryn för att undvika flash av gammal data vid mount

### 3. MEDEL: `handleBookingLifecycleSideEffects` körs från frontend (osäkert)

Funktionen gör 3 separata databasanrop utan transaktion. Om något misslyckas halvvägs (t.ex. nätverksfel) hamnar systemet i inkonsekvent tillstånd:
- Jobs satta till `completed` men `assigned_to_project` inte uppdaterat
- Eller tvärtom

**Fix:** Flytta sidoeffekterna till `receive-booking` (webhook) och `import-bookings` (sync) som redan hanterar detta server-side. Frontend ska bara uppdatera status och sedan invalidera cachen.

### 4. LÅG: Offer-downgrade i `handleBookingLifecycleSideEffects` sätter `assigned_to_project = false`

När en bokning nedgraderas till OFFER via frontend, nollställs `assigned_to_project`. Men `receive-booking` webhook för `booking.offer` gör **inte** det. Samma inkonsistens som cancellation.

### 5. LÅG: `IncomingBookingsList` hämtar ALLA bokningar

`fetchBookings()` hämtar alla bokningar med products och attachments, filtrerar sedan i JS. Med 1000+ bokningar slår detta i Supabase-gränsen och blir onödigt tungt.

## Åtgärdsplan

### Steg 1: Fixa `handleBookingLifecycleSideEffects` (stoppa flash-problemet)
**Fil:** `src/services/booking/bookingStatusService.ts`
- Ta bort reset av `assigned_to_project` till `false` för CANCELLED-status
- Sätt istället `assigned_to_project = true` så den markeras som "hanterad" och inte flashar i triage
- Behåll reset för OFFER (som matchar att den ska synas i triage för omtilldelning)

### Steg 2: Lägg till realtime-invalidation för `bookings-without-project`
**Fil:** `src/pages/ProjectManagement.tsx`
- Lägg till `useRealtimeInvalidation` som lyssnar på `bookings`-tabellen och invaliderar `['bookings-without-project']`

### Steg 3: Konsolidera projekt/jobb-status vid avbokning
**Fil:** `supabase/functions/import-bookings/index.ts`
- Ändra rad 1894-1897: sätt projekt till `cancelled` istället för `completed` vid avbokning (matchar `receive-booking`)
- Ändra rad 1906-1908: sätt jobs till `cancelled` istället för `completed` (matchar `receive-booking`)

### Steg 4: Optimera IncomingBookingsList-queryn
**Fil:** `src/components/project/IncomingBookingsList.tsx`
- Byt från `fetchBookings()` (alla bokningar) till en dedikerad query som filtrerar direkt i Supabase:
  - `status IN ('CONFIRMED','CANCELLED')` AND `assigned_to_project = false`
- Undviker 1000-radsgränsen och minskar payload

## Filer som ändras
1. `src/services/booking/bookingStatusService.ts` — fixa `assigned_to_project`-logik vid CANCELLED
2. `src/pages/ProjectManagement.tsx` — lägg till realtime-invalidation
3. `supabase/functions/import-bookings/index.ts` — konsolidera status (`cancelled` istället för `completed`)
4. `src/components/project/IncomingBookingsList.tsx` — optimera query + eliminera flash

