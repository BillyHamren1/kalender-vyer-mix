# Plan: stoppa gamla workday-timers som inte går att avsluta

## Mål
Fixa att gamla arbetspass/timers kan ligga öppna i evigheter och fortsätta påverka `/staff-management/time-reports`, även när de inte går att stoppa från appen.

## Vad jag har verifierat
- Det finns verkliga öppna poster i databasen, inte bara ett UI-fel.
- Både `workdays` och `active_time_registrations` ligger öppna för länge.
- `close-stale-workday-entries` stänger idag gamla `location_time_entries`, `travel_time_logs` och `time_reports`, men **stänger inte gamla `workdays`** längre — den flaggar bara dem.
- `mobile-app-api` kan fortfarande auto-skapa `workdays` via `ensureOpenWorkdayForTimer(...)` när aktiviteter/tidrapporter startas.
- `/staff-management/time-reports` läser fortfarande `workdays` i `get-staff-day-status`, så öppna spökposter fortsätter synas där.

## Implementering

### 1. Inför server-side cleanup för fastnade aktiva timerregistreringar
Uppdatera backend så att gamla `active_time_registrations` inte kan ligga kvar öppna obegränsat.
- Utöka `close-stale-workday-entries` med en separat sektion för `active_time_registrations`
- Stäng endast tydligt övergivna poster
- Sätt tydlig `stop_source`/metadata så det går att se att de tvångsstängts
- Respektera befintliga natt-/säkerhetsregler så vi inte kapar legitima nattpass

### 2. Inför säker cleanup för gamla öppna `workdays`
Stoppa att workdays bara flaggas men fortsätter leva för alltid.
- Lägg in regel för att stänga **uppenbart övergivna** öppna `workdays`
- Om aktiv registrering fortfarande finns: stäng den först eller synka sluttiden konsekvent
- Om ingen aktiv registrering finns: stäng workday direkt med säker clamp
- Behåll review/flag-diagnostik så admin kan se vad som gjordes

### 3. Förhindra återkomst från auto-repair/autostart-vägar
Täta de servervägar som kan skapa om problemet.
- Granska och strama åt `ensureOpenWorkdayForTimer(...)` i `mobile-app-api`
- Säkerställ att en ny workday inte auto-skapas när situationen egentligen är en gammal övergiven rad som borde städas bort först
- Skydda `auto_repair_from_timer_or_gps` så den inte återintroducerar spök-workdays för gamla dagar

### 4. Skydda `/staff-management/time-reports` mot gamla spökrader
Gör admin-vyn robust även om dålig historisk data finns kvar.
- Justera `get-staff-day-status` så urval/prioritering av workday inte låter en gammal öppen rad dominera dagens snapshot
- Säkerställ att dagens vy i första hand speglar dagsrelevant data, inte en veckogammal öppen rad

### 5. Lägg till regressionstester
Skapa testfall för exakt detta fel.
- Gammal öppen `active_time_registration` ska stängas av cleanup
- Gammal öppen `workday` utan aktiv timer ska stängas
- Gammal öppen `workday` med gammal aktiv timer ska inte fortsätta oändligt
- Ny legitim dagsstart ska fortfarande fungera
- `/staff-management/time-reports` ska inte visa en gammal spökdag som aktiv dagsstatus

### 6. Rensa redan fastnade poster
Efter kodfixen, kör en kontrollerad datastädning för nuvarande öppna spökrader.
- Stäng redan fastnade `active_time_registrations`
- Stäng redan fastnade `workdays`
- Märk raderna tydligt som system-cleanup så de går att följa upp

## Tekniska detaljer
Berörda områden:
- `supabase/functions/close-stale-workday-entries/index.ts`
- `supabase/functions/mobile-app-api/index.ts`
- `supabase/functions/get-staff-day-status/index.ts`
- nya/uppdaterade tester för edge/backend-flöden
- sannolikt en migration för säker engångsstädning av redan öppna spökrader

## Förväntat resultat
- Gamla timers/workdays kan inte längre rulla vidare i dagar
- Backend stoppar övergivna poster även om appen inte lyckades stoppa dem
- `/staff-management/time-reports` slutar visa spökaktiva dagar från gammal data
- Problemet kommer inte tillbaka via samma auto-start/auto-repair-vägar