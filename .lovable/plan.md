
Målet är att rätta logiken till det du beskriver som systemets verkliga regel:

- Blir Billy assignad till stora projektet Swedish Game Fair, då är han assignad till projektet som helhet.
- Då ska alla bokningar i projektet räknas som hans.
- Det ska inte spela någon roll om projektet råkade ha 7 bokningar när han lades till, och 21 senare.

Det jag har bekräftat i koden nu:
- `mobile-app-api` expanderar redan ett projekt till alla dess bokningar.
- Men den sätter ändå `assignment_type = 'scheduled'` bara för bokningar som har en direkt rad i `booking_staff_assignments`.
- Därför får ni felaktigt t.ex. “7 schemalagda”, trots att projektmedlemskapet ska betyda “hela projektet”.

## Plan

### 1. Rätta grundlogiken i `mobile-app-api`
Uppdatera `handleGetBookings` i `supabase/functions/mobile-app-api/index.ts` så att stora projekt behandlas så här:

- Hämta vilka `large_project_id` personen är medlem i via `large_project_staff`
- Hämta alla bokningar i dessa projekt via `large_project_bookings`
- Markera samtliga dessa bokningar som `scheduled` för personen
- Låt inte “scheduled” bero på hur många enskilda BSA-rader som råkar finnas just nu

Ny regel i API:t:
- `scheduled` om bokningen tillhör ett stort projekt där personen är projektmedlem
- `scheduled` också för vanliga direktassignade bokningar utanför stora projekt
- `project_member` ska inte användas för en person som faktiskt är medlem i stora projektets team

### 2. Sätt datumlogiken utifrån bokningarnas faktiska datum
För bokningar som blir “scheduled” via projektmedlemskap:
- bygg `assignment_dates` från bokningens datum (`rigdaydate`, `eventdate`, `rigdowndate`)
- så att mobilen visar hela projektet på rätt dagar, även när projektet växer med fler bokningar över tid

Detta gör att logiken följer projektets aktuella innehåll, inte den historiska siffran vid första assignment.

### 3. Behåll eller förenkla mobil-UI beroende på resultatet
Efter API-fixen kommer:
- projektkortet i `MobileJobs.tsx` visa totalen korrekt
- projektdetaljen i `MobileProjectDetail.tsx` inte längre splittra samma projekt felaktigt i “schemalagda” vs “övriga i projektet” för denna typ av assignment

Troligen räcker API-fixen ensam.
Om UI:t fortfarande blir missvisande efter det, justeras texten så att den inte antyder en falsk uppdelning.

## Filer som sannolikt ändras
- `supabase/functions/mobile-app-api/index.ts`
- eventuellt `src/pages/mobile/MobileProjectDetail.tsx`
- eventuellt `src/pages/mobile/MobileJobs.tsx`

## Vad jag inte tänker göra
- Ingen ny “specialkod” runt Swedish Game Fair
- Ingen databasombyggnad om det inte visar sig absolut nödvändigt
- Ingen logik som räknar “antal bokningar vid första assignment”

## Verifiering efter implementation
Jag kommer verifiera att:
1. Billy på Swedish Game Fair får alla projektets bokningar som sina
2. “schemalagda för dig” = hela projektets aktuella bokningsmängd
3. Om fler bokningar läggs till i projektet senare, följer Billy automatiskt med
4. Den gamla felräkningen “7” försvinner om projektet faktiskt innehåller fler bokningar

## Teknisk kärna
Grundfelet sitter i läslogiken, inte i din affärsregel.

Nuvarande kod gör ungefär:
```text
projektet expanderas till alla bokningar
men 'scheduled' sätts bara på bokningar med direkt BSA-träff
```

Det som ska gälla i stället:
```text
är personen medlem i large_project_staff för projektet
=> alla bokningar i projektet är scheduled för personen
```
