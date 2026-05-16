# Spåra och åtgärda feltoasten

## Vad jag ser
Toasten "JSON object requested, multiple (or no) rows returned" är råtexten från PostgREST när ett `.single()`-anrop får 0 eller >1 rader tillbaka. Den dyker upp i `Placera bokning`-vyn (skärmdumpen visar dialogen + Spara-knappen synliga).

Inga konsol-/nätverksloggar finns sparade just nu, så jag kan inte peka ut exakt rad — men det finns några misstänkta `.single()`/`toast.error(err.message)`-platser i flödet runt `BookingPlacementDialog`, `useInternalLagerCalendarEvents`, `useRealTimeCalendarEvents` och `useProjectDetail`.

## Plan

### 1. Hårda toasten så vi alltid ser var den kommer ifrån
- I `BookingPlacementDialog.handleFinish` (catch): logga `err.code`, `err.details`, `err.hint`, och visa en svensk text istället för rå PostgREST-sträng. Översätt `PGRST116` → "Hittade inte rätt rad i databasen (kontakta admin)" + behåll `console.error` med stacktrace.
- Lägg till en lättviktig global wrapper i `src/integrations/supabase/client.ts` (eller ny `src/lib/supabase/translateError.ts`) som mappar PGRST116/PGRST301 till svensk text — användas i alla catch-blocks i placerings-/projekt-flödet.

### 2. Härda alla `.single()` i placeringsflödet
Konvertera till `.maybeSingle()` + explicit nullkontroll där det är säkrare:

- `src/components/project/BookingPlacementDialog.tsx`
  - rad 84: hämtning av `bookings` per id → `.maybeSingle()`, kasta "Bokning hittades inte" om null.
  - rad 213: insert+select projects → behåll `.single()` (insert returnerar alltid 1) men wrap i tydlig felöversättning.
- `src/hooks/useInternalLagerCalendarEvents.ts` (rad 23): join `bookings:bookings!projects_booking_id_fkey` på `is_internal=true` — om flera interna projekt finns plockas `[0]`, men joinen kan returnera flera bokningar per projekt och PostgREST-kontraktet kan smälla. Lägg till `limit(1)` i underqueryn och fallback till null säkert.
- `src/hooks/useProjectDetail.tsx` (rad 115, 144): vehicles per id → `.maybeSingle()` med fallback "Okänt fordon".

### 3. Verifiera
- Lägg till en vitest som mockar supabase och kör `handleFinish` med 0 rader → förväntar svensk text, inte PostgREST-strängen.
- Lägg till en vitest för `useInternalLagerCalendarEvents` som returnerar 2 interna projekt + booking-join → ska inte kasta.
- Kör `bash scripts/test-time-reporting.sh` ej nödvändigt; bara `bunx vitest run src/components/project src/hooks/useInternalLagerCalendarEvents` räcker.

### 4. Efter implementation
Be användaren reproducera samma klick i `Placera bokning` så vi får den nya, översatta toasten + en `console.error` med exakt PGRST-rad — då kan vi snabbt punkt-fixa den sista boven om den ligger utanför listan ovan.

## Filer som ändras
- `src/lib/supabase/translateError.ts` (ny)
- `src/components/project/BookingPlacementDialog.tsx`
- `src/hooks/useInternalLagerCalendarEvents.ts`
- `src/hooks/useProjectDetail.tsx`
- `src/components/project/__tests__/BookingPlacementDialog.error.test.tsx` (ny)
- `src/hooks/__tests__/useInternalLagerCalendarEvents.test.ts` (ny)

Ingen DB-migration, ingen UI-omdesign — bara felhantering + härdning.
