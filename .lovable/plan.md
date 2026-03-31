

## Inkommande projekt som behöver packning

### Koncept
Samma mönster som `IncomingBookingsList` på projektsidan -- en "inkorg" som visar projekt/bokningar som har skapats men ännu inte har en packlista. Listan visas högst upp på PackingManagement-sidan.

### Plan

**1. Ny komponent: `src/components/packing/IncomingPackingList.tsx`**
- Hämtar alla bokningar som har ett aktivt projekt (via `projects` eller `jobs` eller `large_project_bookings`) MEN som saknar en `packing_projects`-rad (dvs `booking_id` inte finns i `packing_projects`)
- Filtrerar bort avslutade/avbokade projekt
- Visar varje rad med klient, datum, adress -- samma stil som `IncomingBookingsList` (amber inkorg-header, badge med antal)
- Varje rad har en knapp "Skapa packning" som triggar `CreatePackingWizard` med den bokningen förvald

**2. Uppdatera `CreatePackingWizard.tsx`**
- Acceptera ny prop `preselectedBookingId?: string`
- Om satt: förvälj den bokningen i dropdown och autogenerera namn (som redan görs i `handleBookingChange`)

**3. Uppdatera `PackingManagement.tsx`**
- Importera och rendera `IncomingPackingList` ovanför dashboard/grid
- Koppla `onCreatePacking(bookingId)` till att öppna wizarden med förvald bokning
- Lägg till realtime-invalidation för `packing_projects` och `bookings`

### Ingen databasändring krävs
Relationen `packing_projects.booking_id` → `bookings.id` finns redan. Vi behöver bara querien:
```
Alla bokningar med aktivt projekt MINUS de som redan har en packing_projects-rad
```

