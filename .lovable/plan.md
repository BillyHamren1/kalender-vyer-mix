## Problem

Min förra fix gjorde att ALLA bokningar visas som "planerade" i Almedalen-sidofältet. Bekräftat mot DB: 20 av 21 Almedalen-bokningar har inga `calendar_events` alls, men ALLA har ärvda `rigdaydate`/`eventdate`/`rigdowndate` från det externa bokningssystemet.

I `largeProjectPlannerService.ts` (rad 177-182) byggs `rig_dates`/`event_dates`/`rigdown_dates` som **union** av:
1. `phaseDates` från projektets `calendar_events` (faktiska planerade dagar)
2. Bokningens egna `b.rigdaydate`/`b.eventdate`/`b.rigdowndate` (ärvt basdatum)

Så `hasAnyBookingDate()` i sidofältet blir alltid `true` så fort bokningen har ett basdatum — vilket alla har.

## Lösning

Skilj "ärvt basdatum" från "sparat i projektkalendern" på typnivå.

### 1. `src/components/project/large-planner/largeProjectPlannerTypes.ts`
Lägg till ett nytt fält på `LargeProjectPlannerBooking`:
```ts
/** True om bokningen har minst en sparad fas-dag i projektets calendar_events (rig/event/rigDown). */
has_calendar_phase_days: boolean;
```

### 2. `src/components/project/large-planner/largeProjectPlannerService.ts` (rad 152-184)
Sätt fältet baserat ENBART på `phaseDates`-Sets (som byggts från `calendar_events`), INTE på de ärvda bokningsdatumen:
```ts
has_calendar_phase_days:
  phaseDates.rig.size > 0 ||
  phaseDates.event.size > 0 ||
  phaseDates.rigDown.size > 0,
```
`rig_dates`/`event_dates`/`rigdown_dates`-arrayerna behålls oförändrade (de används av kalender-renderingen för att visa basdatumen).

### 3. `src/components/project/large-planner/LargeProjectPlannerSidebar.tsx` (rad 94-117, 121, 274)
Byt ut `hasAnyBookingDate()`-helpern mot:
```ts
const isBookingPlanned = (b: LargeProjectPlannerBooking) => b.has_calendar_phase_days;
```
Uppdatera båda anropsplatserna (`renderBookingCard` rad 121 + rad 274) och filter-logiken (rad 106-107) till att använda `b.has_calendar_phase_days` istället.

## Resultat

- Bokningar utan sparade projektkalender-dagar = "Ej planerad" → syns i Att planera-listan
- Bokningar med minst ett `calendar_event` (rig/event/rigDown) = "Planerad"
- Ärvda basdatum från externt system räknas inte längre som planering

Inga ändringar i personalkalendern, kalender-rendering, DB eller migrations.
