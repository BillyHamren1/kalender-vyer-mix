# Felanalys: Billys tisdag/onsdag visas inte i appen

## Vad jag hittade i datan

Billy har dessa BSA-rader i `booking_staff_assignments`:

| Datum | Bokning | team_id | Roll |
|-------|---------|---------|------|
| 2026-04-27 (mån) | 2603-9 | team-2 | field |
| 2026-04-27 (mån) | 2602-15 | team-2 | field |
| 2026-04-28 (tis) | 2603-9 | team-3 | field |
| 2026-04-28 (tis) | 2602-15 | team-3 | field |
| 2026-04-29 (ons) | 2603-9 | **project** | field |
| 2026-04-29 (ons) | 2602-15 | team-3 | field |

Men `calendar_events` finns endast för:
- 2603-9: 04-29 (rig) + 05-06 (rigDown)
- 2602-15: 04-30 (rig) + 05-06 (rigDown)

→ **Tisdag (04-28) saknar helt CE-rader.** Och för bokning 2603-9 är onsdagens BSA märkt `team_id='project'` (visibility-only) vilket gör att den filtreras bort innan shifts byggs.

## Vad mobile-app-api gör idag

`handleGetBookings` har en fallback-väg (`getBookingShiftWindowForDate`) som *ska* generera ett "syntetiskt" shift när det saknas en CE-rad för en BSA-dag. För 04-28 borde den producera shifts åt Billy med rig-tider 08:00–18:00 från bokningens `rig_start_time/rig_end_time`.

Två konkreta brister jag ser:

1. **Onsdag 04-29 / bokning 2603-9 försvinner helt** eftersom raden har `team_id='project'`. Den filtreras bort i `realBsaForShifts` (rad 1063–1068) och datumet läggs aldrig till i `assignment_dates` för bokningen (rad 967–981). Resultat: Billy har faktiskt ett jobb den dagen men appen får ingen shift.

2. **Inga loggar bekräftar att fallback faktiskt körs.** Edge function-loggarna visar inga `get_bookings`-anrop senaste 10 min, så vi vet inte om den nya fallback-koden körs på Billys konto eller om den native-appen är cachad. Vi har just bett användaren bygga om — men vi har ingen synlig logg som bekräftar shift-resultatet per anrop.

## Plan för att fixa det

### 1. Räkna även `team_id='project'` BSA som riktig schema-källa när det finns *ingen* annan riktig BSA på samma bokning+datum

I `handleGetBookings`:
- Utöka `realBsaForShifts` till att inkludera `team_id='project'` *när* den raden representerar en faktisk arbetsdag (dvs ingen annan team-rad finns). Eller enklare: bygg `shiftDateKeys` från **alla** BSA (förutom `location-`-bokningar), inte bara real-team-rader. Visibility-filtret för bokningar lämnas oförändrat.
- Justera `assignment_dates`-uträkningen så att även project-rader bidrar med datum när bokningen redan är synlig via en annan riktig BSA i samma stora projekt.

### 2. Härleda shifts från bokningens egna fas-datum när BSA finns men ingen CE matchar

Fallback finns redan men nås bara via `shiftDateKeys`. Säkerställ att alla BSA-datum för en synlig bokning hamnar i `shiftDateKeys`, även om BSA-raden är `team_id='project'`.

### 3. Lägg till strukturerad loggning per anrop

I `handleGetBookings`, logga:
```
[get_bookings] per-booking shift breakdown:
  bookingId, assignmentDates, shiftKeys, ceMatched, fallbackCreated
```
Så att nästa gång användaren rapporterar "tisdag är tom" kan vi öppna loggarna och direkt se om API:t returnerar shiften eller inte (utskillnad mellan server- och klientproblem).

### 4. Verifiera mot live-API

Efter ändring: anropa `mobile-app-api` med `action=get_bookings` för Billy och bekräfta att svaret innehåller shifts för 04-27, 04-28 och 04-29 på båda bokningar (totalt 6 shifts förutom 04-29/2603-9 som är project-only och därmed också ska vara med efter fix 1).

## Tekniska detaljer

**Filer som ändras:**
- `supabase/functions/mobile-app-api/index.ts` (`handleGetBookings`, ca rad 755–1200)

**Inga UI-ändringar** behövs — `useShiftsByDate` + `MobileDayView` grupperar redan korrekt på `start_time`-datumet.

**Inga DB-ändringar** behövs — bristen är i hur API:t bygger shifts från befintliga BSA-rader.

## Vad användaren kommer märka

Efter att appen byggts om (eller via webbläsare på `/m/login`):
- Tisdag 28 april: Billy ser sina två jobb (Tiomila 2603-9 + 2602-15) på Team 3.
- Onsdag 29 april: Billy ser båda jobben (även det project-tilldelade 2603-9).
- Tider visas som 08:00 (från bokningens rig_start_time, normaliserat till naivt UTC-värde).
