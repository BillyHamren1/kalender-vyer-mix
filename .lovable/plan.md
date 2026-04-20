

## Fixplan: Multi-datum från projekt → bokningar → kalender

### Bekräftad bug
I `LargeProjectLayout.tsx` (rad 351–401) sparas hela arrayen `[10/5, 11/5, 12/5]` korrekt på `large_projects.end_date`, men sedan skickas bara **`firstDate = dates[0]`** till varje sub-bokning. Det är därför "endast den första" syns vidare — på sub-bokningarna och i kalendern.

### Vad jag bygger

**1. Skicka HELA datum-arrayen till varje sub-bokning**
`updateBookingDatesViaApi` utökas med stöd för `rig_dates[]`, `event_dates[]`, `rigdown_dates[]` (Booking-API:t stödjer redan dessa fält — vi ser dem läsas i `import-bookings`). 

För bakåtkompatibilitet sätts singel-fältet (`rigdaydate` / `eventdate` / `rigdowndate`) till **första** datumet i arrayen, men hela arrayen skickas också, så att Booking-systemet sparar alla dagar.

**2. Sub-bokningens kalenderhändelser uppdateras till alla dagar**
Efter att datumen synkats triggas `import-bookings` per sub-bokning (sker redan idag). `import-bookings` läser redan `rig_dates / event_dates / rigdown_dates` och skapar `calendar_events` per dag — så när vi väl skriver hela arrayen via API:t kommer kalendern automatiskt att få en händelse per dag per bokning.

**3. Gantt synkar mot projekt och bokningar**

Gantt-modellen behålls som **EN period per fas** (start–slut). Vid spar:

- **Gantt → projekt**: Vid spara av Gantt expanderas perioden till en lista av enskilda dagar (start, start+1, … slut) och skrivs till `large_projects.start_date / event_date / end_date`.
- **Projekt → Gantt**: När projektets datumarrayer ändras via schemakorten, uppdateras motsvarande Gantt-steg så att start = min(array), end = max(array). Inga "luckor" — Gantt är alltid en hel period.
- **Gantt → bokningar**: Använder samma propageringsfunktion som schemakorten (punkt 1 ovan), så alla sub-bokningar uppdateras automatiskt och kalendrarna matchar.

**4. Schemakortens propagering återanvänds**
Den nuvarande propageringslogiken i `LargeProjectLayout.tsx` flyttas till en gemensam funktion (`propagateProjectDatesToBookings`) som både schemakorten OCH Gantt använder, så det finns bara en kodväg för datum-sync ut till bokningar.

### Berörda filer
- `src/services/planningApiService.ts` — utökad payload-typ (`rig_dates[]` m.fl.)
- `src/pages/project/LargeProjectLayout.tsx` — skickar arrayen, refaktor till delad helper
- `src/services/largeProjectScheduleSync.ts` (ny) — gemensam helper för "skriv arrayer till alla bokningar + trigga import-bookings"
- `src/components/project/LargeProjectGanttSetup.tsx` — vid Spara: expandera period → datum-array
- `src/hooks/useLargeProjectDetail.tsx` — `saveGanttMutation` uppdateras: skriver Gantt-steg + projekt-arrayer + propagerar till bokningar
- Två-vägs sync: schemakorten uppdaterar Gantt-stegen (min/max) i samma transaktion

### Tekniska detaljer
- Ingen DB-migration behövs. `large_project_gantt_steps` behåller sin period-modell.
- Booking-API:t stödjer redan `rig_dates[]` etc. (verifierat via `import-bookings/index.ts` rad 1881–1915). Endast vår klient-payload behöver utökas.
- `import-bookings` med `localOnly: true, skip_review: true` (som redan körs efter datum-skriv) skapar `calendar_events` per dag — så multipla kalenderhändelser per sub-bokning får vi gratis.
- Helper för period→array-expandering: `expandPeriodToDates(start, end) → ["2025-05-10","2025-05-11","2025-05-12"]`.

### QA efter implementation
1. Skapa stort projekt, sätt 3 nedriggdagar i schemakortet → verifiera att alla 3 sparas på projektet OCH på varje sub-bokning OCH att kalendern visar 3 nedrigghändelser per bokning.
2. Öppna Gantt, ändra avetableringsperiod till 4 dagar → projektets `end_date` blir 4 datum, sub-bokningarna får 4 datum, kalendern visar 4 händelser per bokning.
3. Ändra tillbaka via schemakorten → Gantt-stegens period uppdateras automatiskt (min–max).
4. Verifiera att singel-fälten (`rigdaydate` etc.) på bokningar fortfarande håller första datumet (bakåtkompatibilitet för listvyer).

### Inte i denna ändring
- Ingen ändring av Booking-systemets schema eller import-bookings-logik.
- Ingen multi-period-modell i Gantt (kvar som EN period per fas).
- Ingen ändring av enskilda bokningars egen schemaredigering.

