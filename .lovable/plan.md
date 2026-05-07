## Problem

`get-staff-day-status`, `get-staff-month-status` och `get-staff-time-report-period` kräver Supabase JWT (`userClient.auth.getClaims(token)`). Mobilappen autentiserar med ett mobile-token (base64-JSON `{staffId, expiresAt}`) som lagras i `localStorage["eventflow-mobile-token"]`. Hooks anropar `supabase.functions.invoke(...)` som skickar den inloggade Supabase-sessionens JWT — vilket på mobilen är fel/saknas → 401/403, Time-sidan dör.

## Lösning

Edge-functions ska acceptera **båda** token-typerna. Hooks ska skicka mobile-tokenen via `fetch` när den finns, annars falla tillbaka på `supabase.functions.invoke` (admin/web).

## Ändringar

### 1. Ny shared helper — `supabase/functions/_shared/staff-auth.ts`

Exporterar `authenticateStaffRequest(req, { requestedStaffId })`:

- Plockar `Authorization: Bearer <token>`
- Detekterar mobile-token: token saknar `.` och `atob(token)` ger JSON med `staffId` + `expiresAt` → verifierar utgång → returnerar `{ mode: 'mobile', staffId, organizationId, admin }` (org slås upp via `staff_members`). Om `requestedStaffId` skickas och inte matchar → 403.
- Annars: behandlas som Supabase JWT → `getClaims()` → slår upp `profiles.organization_id` + `user_roles` → returnerar `{ mode: 'jwt', userId, organizationId, isPrivileged, admin }`.
- Plus `authorizeStaffAccess(auth, requestedStaffId)` som gör self/privileged-kontrollen för JWT-vägen och no-op för mobile (redan gated).

### 2. Uppdatera de tre edge functions

I varje `index.ts` byts auth-blocket (rader ~41–98) ut mot:

```ts
const authResult = await authenticateStaffRequest(req, { requestedStaffId: body.staffId });
if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
const access = await authorizeStaffAccess(authResult.auth, staffId);
if (!access.ok) return bad(access.err.status, access.err.error);
const orgId = access.orgId;
const admin = authResult.auth.admin;
```

Allt nedanför (DB-queries, snapshot-builders) är oförändrat — använder fortfarande `orgId` + `admin`.

Functions: `get-staff-day-status`, `get-staff-month-status`, `get-staff-time-report-period`.

### 3. Ny client helper — `src/services/staffSnapshotApi.ts`

```ts
export async function callStaffSnapshotFunction<T>(name, body): Promise<T>
```

- Försöker först läsa mobile-token (`getToken()` från `mobileApiService`)
- Om finns → `fetch(${VITE_SUPABASE_URL}/functions/v1/${name}, { method:'POST', headers:{ Authorization:'Bearer '+token, apikey:VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type':'application/json' }, body:JSON.stringify(body) })` → throw med körrelevant error vid !ok
- Om saknas → `supabase.functions.invoke(name, { body })` (admin/web fortsätter precis som idag)

### 4. Uppdatera hooks

`useStaffDaySnapshot.ts`, `useStaffMonthStatus.ts`, `useStaffTimeReportPeriod.ts` — byt:

```ts
const { data, error } = await supabase.functions.invoke('get-staff-day-status', { body });
```

mot:

```ts
const data = await callStaffSnapshotFunction<StaffDaySnapshot>('get-staff-day-status', body);
```

Felhantering bevaras (`setError(err.message)`).

### 5. Memory-anteckning

Lägg `mem://auth/staff-snapshot-dual-auth-v1` som dokumenterar att de tre snapshot-functions accepterar både mobile-token och Supabase JWT, samt att hooks går via `callStaffSnapshotFunction` (inte direkt `functions.invoke`). Lägg referens i `mem://index.md`.

## Acceptans

- Inloggad mobile staff på `/m/time` → Idag/Kalender/Tidrapport laddar utan 401/403
- Admin på `/staff-management/time-reports` (Supabase JWT) fungerar oförändrat
- Mobile staff kan endast läsa egen `staffId` (server-gated)
- Befintliga JWT-tester och Time-reporting Quality Gate fortsätter passera

## Filer som ändras/läggs till

- ➕ `supabase/functions/_shared/staff-auth.ts` (ny)
- ➕ `src/services/staffSnapshotApi.ts` (ny)
- ✏️ `supabase/functions/get-staff-day-status/index.ts`
- ✏️ `supabase/functions/get-staff-month-status/index.ts`
- ✏️ `supabase/functions/get-staff-time-report-period/index.ts`
- ✏️ `src/hooks/useStaffDaySnapshot.ts`
- ✏️ `src/hooks/useStaffMonthStatus.ts`
- ✏️ `src/hooks/useStaffTimeReportPeriod.ts`
- ➕ `mem://auth/staff-snapshot-dual-auth-v1` + uppdatera `mem://index.md`

## Inga DB-ändringar

Ingen migration. Inga RLS-ändringar (vi går alltid via service-role efter egen auth-check, vilket är samma mönster som `workday`/`mobile-app-api`).
