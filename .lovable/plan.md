# Fix: "Laddar..."-skärmen fastnar på /projects

## Vad jag ser

- `AuthContext` loggar `SIGNED_IN` + `INITIAL_SESSION` korrekt — auth slår om till `isLoading=false`.
- `ProtectedRoute` blockerar ändå på `user && rolesLoading` och visar full-screen Loader + "Laddar...".
- `useUserRoles` har redan en 4 s `Promise.race`-timeout, men:
  - Supabase DB är degraderad just nu (systemmetadata-fetch failade med "Connection terminated due to connection timeout").
  - Om `Promise.race` av någon anledning inte hinner trigga (t.ex. fetch ligger pending i Service Worker / preview-proxy), står hela appen still — det finns ingen vägg-klocka högre upp som släpper igenom användaren.
- Console visar inget "Error fetching user roles", så queryFn har inte ens resolverat under hela observationsfönstret.

Detta är ett klassiskt single-point-of-failure: hela appens upplåsning hänger på en enda DB-fråga utan hård övre tidsgräns.

## Mål

Aldrig fastna på "Laddar..." pga. user_roles. Användaren ska antingen:
1. komma in om de har cachade/metadata-roller, eller
2. snabbt se en åtgärdbar skärm (Inga roller / Logga ut), eller
3. komma in via SSO-bypassen.

Ingen logikändring av roller, RLS eller behörighetsregler.

## Plan

### 1. `src/hooks/useUserRoles.ts`
- Sänk `ROLE_FETCH_TIMEOUT_MS` från 4000 → **2000 ms**.
- I `catch`-grenen: efter att vi returnerar `fallbackRoles`, schemalägg en mjuk bakgrundsrefetch (`setTimeout(refetch, 30_000)`) så att riktiga roller plockas upp så fort DB svarar igen. (Implementeras enklast via en `meta.onTimeout`-flagga + `useEffect` i hooken som lyssnar på `query.isError`/timeout-flagga.)
- Behåll övriga semantik (staleTime, retry: 0, cache).

### 2. `src/components/auth/ProtectedRoute.tsx` — hård säkerhetstimer
- Lägg till en lokal `safetyElapsed`-state (mönster identiskt med `ScannerProtectedRoute.tsx` som redan finns i kodbasen).
- När `user && rolesLoading` startas en `setTimeout` på **1500 ms**. När den löper ut sätts `safetyElapsed = true`.
- Render-villkoret blir: `if (user && rolesLoading && !safetyElapsed)` → visa Laddar; annars fortsätt ned i komponenten med vad vi har (tomma roller → den befintliga "Inga roller tilldelade"-skärmen med Logga ut-knapp, eller hasPlanningAccess via metadata-fallback om sådan finns).
- Lägg `console.warn('[ProtectedRoute] roles loading safety timeout — proceeding with cached/fallback roles')` när timern löper ut, så vi ser det i loggen.
- Rensa timern vid unmount / när `rolesLoading` blir false.

### 3. Test
- Utöka `src/test/useUserRoles.test.ts` med ett test som verifierar att timeout-konstanten är ≤ 2000 ms (skydd mot regression).
- Lägg `src/components/auth/__tests__/ProtectedRoute.safety.test.tsx`:
  - Mocka `useAuth` → user satt, `useUserRoles` → `{ isLoading: true, roles: [] }`.
  - Rendera ProtectedRoute, vänta 1600 ms (vitest fake timers), assert att "Laddar..." inte längre är i DOM och att "Inga roller tilldelade" syns.

## Vad jag INTE rör

- Ingen ändring av RLS-policies, user_roles-tabellen, Supabase-konfig eller AuthContext.
- Inget skip av role-check för icke-SSO-användare.
- Ingen ändring av `MobileProtectedRoute` (mobile path är inte i scope här).
- Ingen ändring av GPS-kartan eller Planning-styling från tidigare turer.

## Filer som ändras

- `src/hooks/useUserRoles.ts` (timeout 4000→2000, background re-fetch vid timeout)
- `src/components/auth/ProtectedRoute.tsx` (1.5 s safety timer)
- `src/test/useUserRoles.test.ts` (regression-guard)
- `src/components/auth/__tests__/ProtectedRoute.safety.test.tsx` (ny)
