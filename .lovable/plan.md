

# Fix: stäng första timern när resa startar — utan att röra dagtimern

## Vad som ska hända

När en resa startar ska den öppna plats-/lager-timern (`location_time_entries`) stängas exakt vid resans `start_time`. Detta sker idag i klienten via en direkt Supabase-skrivning som inte har rätt auth → raden blir kvar öppen och admin ser två tickande timers.

## Vad som INTE ska hända

**Dagtimern (WorkDayHeaderTimer) lämnas helt orörd.**
- Inga ändringar i `useWorkDayTimer.ts`, `WorkDayHeaderTimer.tsx`, `MobileHeader.tsx` eller `workdayState.ts`.
- Inga `workday-ended`-events skickas av denna fix.
- Resan fortsätter ticka som aktivitets-timer → `timer-state-changed` håller dagtimern vid liv som vanligt.
- Om något oväntat händer tar auto-recovery i `useWorkDayTimer` över (adopterar tidigaste aktiva `startTime`).

## Ändringar

### 1. `supabase/functions/mobile-app-api/index.ts`
I `handleStartTravelLog`: innan resan skapas, hitta alla öppna `location_time_entries` för samma `staff_id` och stäng dem med `exited_at = travel.start_time` + beräknat `total_minutes`. Atomisk, server-säker, auth-korrekt.

### 2. `src/hooks/useTravelDetection.ts`
Ta bort anropet till `closeOpenEntriesForStaff(...)` (klient-skrivvägen som inte fungerar). Klienten startar bara resan via `mobileApi.createTravelLog(...)` och servern sköter resten.

### 3. `src/services/locationTimeService.ts`
Markera `closeOpenEntriesForStaff` som admin-only (används kvar i admin-vyer som har full Supabase-session). Mobilen använder den inte längre.

### 4. `src/pages/StaffTimeReports.tsx`
- Räkna live-tid för öppna `travel_time_logs` (inte 0).
- Filtrera bort äldre öppen `location_time_entries` om det finns en senare öppen resa för samma staff samma dag (visar inte längre "spöktimer").

### 5. Engångsreparation av befintlig data
SQL-migration som stänger redan korrupta öppna `location_time_entries` som överlappar en senare öppen `travel_time_logs` för samma staff. Cutoff = resans `start_time`.

## Filer
- `supabase/functions/mobile-app-api/index.ts`
- `src/hooks/useTravelDetection.ts`
- `src/services/locationTimeService.ts`
- `src/pages/StaffTimeReports.tsx`
- Ny migration

## Filer som garanterat INTE ändras
- `src/hooks/useWorkDayTimer.ts`
- `src/components/mobile-app/WorkDayHeaderTimer.tsx`
- `src/components/mobile-app/MobileHeader.tsx`
- `src/services/workdayState.ts`
- `src/components/mobile-app/GlobalActiveTimerBanner.tsx` (EOD-flödet)

## Effekt
- Dubbel "NU"-bugg försvinner — bara resan är öppen efter resestart.
- Dagtimern fortsätter rulla obrutet under hela arbetspasset.
- Admin-totalen blir korrekt även med öppen resa.

