# Plan för att fixa personalkalendern på webben

## Problem
I webbens personalkalender (`/calendar`) syns personal direkt när man planerar dem, men efter refresh försvinner de. Det pekar på ett fel i synken mellan optimistic UI, cachning och återläsning från databasen.

## Jag kommer att fixa

### 1. Göra staff-assignment stabil efter save
I `useUnifiedStaffOperations` lägger jag till korrekt cache-invalidering efter lyckad assign/remove så att kalendern alltid hämtar om den sparade sanningen efter ändring, istället för att leva kvar på en optimistisk lokal version.

### 2. Synka optimistic update med samma regler som refresh använder
Just nu verkar UI kunna visa en person direkt som sedan filtreras bort när sidan laddas om. Jag justerar logiken så att samma regler används både vid direktvisning och vid återläsning, så att det som syns direkt också är det som faktiskt ligger kvar efter refresh.

### 3. Säkerställa att webbkalendern lyssnar och renderar rätt dataflöde
Jag verifierar read-pathen i adminvyn `/calendar` så att rätt query keys, realtime/invalidation och rendering av staff-badges används i samma kedja.

### 4. Testa och låsa beteendet
Jag kör riktade tester för staff-kalenderflödet och lägger vid behov till testskydd för scenariot:
- planera personal
- verifiera att de finns kvar efter omhämtning
- verifiera att blockerad/otillgänglig personal inte visas inkonsekvent

## Förväntat resultat
Efter fixen ska personal som planeras i webbens personalkalender ligga kvar även efter refresh, och UI:t ska inte längre visa tillfälliga assignments som sedan försvinner.

## Tekniska detaljer
Berörda områden blir sannolikt främst:
- `src/hooks/useUnifiedStaffOperations.tsx`
- eventuellt kompletterande testfil för staff-kalenderkontraktet
- eventuellt admin-kalenderns koppling till staff assignment-data om jag hittar en felaktig invalideringskedja

Ingen backend-migration planeras i första steget om inte en faktisk RLS-/DB-regression visar sig under implementationen.