

## Problem

Bokning #2603-5 visas som "ny" trots att den redan har ett avslutat (completed) litet projekt. Orsaker:

1. **`assigned_to_project = false`** i databasen — flaggan sattes aldrig till `true` när jobbet skapades.
2. **Filtret i `DashboardNewBookings`** exkluderar completed-jobb (`.neq('status', 'completed')`), så en bokning med ett avslutat jobb ser ut som om den aldrig tilldelats.

## Åtgärd

### 1. Fixa filtret i `DashboardNewBookings.tsx`

Ändra job-queryn från `.neq('status', 'completed')` till att inkludera **alla** jobb oavsett status. En bokning som har ett jobb (oavsett om det är klart eller inte) ska inte visas som "ny".

**Fil:** `src/components/dashboard/DashboardNewBookings.tsx` (rad 42)
- Ta bort `.neq('status', 'completed')` från jobs-queryn
- Behåll projektkontrollens filter (completed/cancelled projekt kan rimligen släppa tillbaka en bokning)

### 2. Fixa `assigned_to_project`-flaggan

Säkerställ att `createJobFromBooking` sätter `assigned_to_project = true` på bokningen. Kontrollera befintlig logik och lägg till om det saknas.

### 3. Datafix: uppdatera befintliga bokningar

Kör en enkel uppdatering av `assigned_to_project = true` för alla bokningar som redan har ett jobb eller projekt, som en engångsfix.

### Teknisk detalj

```
-- Rad 42 i DashboardNewBookings.tsx, ändra:
supabase.from('jobs').select('booking_id').in('booking_id', candidateIds).neq('status', 'completed')
-- till:
supabase.from('jobs').select('booking_id').in('booking_id', candidateIds)
```

Sedan i `jobService` (eller relevant skapandefunktion): säkerställ att `assigned_to_project` sätts vid skapande.

### Resultat
Bokningar som redan har ett jobb (även avslutat) dyker inte längre upp som "nya".

