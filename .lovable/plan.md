
# Fix: Projekt och jobb avslutas automatiskt vid borttagen/avbokad bokning

## Problem
Tva buggar gor att projekt och jobb ligger kvar i projektlistan trots att bokningen inte langre ar aktiv:

1. **CANCELLED-bokningar**: Import-funktionen satter projektstatusen till `'cancelled'`, men denna status finns inte i systemet (bara `planning`, `in_progress`, `delivered`, `completed`). Projektet visas darfor fortfarande i listan.

2. **CONFIRMED till OFFER**: Nar en bokning gar fran CONFIRMED till OFFER (eller annan icke-bekraftad status) tas bara kalenderhanselser bort -- projekt och jobb uppdateras inte alls.

## Losning

### 1. Edge Function: Fixa `import-bookings`

**Fil:** `supabase/functions/import-bookings/index.ts`

**A) Rad 944 -- Andra `'cancelled'` till `'completed'`:**
Nar en bokning explicit markeras som CANCELLED ska projektet fa status `completed` istallet for det ogiltiga `cancelled`.

**B) Rad 1333-1359 -- Lagg till projekt/jobb-uppdatering vid statusandring:**
Nar en bokning gar fran CONFIRMED till nagon annan status (t.ex. OFFER), lagg till logik for att:
- Uppdatera kopplade `projects` till status `completed`
- Uppdatera kopplade `jobs` till status `completed`
- Ta bort kopplade `packing_projects` (samma som vid CANCELLED)
- Ta bort kopplade `booking_products`

**C) Rad 944 -- Lagg aven till uppdatering av `jobs`-tabellen vid CANCELLED:**
Idag uppdateras bara `projects`, men `jobs` (sma projekt) ignoreras helt vid avbokning.

### 2. Databas-trigger: Sakerhetsnat for raderade bokningar

Skapa en trigger pa `bookings`-tabellen som vid `ON DELETE` automatiskt satter:
- `projects.status = 'completed'` for alla kopplade projekt
- `jobs.status = 'completed'` for alla kopplade jobb

Detta fångar upp fallen dar en bokning raderas helt fran databasen (t.ex. vid historisk rensning).

### 3. Frontend: Filtrera bort avslutade projekt i standardvyn

**Fil:** `src/components/project/JobsListPanel.tsx`
**Fil:** `src/components/project/MediumProjectsListPanel.tsx`

Inga andringar behövs har -- anvandaren kan redan filtrera pa status. Men den viktigaste fixen ar att projekten faktiskt far ratt status i databasen (steg 1 och 2).

### 4. Databasfix: Ratta upp befintliga felaktiga projekt

Kör en engångsmigration som:
- Hittar alla projekt med `status = 'cancelled'` (ogiltigt) och satter dem till `completed`
- Hittar alla projekt/jobb kopplade till bokningar med status `OFFER` eller `CANCELLED` och satter dem till `completed`

## Tekniska detaljer

### Andringar i import-bookings (CANCELLED-blocket, rad ~930-954):

```text
// Nuvarande (rad 944):
status: 'cancelled'

// Ny:
status: 'completed'

// Ny: Uppdatera aven kopplade jobs
await supabase
  .from('jobs')
  .update({ status: 'completed', updated_at: now })
  .eq('booking_id', existingBooking.id)
```

### Andringar i import-bookings (statusandring-blocket, rad ~1333-1359):

```text
// Efter borttagning av kalenderhändelser, lagg till:
if (wasConfirmed && !isNowConfirmed) {
  // Uppdatera kopplade projekt till completed
  await supabase.from('projects')
    .update({ status: 'completed', updated_at: now })
    .eq('booking_id', existingBooking.id)

  // Uppdatera kopplade jobb till completed
  await supabase.from('jobs')
    .update({ status: 'completed', updated_at: now })
    .eq('booking_id', existingBooking.id)

  // Ta bort packing projects
  await supabase.from('packing_projects')
    .delete()
    .eq('booking_id', existingBooking.id)

  // Ta bort booking products
  await supabase.from('booking_products')
    .delete()
    .eq('booking_id', existingBooking.id)
}
```

### Databas-trigger:

```text
CREATE FUNCTION handle_booking_delete()
  FOR EACH ROW:
    UPDATE projects SET status = 'completed' WHERE booking_id = OLD.id
    UPDATE jobs SET status = 'completed' WHERE booking_id = OLD.id

CREATE TRIGGER on_booking_delete
  BEFORE DELETE ON bookings
  FOR EACH ROW EXECUTE handle_booking_delete()
```

### Engangsmigration:

```text
-- Fixa befintliga projekt med ogiltig status 'cancelled'
UPDATE projects SET status = 'completed' WHERE status = 'cancelled';

-- Fixa projekt kopplade till icke-bekraftade bokningar
UPDATE projects SET status = 'completed'
  FROM bookings
  WHERE projects.booking_id = bookings.id
  AND bookings.status IN ('OFFER', 'CANCELLED')
  AND projects.status != 'completed';

-- Samma for jobb
UPDATE jobs SET status = 'completed'
  FROM bookings
  WHERE jobs.booking_id = bookings.id
  AND bookings.status IN ('OFFER', 'CANCELLED')
  AND jobs.status != 'completed';
```

## Filer som andras

| Fil | Andring |
|-----|---------|
| `supabase/functions/import-bookings/index.ts` | Fixa `cancelled` till `completed`, lagg till projekt/jobb-uppdatering vid statusandring, lagg till jobb-uppdatering vid CANCELLED |
| Databasmigration | Trigger for `ON DELETE` pa bookings, engångsfix av befintliga felaktiga poster |

## Resultat
Nar en bokning tas bort, avbokas eller andras till OFFER sa flyttas alla kopplade projekt och jobb automatiskt till "Avslutat" och forsvinner fran den aktiva listan.
