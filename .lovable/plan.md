

## Plan: Visa uppdaterade bokningar i triage-listan med ändringsdetaljer

### Problem
När en bokning uppdateras (t.ex. 2603-126 fick nya internalnotes idag) syns det ingenstans i systemet. Uppdateringen sker tyst. Användaren måste aktivt bli meddelad om att en bokning har ändrats, och kunna se exakt vad som ändrats.

### Lösning

**1. Ny kolumn `needs_review` på `bookings`-tabellen (migration)**
- Lägg till `needs_review BOOLEAN DEFAULT false`
- Lägg till `needs_review_reason TEXT` (t.ex. "update", "status_change")
- Uppdatera DB-triggern `track_booking_changes()`: när en bokning som har `assigned_to_project = true` får en **extern uppdatering** (change_type = 'update' eller 'status_change'), sätt `needs_review = true` och `needs_review_reason = change_type`
- Undantag: ändringar av interna flaggor (`viewed`, `assigned_to_project`, `assigned_project_id`, `assigned_project_name`) ska INTE trigga `needs_review`

**2. Uppdatera `IncomingBookingsList.tsx` (Projektsidan)**
- Lägg till en andra query: hämta bokningar där `needs_review = true` OCH `assigned_to_project = true`
- Visa dessa i en separat sektion under "Nya bokningar" med rubriken **"Uppdaterade bokningar"** (blå ikon istället för amber)
- Varje rad visar klientnamn, bokningsnummer, och en kort sammanfattning av vad som ändrats
- Knapp: "Visa ändringar" → öppnar en expanderbar panel / dialog
- Knapp: "Godkänn" → sätter `needs_review = false`

**3. Uppdatera `DashboardNewBookings.tsx` (Dashboarden)**
- Samma tillägg: hämta `needs_review = true`-bokningar och visa dem i samma widget under de nya bokningarna
- Badge visar totalen: "2 nya, 1 uppdaterad"

**4. Skapa `BookingChangesDetail.tsx` — ändringsvisning**
- Ny komponent som visar diff från `booking_changes`-tabellen
- Hämtar senaste ändringen med `previous_values` och `new_values`
- Visar varje ändrat fält med "Före → Efter" i en tydlig lista
- Fältnamn översätts till svenska (eventdate → "Eventdatum", internalnotes → "Interna anteckningar", etc.)

### Filer att ändra
- **Migration**: Lägg till `needs_review` + `needs_review_reason` på `bookings`, uppdatera `track_booking_changes()`
- `src/components/project/IncomingBookingsList.tsx` — ny sektion för uppdaterade bokningar
- `src/components/dashboard/DashboardNewBookings.tsx` — samma
- `src/components/booking/BookingChangesDetail.tsx` — NY: diff-visning av ändringar
- `src/integrations/supabase/types.ts` — uppdatera Bookings-typen

### Tekniska detaljer
- Triggern kollar `OLD.assigned_to_project = true` innan den sätter `needs_review = true` — så att nya bokningar som ännu inte har projekt inte dubbelvisas
- Interna flaggändringar (viewed, assigned_to_project, etc.) filtreras bort via en lista av "interna fält" i triggern
- "Godkänn"-knappen gör `UPDATE bookings SET needs_review = false WHERE id = X`

