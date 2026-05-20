## Vad loggarna visar

**Mobile-app-api (mobilens enda backend) är konsekvent långsam:**
- Varje POST tar 2.4–3.0 s, även enkla `upload_location_batch`-anrop
- Till och med `OPTIONS`-preflighten tog 2.0 s (cold boot)
- Funktionsfilen är **13 432 rader** i en enda `index.ts` → väldigt lång parse/boot-tid på varje cold start
- Backgrund-GPS skickar `upload_location_batch` var ~30 s från varje inloggad mobil, så funktionen "byter ägare" konstant och blir cold för login-anropet

Det betyder att själva mobil-loginet (som går samma väg) ofta får ärva en cold start på ~2 s + DB-arbete = upplevs som "snurrar länge".

**Webb-loginet:**
- Själva `signInWithPassword` är snabbt (auth-loggen visar ~135 ms)
- Direkt efter SIGNED_IN avfyras en burst på **32 parallella requests** mot REST API innan UI:t blir interaktivt:
  - 8 × `sync_state`
  - 7 × `profiles` (samma user_id)
  - 5 × `bookings`
  - 4 × `auth/v1/user`
  - 2 × `import-bookings` (samma incremental sync triggas parallellt två gånger — syns även i konsolen: "Incremental sync: fetching bookings updated since 2026-05-20" loggas 2 gånger)
- Det är primärt dubbelarbetet + att `import-bookings` (1.2–2.1 s) körs två gånger som gör att "Laddar…"-spinnern står kvar märkbart längre än nödvändigt

**Inget databas-fel** — postgres-loggen är ren, ingen `ERROR`/`FATAL`/`WARNING` senaste timmarna. Det är ren overhead, inte trasig kod.

## Förslag (tre lager, från enkelt till större)

### 1. Stoppa dubbel-syncen vid login (snabb vinst, låg risk)
- `useBackgroundImport` kör 1 s efter mount, och något annat triggar en andra `import-bookings` samtidigt. Lägg en in-flight-lås per organisation i `importService.ts` så att samtidiga `incremental`-anrop coalescas till ett.
- Bonuseffekt: även framtida dubbel-renders/realtime-events kan inte längre fyrdubbla last på edge-funktionen.

### 2. Dedupa REST-bursten vid SIGNED_IN
- `profiles?user_id=...` hämtas 7 gånger på en sekund. Lägg den i React Query med en lång `staleTime` (5–10 min) och dela query-key, så att alla hooks som behöver `organization_id` återanvänder samma cache.
- Samma för `sync_state` (8 anrop). Hämtas i flera hooks som inte vet om varandra.
- `auth.getUser()` anropas 4 gånger — använd `useAuth()` istället för direkta `supabase.auth.getUser()` i `useBackgroundImport` m.fl.

### 3. Boot-tiden på `mobile-app-api` (största vinsten för mobilen)
- `supabase/functions/mobile-app-api/index.ts` är 13k rader. På varje cold start parsar Deno hela filen innan något händer — det är därför även `OPTIONS` tar 2 s.
- Bryt ut handlers per action (`login`, `me`, `upload_location_batch`, `get_bookings`, …) till separata filer i `supabase/functions/mobile-app-api/handlers/` och lazy-importera med dynamic `import()` inuti respektive `case`-block. `login`-pathen ska bara behöva ladda auth-modulen, inte hela kodbasen.
- Förväntad effekt: `login`-cold-start från ~2.5 s → ~400–600 ms.

### Inte med i denna omgång
- Strukturell separation av `upload_location_batch` till en egen edge-funktion (`mobile-location-ingest`) skulle ta bort cold-start-konflikten helt, men det är ett större ingrepp. Vill du, så lägger jag till det som steg 4 i en senare runda.

### Filer som troligen rörs
- `src/services/importService.ts` (in-flight lock)
- `src/hooks/useBackgroundImport.ts` (använd `useAuth`, hoppa över egen `getUser`/`profiles`-fetch)
- En ny `src/hooks/useOrganizationId.ts` som blir den enda profil-läsaren
- Hooks som idag läser `profiles` eller `sync_state` direkt → konsumerar den nya hooken
- `supabase/functions/mobile-app-api/index.ts` + ny `handlers/`-mapp
- Vitest-kontrakt: `src/test/loginBurst.contract.test.ts` (mätlar antal samtidiga REST-anrop) och `supabase/functions/mobile-app-api/handlers/__tests__/login_test.ts`

### Verifiering
- Före/efter: räkna requests vid login i nätverksloggen, mäta P95 på `mobile-app-api` via `function_edge_logs`
- Vitest + Deno-tester för edge-funktionen, samt rökhopp i preview för web-login
