## Mål
Stoppa den belastning som gör att appen fastnar i laddning och att databasen/edge functions matas konstant när man står på `/projects`.

## Vad jag har isolerat
1. **Automatisk bokningsimport kör globalt på projektrutter**
   - `App.tsx` monterar `useBackgroundImport()` globalt.
   - `useBackgroundImport.ts` kör `import-bookings` automatiskt på rutter som börjar med `/projects`.
   - Den triggar efter 1 sekund och sedan var 30:e sekund.
   - Detta kan orsaka kontinuerliga `import-bookings`-körningar, query-invalidations och ny omladdning av projektlistor.

2. **GPS-uppladdning kör från webbpreviewn och timeoutar/retryar**
   - Nätverksloggen visar återkommande `mobile-app-api` `upload_location_batch` från webben.
   - `useGeofencing.ts` använder `navigator.geolocation.watchPosition` på web och enqueuar GPS-punkter som flushas till `mobile-app-api`.
   - När dessa timeoutar fortsätter kön att retrya, vilket skapar extra tryck och brus.

## Plan
### 1) Stoppa aggressiv auto-import på `/projects`
- Begränsa eller stänga av automatisk `useBackgroundImport()` för projektsidan.
- Behålla manuell uppdatering via knappen **Uppdatera** i `ProjectManagement.tsx`.
- Säkerställa att import inte går i bakgrunden bara för att användaren tittar på projektlistan.

### 2) Stoppa web-preview från att skicka GPS-batcher i onödan
- Gå igenom web-vägen i geofencing/location reporting.
- Sätta guard så att webbpreviewn inte startar eller flushar GPS-uppladdningar när den inte används som faktisk Time-app.
- Målet är att `/projects` i webbläget inte ska trigga `upload_location_batch`-stormar.

### 3) Minska risken att projektsidan ser "fastlåst" ut
- Se över laddningsbeteendet i projektvyerna (`ProjectManagement`, `UnifiedProjectList`, dashboard-widgets).
- Förhindra att sidan hoppar tillbaka till full loading state vid varje invalidation när gammal data redan finns.
- Behålla senaste data synlig medan ny hämtning pågår.

### 4) Verifiering
- Testa i preview direkt efter ändringarna.
- Kontrollera att `/projects` inte längre genererar återkommande import-/GPS-anrop.
- Bekräfta att sidan laddar klart och förblir stabil.
- Köra relevanta tester för regressionsskydd.

## Tekniska detaljer
Berörda filer blir sannolikt främst:
- `src/App.tsx`
- `src/hooks/useBackgroundImport.ts`
- `src/hooks/useGeofencing.ts`
- eventuellt projektlistans query-komponenter för laddningsbeteendet

Om du godkänner planen implementerar jag direkt och verifierar i preview efter varje ändring.