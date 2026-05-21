# Plan

## Mål
Få det blå `Lager`-kortet i personalkalendern att visas konsekvent även efter juni, och sluta visa det interna id:t `#d0179463` som om det vore ett riktigt bokningsnummer.

## Vad jag har bekräftat
- Kortet `Lager #d0179463` kommer inte från databasen utan skapas virtuellt i frontend via `useInternalLagerCalendarEvents`.
- Hooken genererar ett 07:00–16:00-kort i kolumnen `transport` för det interna Lagerprojektet.
- `#d0179463` är inte ett riktigt bokningsnummer i databasen, utan de sista 8 tecknen av ett internt `booking_id` som fallback-renderas i `CustomEvent.tsx`.
- I `/calendar` blandas virtuella Lager-event in via `useInternalLagerCalendarEvents(hookCurrentDate, viewMode)`, men kalendern renderas med `currentWeekStart`. Det gör datumkällan splittrad och är sannolikt varför Lager-kortet slutar följa med när man navigerar längre fram i tiden.

## Ändringar jag kommer göra
1. Synka datumkällan för interna Lager-event i `/calendar`
   - Byta så `useInternalLagerCalendarEvents` använder samma visningsdatum som kalendern faktiskt renderar med (`currentWeekStart`/månadens aktiva datum), inte hookens separata `hookCurrentDate`.
   - Säkerställa att veckovy och månadsvy båda genererar Lager-kort för rätt intervall.

2. Sluta visa falskt bokningsnummer på interna Lager-kort
   - Ändra renderingen i `CustomEvent.tsx` så `extendedProps.hideBookingNumber` respekteras.
   - Då visas bara `Lager`, inte `#d0179463`.

3. Verifiera att inga filter råkar dölja kortet
   - Kontrollera att merge/filter-logiken fortfarande tar bort andra `transport`-event men behåller de interna Lager-korten.

4. Test/validering
   - Lägga till eller uppdatera test för att interna Lager-event inte visar fallback-id som bookingnummer.
   - Köra relevanta tester.
   - Verifiera i preview att Lager visas både i maj och efter juni.

## Tekniska detaljer
- Filer som sannolikt ändras:
  - `src/pages/CustomCalendarPage.tsx`
  - `src/hooks/useInternalLagerCalendarEvents.ts` (om intervall behöver göras tydligare per vy)
  - `src/components/Calendar/CustomEvent.tsx`
  - ev. ett test under kalender-/komponentnivå

- Ingen DB-migration behövs här, eftersom problemet är frontendgenererat och inte ser ut att vara RLS/databortfall.

## Förväntat resultat
- `Lager`-kortet finns kvar även när du bläddrar fram efter juni.
- Kortet visar inte längre `#d0179463`.
- Endast det riktiga interna Lager-kortet ligger i Lager-kolumnen; andra transport-relaterade event fortsätter filtreras bort där.