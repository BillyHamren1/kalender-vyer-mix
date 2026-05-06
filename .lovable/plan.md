## Mål

När datum ändras på ett **stort projekt** ska vi inte längre PUT:a till externa Bokning-API:t (det är det som ger `400: Unknown type: bookings`). Datumen lever på `large_projects` + speglas till `calendar_events` lokalt. Vanliga (icke-LP) bokningar fortsätter skriva via `planning-api-proxy` som idag.

## Ändringar

### 1. `src/services/largeProjectScheduleSync.ts`
`propagateProjectDatesToBookings()` skrivs om:
- **Ta bort** `updateBookingDatesViaApi`-anropen (det är de som returnerar 400).
- **Behåll** trigger av `import-bookings` per sub-booking så `calendar_events` regenereras från `large_projects`-datumen (regenereringen i `import-bookings` läser redan från `large_projects` när bokningen är länkad — verifieras i steg 2).
- Ny doc-kommentar: "LP-datum ägs av `large_projects`, inte av sub-bookings. Externa bokningssystemet bryr sig inte om sub-booking-datum för LP."

### 2. Verifiera/justera `calendar_events`-regenerering
Kolla att `import-bookings` (eller motsvarande regenerator) bygger `calendar_events` från `large_projects.rig_dates/event_dates/rigdown_dates` när bokningen har `large_project_id`. Om den fortfarande läser från `bookings.rig_dates` behöver vi byta källa, annars blir kalendern tom efter en datumändring eftersom sub-booking-datumen inte längre uppdateras.

Alternativ om regeneratorn är för komplex att röra: gör en lokal "skugg-skrivning" direkt mot `bookings`-tabellen (lokala spegeln, inte externa API:t) av `rig_dates/event_dates/rigdown_dates` enbart för LP-syskon, så regeneratorn ser nya datum. Detta bryter inte single-source-regeln eftersom externa systemet inte heller bryr sig om dessa datum för LP.

### 3. `src/pages/project/LargeProjectLayout.tsx`
- Uppdatera felmeddelande/toast i `handleScheduleUpdate` så texten inte längre nämner "bokningssystemet" (det är inte längre där det sparas för LP).
- Behåll `large_projects`-skrivningen + Gantt-period-uppdateringen som idag.

### 4. Memory
Lägg till `mem://constraints/large-project-dates-local-authority-v1`:
> Stora projekts datum (rig/event/rigdown) ägs av `large_projects` lokalt. Skriv ALDRIG dessa till externa Bokning-API:t — externa systemet erkänner inte LP-datum på sub-booking-nivå. `calendar_events` regenereras från `large_projects` via `import-bookings` (eller direkt). Skiljer sig från vanliga bokningar där externa API:t fortfarande är source of truth.

Lägg till core-rad i `mem://index.md`.

## Det här rörs INTE
- `updateBookingDatesViaApi` finns kvar för vanliga (icke-LP) bokningar i `BookingDetail`-flödet.
- `planning-api-proxy` rörs inte.
- Memory "Cross-system Data Authority" / "Booking system single source of truth" gäller fortfarande för vanliga bokningar.

## Risker
- Om regeneratorn i `import-bookings` läser sub-booking-datum: efter denna fix får LP **inga** datum i kalendern förrän vi också byter källa till `large_projects`. Därför är steg 2 obligatoriskt och blockerande.

Säg "kör" så börjar jag med att läsa `import-bookings` för att avgöra om steg 2 behöver "skugg-skrivning" eller bara källbyte, sedan implementerar jag i ordning 1 → 2 → 3 → 4.
