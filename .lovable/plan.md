
# Auto-spara tidrapport vid timer-stopp

## Problem
När man stoppar en timer i ett projekt navigeras man till tidrapporteringssidan och måste manuellt fylla i formuläret. Användaren vill att tiden sparas automatiskt baserat på timerns start- och stopptid.

## Lösning
När timern stoppas beräknas arbetstiden automatiskt (stopptid minus starttid) och en tidrapport skapas direkt via API:t utan att behöva fylla i formuläret. En bekräftelse visas med hur lång tid som sparades.

## Hur det fungerar för användaren

1. Tryck "Starta timer" i ett jobb -- timer börjar räkna
2. Tryck "Stoppa" -- tiden sparas automatiskt till det jobbet
3. En toast visar "Tidrapport sparad: 4.5h" som bekräftelse
4. Ingen omdirigering till formulärsidan behövs längre

## Tekniska ändringar

### `src/pages/mobile/MobileJobDetail.tsx`
- Ändra `handleTimerToggle` så att vid stopp:
  - Hämta timerns startTime och beräkna hours_worked (differens i timmar)
  - Dra av 0.5h rast om arbetstiden överstiger 5h (standard)
  - Anropa `mobileApi.createTimeReport()` med booking_id, report_date (dagens datum), start_time, end_time, hours_worked
  - Visa toast med bekräftelse ("Tidrapport sparad: Xh")
  - Ta BORT navigeringen till `/m/report`

### `src/pages/mobile/MobileTimeReport.tsx`
- Ändra `onStop`-hanteraren för aktiva timers i tidrappportvyn:
  - Samma auto-save-logik: beräkna tid, spara direkt
  - Ta bort "fyll i tidrapporten"-meddelandet
  - Visa bekräftelse-toast istället

### Ingen ändring behövs i:
- `useGeofencing.ts` (timer-logiken returnerar redan startTime)
- `mobileApiService.ts` (createTimeReport-endpointen stöder redan alla fält)
- Databas (inga migreringar)

## Beräkningslogik

```text
stopTime = now()
startTime = timer.startTime (ISO-sträng)
totalHours = (stopTime - startTime) i timmar
breakTime = totalHours > 5 ? 0.5 : 0
hoursWorked = totalHours - breakTime
```

start_time och end_time formateras som "HH:mm" för att matcha befintligt API-format.
