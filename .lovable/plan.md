## Felorsak

Raden i tabellen säger "Ingen geo-position kopplad till raden" trots att GPS finns. Två separata orsaker:

1. **StaffTimeReportsList → TimeReportReviewTable**: travel-rader byggs från `journal.sessions` (`ProjectSession`), och `ProjectSession` för en travel-leg bär bara `label/start/end/hours` — inga koordinater eller `destination_booking_id`. Listan sätter därför `from_latitude/to_latitude/from_address/...` till `null` (rad 246-252 i `StaffTimeReportsList.tsx`). Då blir `entry.gps` `undefined` i `buildReviewEntries` och sub-raden faller till "Ingen geo-position kopplad till raden". Det är också därför "Saknar destination" + "Saknar adress" syns på resan.
2. **Drawern visar bara start/slut-koordinaten, inte de faktiska pings**. Användaren förväntar sig att se GPS-rörelsen för raden — vi har redan `useStaffPingsForDay` + `StaffPingDetailPanel` (används i andra ytor) som gör exakt det.

DB-koll bekräftar: båda travel-loggarna 2026-05-04 har giltiga `from_latitude/from_longitude/to_latitude/to_longitude`.

## Vad vi ska bygga

### 1. Berika `ProjectSession` (kind=`travel`) med GPS-data
`src/lib/staff/dayJournal.ts`
- Lägg till valfria fält i `ProjectSession`: `fromAddress`, `toAddress`, `fromLatitude`, `fromLongitude`, `toLatitude`, `toLongitude`, `destinationBookingId` (relevanta endast för travel; `baseLatitude/baseLongitude` finns redan).
- Utöka `RawTravelLog` med `from_address`, `from_latitude/longitude`, `to_latitude/longitude`, `destination_booking_id`.
- I travel-loopen (rad 322-335): för-fyll fälten på sessionen.

### 2. Mata in fälten från producenten
`src/pages/StaffTimeReports.tsx` (rad 692-700)
- Mappa de extra fälten från `travel`-raden in i `RawTravelLog`.

### 3. Skicka vidare i listan
`src/components/staff/StaffTimeReportsList.tsx` (rad 240-253)
- För travel: använd `s.fromLatitude/...` istället för `null`. Använd `s.fromAddress/s.toAddress` för adress.
- Skicka även med `staffId` och `dateStr` till `<TimeReportReviewTable>` så drawern kan hämta pings.

### 4. Riktig "GPS-underlag" via pings — inte bara två koordinater
`src/components/staff/TimeReportReviewTable.tsx`
- Lägg till props `staffId?: string` och `date?: string` (DailyOverviewDialog skickar dessa redan, listan får börja).
- I expanderingen ersätter vi den statiska `fromLat/toLat`-grid:en med en återanvändning av `<StaffPingDetailPanel>` (som vi redan har), filtrerad på radens `startIso → endIso`. Den visar antal pings, första/sista tid och en "Visa på karta"-knapp som öppnar `StaffMovementMap`.
- Fallback-text "Ingen geo-position…" visas BARA om `staffId/date` saknas (t.ex. legacy callsite) eller pings-arrayen är verkligen tom.
- Behåll dagens "Visa GPS-detaljer"-toggle i headern; pings-panelen i raden är finkornig och fungerar med toggle av.

### 5. Uppdatera DailyOverviewDialog-callsiten
`src/components/staff/DailyOverviewDialog.tsx` (rad 524-566)
- Skicka in `staffId={staffId}` och `date={date}` till `TimeReportReviewTable`.

## Bonus-effekt
"Saknar destination"-varningen försvinner automatiskt på Eduards 2 resor när `destination_booking_id` propageras (det är `null` i DB just nu — men `from_address`/`to_address` finns, så `'Ingen adress på resan'` försvinner i alla fall). `'Saknar destination'`-varningen kommer fortsatt visas tills travel-loggen får ett `destination_booking_id` — den är korrekt och ska behållas, det är ett separat datakvalitetsärende (resorna är `source='gap_derived'` och har inget bokat mål).

## Filer som ändras
- `src/lib/staff/dayJournal.ts`
- `src/pages/StaffTimeReports.tsx`
- `src/components/staff/StaffTimeReportsList.tsx`
- `src/components/staff/TimeReportReviewTable.tsx`
- `src/components/staff/DailyOverviewDialog.tsx`

Inga DB-migrationer behövs.
