
Målet nu är att rätta den verkliga grundregeln:

- Projektmedlemskap ska inte göra att Billy ser Swedish Game Fair alla dagar.
- Mobilen ska vara dagstyrd: Billy ska bara se projektet de datum han faktiskt är schemalagd.
- Men på en schemalagd projektdag ska han se alla delbokningar i stora projektet för just den dagen, även om fler bokningar lagts till senare.

Det som är fel i koden just nu:
- `mobile-app-api` använder `large_project_staff` + projekt-expansion som synlighet för hela projektet.
- Den fallbackar också `assignment_dates` till bokningens egna datum.
- Resultatet blir att stora projekt dyker upp på alla projektets dagar, trots att personen bara är schemalagd en av dagarna.

## Plan

### 1. Byt från projekt-nivå till projekt-datum-nivå i `mobile-app-api`
Uppdatera `handleGetBookings` i `supabase/functions/mobile-app-api/index.ts` så att logiken blir:

- Hämta bara riktiga schemarader från `booking_staff_assignments` där `team_id !== 'project'`
- Härled vilka stora projekt personen faktiskt är schemalagd på
- Bygg en karta per projekt med exakt vilka datum personen är schemalagd på
- Expandera sedan stora projekt endast till bokningar vars datum matchar dessa schemalagda datum

Ny regel:
```text
schemalagd på projekt måndag
=> se alla projektets bokningar på måndag

inte schemalagd på projekt tisdag
=> se inga projektbokningar på tisdag
```

Det här löser båda problemen samtidigt:
- inte “hela veckan blockerad”
- inte heller “bara de 7 bokningar som fanns just då”

### 2. Sluta använda projektmedlemskap som mobil synlighet
I samma API-fix:
- `large_project_staff` ska inte längre ensamt göra att bokningar visas i `get_bookings`
- `team_id = 'project'` ska inte räknas som faktisk schemaläggning
- `assignment_dates` ska byggas från riktiga schemadatum/intersektion mot bokningens datum, inte från hela projektets datum per automatik

### 3. Förenkla mobil-UI så den speglar rätt affärsregel
När API:t är rätt kommer `project_member` i praktiken inte längre behövas i jobbvyn.

Då justeras:
- `src/pages/mobile/MobileJobs.tsx`
- `src/pages/mobile/MobileProjectDetail.tsx`

Så att mobilen visar:
- bara projekt på datum där användaren faktiskt är schemalagd
- korrekta antal bokningar för just de datumen
- ingen missvisande uppdelning som antyder att oschemalagda projektdagar ändå hör till användarens jobblista

## Förväntat resultat för Billy
För Swedish Game Fair ska det bli:

- är Billy schemalagd måndag: projektet syns måndag
- finns 7 bokningar på måndag när han läggs in, men 21 senare: han ser 21 på måndag
- är han inte schemalagd tisdag: projektet syns inte tisdag
- projektmedlemskap i sig blockerar inte veckan

## Filer som sannolikt ändras
- `supabase/functions/mobile-app-api/index.ts`
- `src/pages/mobile/MobileJobs.tsx`
- `src/pages/mobile/MobileProjectDetail.tsx`

## Ingen databasändring planeras
Det här ser ut som ett läslogikfel i edge-funktionen och mobilens presentation, inte ett schemafel.

## Verifiering efter implementation
Jag kommer verifiera att:
1. Billy bara ser Swedish Game Fair de datum han faktiskt är schemalagd
2. På en schemalagd projektdag expanderas han till alla bokningar den dagen
3. Nya bokningar som läggs till på samma schemalagda dag följer med automatiskt
4. Projektet inte längre dyker upp på andra dagar bara för att han tillhör projektet
