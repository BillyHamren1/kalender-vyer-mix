# Personalkalendern — read-only webbvy

## Mål
Ny publik webbvy `/personalkalendern` som speglar exakt samma data som admin-kalendern (alla team, alla personer), helt read-only. Inloggning med samma email+lösen som mobilappen — och Supabase auth-användare (admin) går också in. Startvy = veckovy med dagens dag i fokus.

## Arkitektur

### 1. Route + auth-wrapper
- Ny route `/personalkalendern` (publikt path, utanför `/m/*` och utanför admin-sidebar-shellet).
- Ny `DualAuthProvider` som accepterar **antingen** Supabase JWT (admin) **eller** mobile auth-token (personal). Skickar vidare en `viewerOrgId` till sidan.
- `DualAuthLoginPage` på `/personalkalendern/login` med samma e-post+lösen-flöde som `MobileLogin` (återanvänder `mobile-app-api` `auth.login`-action). Om Supabase-session redan finns → hoppa över login.

### 2. Sidan `PersonalkalendernPage`
- Återanvänder befintlig `CustomCalendar` med `viewMode="weekly"`.
- `currentDate` = `startOfWeek(today, { weekStartsOn: 1 })` (måndagsvecka, idag synlig).
- Sätter följande props för att tvinga read-only:
  - `setEvents` utelämnas
  - `onStaffDrop`, `onOpenStaffSelection`, `onToggleTeamForDay` utelämnas
  - `isEventReadOnly={() => true}` (befintligt prop som redan finns i CustomCalendar)
  - `onEventClick` utelämnas (eller pekar på enkel detalj-popover utan edit)
- Hämtar samma data som `CustomCalendarPage` via `useRealTimeCalendarEvents` + `useTeamResources`.
- Header med veckonavigation (← idag →) men inga edit-knappar.

### 3. Sidebar-länk
- Lägg till "Personalkalendern (publik)" under befintlig "Personalplanering" i `Sidebar3D.tsx` med ikon `ExternalLink` så admin enkelt kan öppna och dela URL.

### 4. Edge function
- Ingen ny edge function behövs. Inloggning för personal går via befintliga `mobile-app-api` med `action: 'auth.login'`. Token sparas i localStorage under nytt nyckelnamn `staff_calendar_session_v1` för att inte kollidera med `/m/*`.

### 5. Tester
- `personalkalendern.dual-auth.test.ts` — verifierar att både mobile-token och Supabase-session släpps in.
- `personalkalendern.read-only.test.tsx` — renderar sidan, klickar på event → ingen edit-dialog öppnas.
- Snapshot på defaultvy = vecka med dagens datum centrerat.

## Tekniska detaljer

```text
/personalkalendern              → dual-auth gate → CustomCalendar (read-only)
/personalkalendern/login        → email+lösen → mobile-app-api auth.login
                                  ELLER redirect till Supabase /auth om admin-session finns
```

Filer:
- `src/pages/PersonalkalendernPage.tsx` (ny, ~120 rader)
- `src/pages/PersonalkalendernLogin.tsx` (ny, ~80 rader)
- `src/auth/DualAuthProvider.tsx` (ny, ~90 rader) — kombinerar `useAuth` + `useMobileAuth`
- `src/App.tsx` — lägg till routes ovanför `/m/*`
- `src/components/Sidebar3D.tsx` — lägg till länk
- `src/__tests__/personalkalendern.*.test.tsx` (ny)

Ingen DB-migration. Ingen ny RLS-policy (samma data som admin redan ser; läsande mobile-token är redan godkänt via befintliga calendar-event-readers).

## Vad som INTE ingår
- Mobiloptimerad layout (samma `useIsMobile`-fork som befintlig sida — ärvs gratis).
- Filter, sökning, eller team-toggles (ren spegling).
- Push-notiser eller realtid utöver det `useRealTimeCalendarEvents` redan ger.
