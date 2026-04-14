
Mål: få scanner-inloggningen robust igen utan att behöva jaga “nätverksfel” i blindo.

Vad jag ser nu
- Edge function-loggarna visar tydligt: `incoming action=login, hasData=false`
- Samma loggar visar kraschen: `Cannot destructure property 'password' of 'data' as it is undefined`
- Alltså: anropet når faktiskt `mobile-app-api`, så detta är inte främst ett nätverks/ATS-problem. Felet är att backend får fel payload-shape för login och kraschar.

Do I know what the issue is?
- Ja. Scannerappen skickar vid login ett request där `action=login` finns, men `data` saknas. Nuvarande backend förutsätter `data.password` och kastar därför 500. Det känns “som nätverksfel” i appen, men grundfelet är en backend-krasch på login.

Plan
1. Härda `mobile-app-api` mot gamla/avvikande login-payloads
- Fil: `supabase/functions/mobile-app-api/index.ts`
- Normalisera request body tidigt:
  - stöd både nuvarande format: `{ action, token, data: {...} }`
  - och legacy/flat format: `{ action, token, email, username, password, ... }`
- Skapa en gemensam `requestData` från `body.data ?? legacyFields` och skicka den till handlers.

2. Gör `handleLogin` krocksäker
- Fil: `supabase/functions/mobile-app-api/index.ts`
- Ändra login-handlern så den aldrig destructurar från `undefined`
- Om email/username/password saknas ska den returnera tydlig `400` istället för att krascha med `500`

3. Behåll bakåtkompatibilitet för installerade scannerbyggen
- Samma backend-fix gör att även äldre native builds som skickar flat payload kan logga in direkt
- Det här är viktigt eftersom scannerappen kan köra ett äldre lokalt bundle än nuvarande kodbas

4. Lägg in bättre diagnostik i edge function
- Logga bara säkra metadata:
  - `action`
  - om `data` finns
  - vilka body-nycklar som kom in
- Aldrig lösenord eller andra hemliga värden
- Det gör framtida loginfel mycket snabbare att felsöka

5. Verifiering efter fix
- Testa `/scanner/login` i webbläsaren
- Testa den faktiska scannerappen igen
- Bekräfta att edge-loggar nu visar `hasData=true` eller att legacy-payload normaliseras korrekt
- Bekräfta att felmeddelande blir korrekt vid fel lösenord, istället för “Load failed”

Teknisk riktning
```text
Nu:
const { action, token, data } = body
if (action === 'login') return handleLogin(supabase, data)

Efter fix:
const { action, token, data, ...legacy } = body
const requestData = data ?? legacy
if (action === 'login') return handleLogin(supabase, requestData)
```

Berörda filer
- `supabase/functions/mobile-app-api/index.ts`

Valfri men bra extra-säkring
- Lägg till ett edge function-test för login med:
  - nested `data`
  - flat payload
  - saknat password
- Då fångar vi exakt den här regressionen nästa gång

Förväntat resultat
- Scannerappen kan logga in igen
- Backend blir robust även om en installerad app skickar äldre request-format
- “Nätverksfel: Load failed” försvinner i detta flöde eftersom login inte längre kraschar server-side
