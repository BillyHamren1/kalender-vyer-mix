# Planner-vy i mobilappen — för systemanvändare

## Insikt från datan

De fyra som ska se Planner-vyn (Billy, Joel, Nana, Ranjan) har alla **minst en roll i `user_roles`** — `admin`, `forsaljning`, `projekt` eller `lager`. De övriga 18 aktiva i `staff_members` har **inga** `user_roles` alls; de finns bara i mobilappen för att rapportera tid.

**Behörighetsregeln blir alltså enkel och rätt:**

> En användare är "Planner" om de har **minst en rad i `user_roles`** (oavsett vilken av rollerna).

Det matchar exakt "de som kan logga in på webben" — för det är just det `user_roles` markerar i systemet idag.

Ingen ny roll behövs. Ingen hårdkodad lista. Inget val mellan `admin` vs `projekt` vs `forsaljning` — alla fyra rollerna ger samma access till översiktsvyn.

---

## Steg 1 — Backend: exponera roller i `mobile-app-api`

I `supabase/functions/mobile-app-api/index.ts` → `handleMe`:

- Efter att `staff_members` hämtats: om `staff.user_id` finns, slå upp `user_roles` för den `user_id`.
- Returnera `app_roles: AppRole[]` (tom array om inget finns) på `MobileStaff`-payloaden.
- Lägg till `is_planner: boolean` (= `app_roles.length > 0`) som beräknad bekvämlighetsflagga, så frontend slipper duplicera regeln.

## Steg 2 — Backend: tre nya overview-actions

Alla tre kräver `is_planner === true` (annars 403). Alla filtrerar strikt på `organization_id` (RESTRICTIVE RLS-policy).

1. **`get_overview_calendar`** — hämtar `calendar_events` för valt datumintervall (default: idag ±14 dagar) för hela organisationen, oavsett team. Inkluderar event_type, title, start/end, color, booking_id, project_id.
2. **`get_overview_assignments`** — hämtar `booking_staff_assignments` för bokningarna i intervallet, joinat med `staff_members` (namn, role i BSA: field/project_manager/etc). Grupperat per booking.
3. **`get_overview_threads`** — hämtar aktiva projekttrådar (broadcasts/internalnotes från projects + large_projects + bookings de senaste 30 dagarna), med senaste meddelandet och oläst-räknare.

## Steg 3 — Frontend: `useMobileRoles`

Ny hook `src/hooks/mobile/useMobileRoles.ts`:
- Läser `app_roles` + `is_planner` från `mobileApiService.getMe()`-payloaden (cachat via React Query).
- Returnerar `{ roles, isPlanner, isLoading }`.
- Inga nya nätverksanrop — piggybackar på befintligt `me`-anrop.

## Steg 4 — Frontend: `PlannerOnlyRoute`

`src/components/mobile-app/PlannerOnlyRoute.tsx` — wrapper som redirectar till `/m` om `!isPlanner`. Används för `/m/overview/*`.

## Steg 5 — UI: villkorlig "Översikt"-tab i `MobileBottomNav`

I `src/components/mobile-app/MobileBottomNav.tsx`:
- Hämta `isPlanner` via `useMobileRoles`.
- Om `isPlanner`: byt ut "Verktyg" mot "Översikt" som femte tab (eller lägg in den mellan Meddelanden och Verktyg och håll 5 tabbar genom att slå ihop Profil i en menyflik). 
- **Förslag**: behåll 5 tabbar — ersätt **"Verktyg"** för planners (de använder verktygen från web). Fältarbetarna ser oförändrad nav.
- Ikon: `LayoutGrid` eller `Eye`.

## Steg 6 — Sida: `MobileOverview` med tre flikar

Ny `src/pages/mobile/MobileOverview.tsx` med tabs:

1. **Kalender** — kompakt dagsvy/veckovy. Återanvänd `useRealTimeCalendarEvents` om möjligt; annars konsumera `get_overview_calendar`. Tap på event → går till befintlig event-detalj via `useEventNavigation` (som redan prioriterar large project hub).
2. **Bemanning** — lista per dag → per booking → personal med BSA-roll-badge (FÄLT/PL/etc).
3. **Meddelanden** — enad inkorg över alla projekt-trådar; tap öppnar befintlig tråd-vy.

## Steg 7 — Routing

I `src/App.tsx` (eller mobil-shell-routern): lägg in `/m/overview` skyddad av `PlannerOnlyRoute`, med nestade rutter `/m/overview/calendar`, `/m/overview/staffing`, `/m/overview/messages`.

## Steg 8 — Tester

- `mobileApi.handleMe.appRoles.test.ts` — verifierar att `app_roles` + `is_planner` returneras korrekt för (a) staff utan user_id, (b) staff med user_id men utan user_roles, (c) staff med en roll, (d) staff med flera roller.
- `mobileOverview.roleGating.contract.test.ts` — verifierar att `isPlanner = app_roles.length > 0` (regeln "har någon systemroll").
- `mobileOverview.routeGuard.contract.test.ts` — verifierar att `PlannerOnlyRoute` redirectar icke-planners.

## Vad som **inte** ändras

- `staff_members` rörs inte. Inga nya kolumner, ingen ny roll-tabell.
- Web-kalendern (`/calendar`) påverkas inte.
- Befintliga mobile-actions (jobs, time, messages för individen) är oförändrade — Planner ser sin egen vanliga vy + en extra "Översikt"-tab.
- Ingen ny inloggningsflik eller separat app — samma `/m/`-shell.

## Resultat

- **Billy, Joel, Nana, Ranjan** ser "Översikt"-fliken automatiskt nästa gång de loggar in i appen — utan ny config eller manuell inställning.
- **Övriga 18** märker ingen skillnad alls.
- Om någon framöver får en `user_roles`-rad (t.ex. ny säljare läggs till i webben) får de Översikt-fliken automatiskt.
