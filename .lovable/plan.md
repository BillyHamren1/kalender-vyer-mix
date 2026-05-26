# Plan: Auto-skapa projekt för okopplade bekräftade bokningar

Istället för att visa "Bokningen saknar kopplat projekt" eller falla tillbaka till bokningsvyn, ska **varje bekräftad bokning utan projekt automatiskt få ett projekt skapat**. Då försvinner felet i grunden och inkorgen i Projekt blir tom.

## Vad jag bygger

### 1. En ny edge-funktion `auto-create-projects-for-orphan-bookings`
Skapar lokala projekt för alla bokningar i organisationen som uppfyller:
- `status = 'CONFIRMED'`
- `assigned_to_project` är NULL eller false
- `large_project_id` är NULL
- finns minst ett datum (eventdate / rigdaydate / rigdowndate)
- ej `is_internal`

För varje sådan bokning:
- skapar en rad i `projects` med namn `"<Client> #<booking_number>"` (samma mönster som `convertToMedium`) och kopierar över datum, adress, kontakt, internalnotes, rig-/event-/rigdown-tider, koordinater
- sätter `bookings.assigned_to_project = true`, `assigned_project_id`, `assigned_project_name`
- skyddar mot dubblett: först kontroll om `projects.booking_id = X` redan finns (status ej cancelled/completed) → koppla den istället
- multi-tenant: alltid `eq('organization_id', orgId)`
- returnerar `{ created, linked, skipped }`

### 2. Automatisk trigger vid sync + manuellt knapp
- **Direkt efter `import-bookings`** (single + incremental): kalla edge-funktionen för aktuell org så nya bekräftade bokningar genast får projekt
- **Knapp "Skapa projekt för alla okopplade"** i Projektinkorgen som triggar samma funktion manuellt (snabb återställning för dagens 5 orphans + framtida)

### 3. Säker realtidsuppdatering
- Efter körning invalideras React Query-cachen för calendar, projects och project-inbox-count
- `useEventNavigation` behåller stale-clear-logiken (om projektet hunnit raderas) men behöver inte mer fallback eftersom auto-create säkerställer att kopplingen finns

### 4. Engångskörning för befintliga 5 orphans
- Vid release körs funktionen direkt mot org så Tavet AB-bokningarna #2603-91, #2603-31R1, #2603-90, #2603-7, #2603-97 + #2605-76 får projekt på en gång
- Användaren kan därefter öppna varje bokning via kalendern och hamnar i sitt nya projekt

### 5. Tester (vitest)
- `autoCreateProjectsForOrphanBookings.test.ts`: 
  - skapar projekt + sätter assigned-flaggor för CONFIRMED orphan med datum
  - hoppar över OFFER, CANCELLED, large-project-länkade, redan kopplade
  - länkar om existerande aktivt projekt istället för att skapa dubblett
  - hoppar över is_internal-bokningar
- Säkerställer att tester körs via `lovable-exec test` efter implementation

## Tekniska detaljer

**Filer som skapas:**
- `supabase/functions/auto-create-projects-for-orphan-bookings/index.ts`
- `src/services/autoCreateProjects.ts` (klient-wrapper)
- `src/services/__tests__/autoCreateProjects.test.ts`

**Filer som ändras:**
- `src/hooks/useRefreshBooking.ts` + `src/pages/ProjectManagement.tsx` (inkorg) – anropa auto-create efter sync
- `supabase/functions/import-bookings/index.ts` – kalla auto-create i slutet per org (eller låt klient göra det via wrapper)
- `src/components/project/IncomingBookingsList.tsx` – lägg till "Skapa projekt för alla"-knapp
- Möjligen `src/hooks/useEventNavigation.tsx` – kortare felmeddelande (men troligen inte triggad alls efter detta)

**Vad jag INTE rör:**
- Stora projekt (`large_projects`) — orphans där hamnar inte i detta flöde
- Rental_only-logiken är separat och redan på plats
- Inga DELETE-migrationer (memory-policy)

## Resultat

- Inga "Bokningen saknar kopplat projekt"-meddelanden kvar.
- Varje bekräftad bokning syns alltid som projekt i kalendern och i Projektlistan.
- Existerande 5 orphans åtgärdas vid första körning.
- Framtida bokningar får projekt automatiskt vid sync.