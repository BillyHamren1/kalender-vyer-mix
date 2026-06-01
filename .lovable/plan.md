# Problem
När du öppnar BookingPlannerSheet (klick på bokning i projektkalendern) visas datum från det externa bokningssystemet (`bookings.rigdaydate/eventdate/rigdowndate` + `rig_dates`/`event_dates`/`rigdown_dates`), INTE de datum du faktiskt planerat och sparat i projektkalendern (`calendar_events`).

# Var det går fel
`src/components/project/large-planner/largeProjectPlannerService.ts` (rad 177–181) slår ihop `phaseDates` (från `calendar_events`) MED de ärvda bokningsdatumen:

```ts
rig_dates: uniqueSortedDates([...phaseDates.rig, normalizePlannerDate(b.rigdaydate)]),
event_dates: uniqueSortedDates([...phaseDates.event, normalizePlannerDate(b.eventdate)]),
rigdown_dates: uniqueSortedDates([...phaseDates.rigDown, normalizePlannerDate(b.rigdowndate)]),
```

Sedan läser `BookingPlannerSheet.tsx` (rad 114–137) `booking.rig_dates`/`event_dates`/`rigdown_dates` och faller annars tillbaka på `booking.rigdaydate` osv. → ärvda datum dyker upp i sheetet även när inget är planerat.

# Lagring (redan solitt sparat)
Planerade fas-datum lever redan i en egen tabell — `calendar_events` (en rad per personal × dag × fas), och skrivs via `savePhaseDays` (`src/lib/calendar/phaseDaysWriter.ts`). Per memory **Booking Dates Single Source** får vi INTE skapa nya kolumner/tabeller — det är `calendar_events` som är sanningen för planerade dagar. Det vi måste fixa är bara läsvägen så att UI:t visar sanningen.

# Lösning (1 fil, ren UI/läsning)

**`src/components/project/large-planner/largeProjectPlannerService.ts`** (rad 177–181)

Byt sammanslagningen mot att endast använda `phaseDates` (från `calendar_events`):

```ts
rig_dates: uniqueSortedDates([...phaseDates.rig]),
event_dates: uniqueSortedDates([...phaseDates.event]),
rigdown_dates: uniqueSortedDates([...phaseDates.rigDown]),
```

Lämna `rigdaydate`/`eventdate`/`rigdowndate` på bookingobjektet kvar (de används som metadata på andra ställen), men de ska aldrig längre visas som planerade datum.

**`src/components/project/large-planner/BookingPlannerSheet.tsx`** (rad 113–139)

Ta bort fallbacken till `booking.rigdaydate`/`eventdate`/`rigdowndate` i `buildInitialDrafts`. Använd endast arrayerna:

```ts
rig:     { dates: [...booking.rig_dates].sort(),     startTime: ..., endTime: ... },
event:   { dates: [...booking.event_dates].sort(),   startTime: ..., endTime: ... },
rigDown: { dates: [...booking.rigdown_dates].sort(), startTime: ..., endTime: ... },
```

# Resultat
- BookingPlannerSheet visar enbart de fas-datum du planerat och sparat (lever i `calendar_events`).
- Bokningar utan sparade dagar öppnas tomma → du planerar och `savePhaseDays` skriver till `calendar_events` (oförändrat).
- "Planerad/Ej planerad"-logik i sidopanelen (`has_calendar_phase_days`) påverkas inte.
- Ingen DB-migration. Inga nya tabeller. Bara UI/läsväg.
