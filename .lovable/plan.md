

## Problem: Ny personal syns inte i kalendern + kan inte hantera tillgänglighet

### Orsak 1: Ingen knapp för att hantera tillgänglighet
`StaffAvailabilityDialog` finns som komponent men importeras **aldrig** i `StaffDetail.tsx`. Det finns alltså ingen knapp på personalkortet för att öppna dialogen och ange tillgänglighetsperioder.

### Orsak 2: Utan tillgänglighetspost = osynlig
Kalenderlogiken i `useUnifiedStaffOperations.tsx` (rad 144-152) kräver att personal har minst en `available`-post i `staff_availability`-tabellen. Ny personal som saknar poster filtreras bort helt — de dyker aldrig upp som tillgängliga.

### Åtgärd

**1. Lägg till "Hantera tillgänglighet"-knapp på personalkortet**
- Importera `StaffAvailabilityDialog` i `StaffDetail.tsx`
- Lägg till en knapp i Anställning-kortet (under taggarna) som öppnar dialogen
- Dialogen finns redan fullt fungerande med kalender, periodval och snabbknappar

**2. Ändra standardbeteende: personal utan poster = tillgänglig**
- I `useUnifiedStaffOperations.tsx`, ändra logiken så att personal som saknar poster i `staff_availability` betraktas som tillgänglig (istället för osynlig)
- Samma ändring i `staffAvailabilityService.ts` → `getAvailableStaffForDateRange`
- Logiken blir: om en person har **inga** poster → tillgänglig. Om de har poster → kolla om `available` finns och inga `blocked/unavailable`

### Tekniska detaljer

**StaffDetail.tsx:**
- Import `StaffAvailabilityDialog`
- State: `showAvailabilityDialog`
- Knapp: "Hantera tillgänglighet" med kalenderikon, placerad efter tagg-sektionen
- Rendera dialogen med `staffId` och `staffName`

**useUnifiedStaffOperations.tsx (rad 144-152):**
```text
Nuvarande: filter(s => availableIds.has(s.id) && !blockedIds.has(s.id))
Nytt:      filter(s => !blockedIds.has(s.id) && (availableIds.has(s.id) || !hasAnyRecord(s.id)))
```
Personal utan poster passerar filtret. Personal med bara `blocked/unavailable` filtreras bort.

**staffAvailabilityService.ts → getAvailableStaffForDateRange:**
Samma logikändring — `staffPeriods.length === 0` ska betyda "tillgänglig" istället för "ej tillgänglig".

**Filer som ändras:**
- `src/pages/StaffDetail.tsx`
- `src/hooks/useUnifiedStaffOperations.tsx`
- `src/services/staffAvailabilityService.ts`

