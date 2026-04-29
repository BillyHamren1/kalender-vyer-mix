## Mål

I scanner-appen (`MobileScannerApp`) ska listan med packjobb visas i samma kalenderupplägg som tid-appens "Mina jobb" — med Dag / Vecka / Månad-toggle, datumnavigering och datum-gruppering. Sökruta + "Identifiera produkt" + scanner-headern bevaras oförändrade.

## Nuläge

- `src/pages/MobileScannerApp.tsx` listar packjobb som tre platta grupper: `In progress`, `Packed`, `Planning` (filtrerade på `searchQuery`).
- Datumkälla per packjob: `packing.booking?.rigdaydate ?? packing.booking?.eventdate`.
- Tid-appen (`src/pages/mobile/MobileJobs.tsx`) använder en återanvändbar trio:
  - `CalendarViewToggle` (day/week/month, persisterad i `localStorage`)
  - `CalendarDateNav` (← idag →)
  - `MobileDayView` / `MobileWeekView` / `MobileMonthView` — alla typade mot `ScheduledShift`, vilket inte matchar packjobb.

## Lösning

Bygg en parallell, packjobb-specifik kalender-trio som speglar tid-appens UX men jobbar mot `PackingWithBooking[]`. Återanvänd `CalendarViewToggle` och `CalendarDateNav` rakt av (de är data-agnostiska).

### Nya komponenter (`src/components/scanner/calendar/`)

1. `PackingDayView.tsx` — visar alla packjobb vars `displayDate` (rig→event-fallback) är vald dag. Renderar samma `renderPackingCard`-stil som idag (Scan / Bocka av-knappar). Tom-state med "Visa veckan"-knapp.
2. `PackingWeekView.tsx` — horisontell veckostrip (mån–sön) som visar prick/badge per dag med antal packjobb; klick byter `selectedDate`. Under stripen: lista över valda dagens packjobb (samma kort som Day).
3. `PackingMonthView.tsx` — månadsgrid (samma layout som `MobileMonthView`) med antal-badge per dag; klick → väljer datum + byter till Day-vy.
4. `usePackingsByDate.ts` (hook i `src/hooks/scanner/`) — grupperar `PackingWithBooking[]` per `yyyy-MM-dd` baserat på `rigdaydate ?? eventdate`. Exporterar `getForDate(date)`, `getCountForDate(date)`, `getDatesInRange(from,to)`. Memoiserad.

### Ändringar i `MobileScannerApp.tsx`

- Lägg till state: `viewMode: CalendarViewMode` (persisterad i `localStorage` under `scanner.calendarView`, default `'day'`) och `selectedDate: Date`.
- Ersätt nuvarande tre status-grupper (inProgress / packed / upcoming) i `home`-state med kalenderblocket:
  ```
  <CalendarViewToggle .../>
  <CalendarDateNav .../>
  {viewMode === 'day'   && <PackingDayView .../>}
  {viewMode === 'week'  && <PackingWeekView .../>}
  {viewMode === 'month' && <PackingMonthView .../>}
  ```
- Sökrutan filtrerar fortfarande hela `packings`-listan innan den skickas in i kalendervyerna (sökresultat ignorerar valt datum om query är aktiv → visa platt resultat, samma mönster som tid-appen inte har men passar här).
- `In progress`-jobb pinnas som en liten "Pågående nu"-rad ovanför kalendervyn (oavsett datum), så användaren tappar inte ett pågående jobb när hen bläddrar bort från dagens datum.
- `Identify product`-kortet och scanner-headern lämnas orörda.

### Detaljer

- Dag utan packjobb: tom-state med "Visa veckan"-knapp (parity med `MobileDayView`).
- Datum-fallback per packjob: `rigdaydate || eventdate || created_at` (sista bara så ett packjob aldrig "försvinner" från kalendern).
- Status-badge och kortlayout återanvänds från befintliga `renderPackingCard`/`getStatusBadge` — flytta dem till en delad `PackingCard.tsx` i `src/components/scanner/calendar/` för att hålla `MobileScannerApp.tsx` slim (och uppfyller fil-storleksregeln).
- `i18n`: lägg till `calendar.noPackingsThisDay` (sv: "Inga packjobb denna dag" / en: "No packings this day"). `calendar.day/week/month/showWeek` finns redan.
- Realtime/poll (`useScannerRealtime`) påverkas inte — den uppdaterar fortsatt `packings`, kalendervyerna re-renderas via memoiserad gruppering.

### Filer som skapas
- `src/components/scanner/calendar/PackingCard.tsx`
- `src/components/scanner/calendar/PackingDayView.tsx`
- `src/components/scanner/calendar/PackingWeekView.tsx`
- `src/components/scanner/calendar/PackingMonthView.tsx`
- `src/hooks/scanner/usePackingsByDate.ts`

### Filer som ändras
- `src/pages/MobileScannerApp.tsx` — byter ut listsektionen mot kalenderblocket, lyfter ut kort-rendering.
- `src/i18n/translations.ts` — ny nyckel `calendar.noPackingsThisDay`.

### Out of scope
- Ingen ändring av scanner-headern, identify-kortet, verifierings-/manuell-flödet eller datakälla (`fetchActivePackings`).
- Ingen tidslinje (timrad) — packjobb saknar tider, så Day-vyn är en datums-grupperad lista, inte en `DayTimeline`.
