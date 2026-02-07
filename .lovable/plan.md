
# Forhindra dubbletter: En bokning = ett projekt

## Problem
Nar en bokning avbokas och sedan bekraftas igen, aterstalls `assigned_to_project` till `false` av importfunktionen (som skriver over med data fran det externa systemet). Bokningen dyker da upp igen i "Nya bokningar"-listan, och anvandaren kan klicka "Litet" eller "Medel" igen -- vilket skapar ytterligare ett projekt/jobb ovanpa det gamla.

**Nuvarande data visar problemet tydligt:**
- Bokning 2602-2: 1 jobb + 4 projekt (!)
- Bokning 2602-4: 1 jobb + 2 projekt

## Rotorsak (tre stalllen)

1. **import-bookings Edge Function**: Vid ateraktivering sprids `assigned_to_project: false` fran det externa systemet till databasen, aven om det finns ett lokalt projekt. Dessutom kollas bara `projects`-tabellen vid ateraktivering -- inte `jobs`-tabellen.

2. **jobService.ts (`createJobFromBooking`)**: Ingen kontroll om det redan finns ett jobb/projekt for bokningen. Skapar alltid ett nytt.

3. **CreateProjectWizard.tsx**: Wizardens bookings-query filtrerar redan bort bokningar med aktiva projekt (`neq('status', 'cancelled')`), men eftersom `assigned_to_project` aterstalls av importen kan det anda skapas dubbletter via dashboardens "Medel"-knapp.

## Losning (tre lager av skydd)

### 1. import-bookings: Bevara lokala projektflaggor vid ateraktivering
Nar en bokning aterbekraftas och det finns ett befintligt projekt ELLER jobb:
- Satt `assigned_to_project = true` i updateData
- Satt `assigned_project_id` och `assigned_project_name` till det befintliga projektets/jobbets varden
- Utoka kontrollen till att ocksa leta i `jobs`-tabellen (inte bara `projects`)

### 2. jobService.ts: Databasvalidering innan skapande
I `createJobFromBooking`, innan ett nytt jobb skapas:
- Fraga databasen om det redan finns ett jobb med samma `booking_id`
- Om det finns och har status "completed": ateraktivera det (satt status till "planned") och returnera det
- Om det finns och ar aktivt: returnera det direkt utan att skapa nytt
- Gor samma kontroll mot `projects`-tabellen -- om bokningen redan har ett aktivt projekt, avbryt med felmeddelande

### 3. CreateProjectWizard.tsx: Dubbelkontroll vid skapande
I `createMutation`:
- Innan insert, kontrollera om det redan finns ett projekt med samma `booking_id`
- Om det finns: visa felmeddelande ("Bokningen har redan ett projekt") och avbryt

## Andringar

| Fil | Andring |
|-----|---------|
| `supabase/functions/import-bookings/index.ts` | Bevara lokala `assigned_to_project`-flaggor vid ateraktivering + kolla `jobs`-tabellen |
| `src/services/jobService.ts` | Lagg till databasvalidering i `createJobFromBooking` -- ateranvand befintligt jobb/projekt |
| `src/components/project/CreateProjectWizard.tsx` | Lagg till dubbelkontroll i `createMutation` innan insert |

## Teknisk detalj

```text
FLODE: Bokning aterbekraftas

import-bookings:
  1. Hitta befintligt projekt/jobb for booking_id
  2. OM projekt/jobb finns:
     - Ateraktivera det (status -> planning/planned)
     - Satt assigned_to_project = true
     - Satt assigned_project_id + assigned_project_name
     - Bokningen syns INTE i "Nya bokningar"
  3. OM inget finns:
     - Anvand external data (assigned_to_project = false)
     - Bokningen syns i "Nya bokningar" som vanligt

createJobFromBooking (klient):
  1. Fraga: SELECT * FROM jobs WHERE booking_id = X
  2. OM jobb finns (completed): UPDATE status -> planned, RETURN
  3. OM jobb finns (active): RETURN direkt
  4. Fraga: SELECT * FROM projects WHERE booking_id = X AND status != 'cancelled'
  5. OM projekt finns: KASTA FEL "Bokningen har redan ett projekt"
  6. ANNARS: INSERT nytt jobb (som idag)
```

## Datarensning
De befintliga dubbletterna (testdata) behover inte rensas harifran -- de kan tas bort manuellt eller via en enkel SQL-fraga. Fixarna forhindrar att nya dubbletter skapas.
