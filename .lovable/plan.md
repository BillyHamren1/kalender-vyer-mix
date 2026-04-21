

## Mobil kalendervy på /m — Dag/Vecka/Månad

### Mål
Lägg en växlingsbar kalendervy överst på mobilappens startsida (`/m`). Standard = **Dagsvy**. Användaren kan toggla till **Vecka** eller **Månad**. Befintlig joblista, timer-banner, geofence-logik och Lager-sektion behålls oförändrade under kalendern.

### Komponenter (nya)

- `src/components/mobile-app/calendar/CalendarViewToggle.tsx` — segmentkontroll (Dag / Vecka / Månad), persisterar val i `localStorage` (`mobile.calendarView`).
- `src/components/mobile-app/calendar/CalendarDateNav.tsx` — `< [datumetikett] >` + "Idag"-knapp. Etiketten anpassar sig till vy (t.ex. "tis 22 apr", "v.17 · 21–27 apr", "april 2026").
- `src/components/mobile-app/calendar/MobileDayView.tsx` — visar pass/bookings/shifts för **valt datum**. Återanvänder befintliga jobbkort från `MobileJobs` (extraherar listrenderingen till `JobCardList` som tar `items`).
- `src/components/mobile-app/calendar/MobileWeekView.tsx` — 7-dagars stripe (mån–sön) med pricks-/sifferindikatorer per dag + agendalista under vald dag. Tap på dag → byter `selectedDate`.
- `src/components/mobile-app/calendar/MobileMonthView.tsx` — månadsgrid (6 rader × 7), prick per dag som har pass, markering för idag/valt datum. Tap på dag → byt till Dagsvy med det datumet.
- `src/components/mobile-app/calendar/JobCardList.tsx` — extraherad listrendering från nuvarande `MobileJobs` (oförändrad UI per kort).

### Hook (ny)

- `src/hooks/useBookingsByDate.ts` — tar `bookings` + `shifts` (från befintlig `useScheduledShifts` / `mobile-bookings`-data som redan finns i `MobileJobs`) och returnerar `Map<YYYY-MM-DD, JobItem[]>` + helpers `getForDate(date)`, `getCountsForRange(start,end)`. Ingen ny nätverkstrafik — gruppering sker klient-side på redan hämtad data.

### Ändringar

- `src/pages/mobile/MobileJobs.tsx`:
  - Lägg till `viewMode` state (`'day' | 'week' | 'month'`, default `'day'`, persistent).
  - Lägg till `selectedDate` state (default = idag).
  - Renderingsordning överst→ner:
    1. `CalendarViewToggle`
    2. `CalendarDateNav`
    3. `MobileDayView` / `MobileWeekView` / `MobileMonthView` beroende på `viewMode`
    4. Befintlig timer-banner, "Lager"-sektion, restsection oförändrade.
  - Befintlig "alla pass i en lång lista"-rendering ersätts av Dagsvyn (visar bara dagens pass). Om användaren vill se framtida pass byter de till Vecka/Månad.

- `src/i18n/sv.json` + `en.json` — nya nycklar:
  - `calendar.day` / `calendar.week` / `calendar.month` / `calendar.today`
  - `calendar.noJobsToday` / `calendar.noJobsThisDay` / `calendar.weekShort` (`v.`)

### UX-detaljer

- **Veckostrip**: alltid mån–sön (svenskt format), aktuell dag har cirkel, vald dag har fylld bakgrund. Liten siffra under datumet = antal pass den dagen.
- **Månadsgrid**: kompakt, ~44px celler, prick under datumet om pass finns. Swipe vänster/höger byter månad (use `useSwipeable`-mönster om det redan finns; annars knappar i `CalendarDateNav` räcker).
- **Tom dag**: visa centrerat "Inga pass denna dag" + knapp "Visa veckan".
- **Inga nya datakällor**: vyerna konsumerar exakt samma data som dagens lista (`useScheduledShifts` + bookings). Garanterar att timers, geofence och realtime-uppdateringar fortsätter fungera.

### Validering

- A: Användare öppnar `/m` → ser Dagsvy med dagens pass. Default-vy korrekt.
- B: Toggle till Vecka → ser veckostrip + agenda för vald dag. Tap på torsdag → agenda uppdateras.
- C: Toggle till Månad → ser månadsgrid med prickar. Tap på 28 apr → byter till Dagsvy/28 apr.
- D: "Idag"-knapp återställer `selectedDate` till nu i alla vyer.
- E: Timer-banner och Lager-sektion fortsätter visas under kalendern oavsett vy.
- F: Val av vy överlever sidladdning (localStorage).
- G: Inga extra API-anrop — verifierat via Network tab.

