## Problem

I mobilens "Dagens tidslinje" (`StaffGanttMirrorTimeline`) anropas edge-funktionen `get-staff-presence-day` via `useStaffGanttMirror` → `supabase.functions.invoke(...)`.

Funktionen kräver en Supabase-JWT (kallar `userClient.auth.getUser()` på Bearer-token). Mobilappen är inloggad med **mobil-token** (base64 `{staffId, expiresAt}`, ej JWT), inte med Supabase Auth. Resultat: 401 `unauthorized` → komponenten visar "Kunde inte hämta tidslinjen (Edge Function returned a non-2xx status code)".

Detta är samma mönster som tidigare lösts för `get-staff-day-status` m.fl. via `_shared/staff-auth.ts` (memory: `staff-snapshot-dual-auth-v1`). `get-staff-presence-day` har bara aldrig konverterats.

## Lösning

### 1. Edge function: `supabase/functions/get-staff-presence-day/index.ts`
Byt nuvarande inline-auth (rad ~195–220) mot `authenticateStaffRequest` från `_shared/staff-auth.ts`:

- Stöder både mobile token och Supabase JWT (samt admin view-as via `x-view-as-staff`).
- För `mode === 'mobile'`: använd `auth.staffId` som default när `body.staffId` saknas, och kräv att `body.staffId === auth.staffId` (eller view-as redan löst i staff-auth).
- För `mode === 'jwt'`: behåll dagens beteende — `body.staffId` krävs, `organizationId` tas från auth (privilegierad eller självkontroll).
- Använd `auth.admin`-klienten (redan service-role) — ta bort den lokala `createClient(... SERVICE_ROLE)`.

### 2. Frontend: `src/hooks/useStaffGanttMirror.ts`
Byt `supabase.functions.invoke('get-staff-presence-day', ...)` mot `callStaffSnapshotFunction('get-staff-presence-day', ...)` (lägg till `'get-staff-presence-day'` i `StaffSnapshotFunctionName`-unionen i `src/services/staffSnapshotApi.ts`).

Då skickas mobil-token automatiskt när användaren är inloggad via `MobileAuthContext`, och Supabase-JWT när admin/web kör.

### 3. Verifiering
- Typecheck.
- `supabase--curl_edge_functions` mot `/get-staff-presence-day` med en mobile token (samma teststeg som övriga snapshot-funktioner).
- Ladda om mobilens "Dagens tidslinje" och bekräfta att felet försvinner (eller blir `Inga händelser registrerade ännu`).

## Vad som INTE ändras

- Ingen Time-Engine-logik, ingen GPS-pipeline, ingen Gantt-rendering, inga blockbyggare.
- Admin-flödet (`/staff-management/time-reports`) fortsätter fungera oförändrat via Supabase-JWT-grenen.
- Inga DB-migrationer.

## Filer som ändras

- `supabase/functions/get-staff-presence-day/index.ts` (auth-block)
- `src/services/staffSnapshotApi.ts` (lägg till funktionsnamn i union)
- `src/hooks/useStaffGanttMirror.ts` (byt invoke → callStaffSnapshotFunction)
