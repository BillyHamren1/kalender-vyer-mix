
Mål: isolera varför scanner-appen inte kan logga in, utan att röra annan funktionalitet.

Vad jag hittade
- `src/services/mobileApiService.ts` gör login via vanlig `fetch()` till `https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/mobile-app-api`.
- `supabase/functions/mobile-app-api/index.ts` har fungerande login-path för `action === 'login'` och kräver ingen token där.
- Previewen visar aktiv trafik mot `scanner-api` med giltig scanner-token, så backend/Supabase är inte generellt nere.
- Android-konfigurationen har `network_security_config.xml`, men det finns ingen extra native loggning eller diagnostik kring WebView/fetch/TLS-fel.
- Tidigare minnesinfo säger att scanner-appen haft problem med WebView-nätverk/SSL/systemtid tidigare, vilket stämmer bättre med “fungerar inte i appen” än med ett rent backend-fel.

Mest sannolik orsak
- Felet sitter troligen inte i själva login-logiken i edge function, utan i native Android/WebView-nätverkslaget för just scanner-appen:
  1. gammal native build som inte innehåller senaste web-koden
  2. fel app-mode/build synkad till Android
  3. SSL/certifikat/systemtid-problem i WebView
  4. fetch-fel i appen som idag maskeras till ett generellt “Kunde inte nå servern”

Plan för fix
1. Lägg till strikt, minimal diagnostik endast för scanner-login-flödet:
   - i `src/services/mobileApiService.ts`: logga action, URL, native/web, feltyp, `error.message`, samt om det är `TypeError`/timeout.
   - i `src/pages/scanner/ScannerLogin.tsx`: logga när submit startar/slutar och exakt felmeddelande som visas.
   - inga funktionsändringar, bara debug-output.

2. Lägg till native Android-loggning för WebView-nätverk/TLS:
   - i `android/app/src/main/java/se/eventflow/scanner/MainActivity.java`
   - behåll nuvarande plugin- och bridge-struktur
   - lägg bara till en `WebViewClient`-hook för att logga:
     - `onReceivedError`
     - `onReceivedHttpError`
     - `onReceivedSslError`
   - detta gör att vi kan se om appen fastnar på certifikat, DNS, timeout eller annan WebView-nivå.

3. Kontrollera scanner native build-pathen:
   - verifiera att scanner-appen verkligen byggs med scanner-konfiguration (`capacitor.scanner.config.ts`, `build:scanner`, `android:scanner`)
   - om implementationen godkänns: ingen refaktor, bara säkerställ att appen kör senaste scanner-build innan felsökning fortsätter.

4. Kontrollcheck efter implementation
   - loginförsök i scanner-app
   - verifiera att minst ett av följande syns:
     - frontend-logg för `mobileApi → login`
     - Android-logg för requestfel/SSL-fel
     - edge-function-logg för `incoming action=login`
   - om edge-function-logg aldrig syns vid loginförsök är felet före backend, alltså native nätverk/WebView.
   - om edge-function-logg syns men svar blir 401/403/500, då går vi vidare i backendspåret.

Förväntat utfall
- Vi får ett exakt svar på om login-förfrågan:
  - aldrig lämnar appen
  - blockeras av SSL/WebView
  - når edge function men fallerar där
- Därefter kan jag göra en riktad fix istället för att gissa.

Tekniska filer som påverkas
- `src/services/mobileApiService.ts`
- `src/pages/scanner/ScannerLogin.tsx`
- `android/app/src/main/java/se/eventflow/scanner/MainActivity.java`

Viktigt
- Jag planerar inte att ändra auth-logik, token-format, Supabase-konfiguration eller edge-function-beteende i detta steg.
- Jag planerar inte heller att röra DataWedge eller annan scannerfunktionalitet.
