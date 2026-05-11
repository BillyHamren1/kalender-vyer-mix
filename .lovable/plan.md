## Mål

Du (admin) ska kunna öppna Billys mobilapp på din telefon, slå på ett "Visa som Raivis"-läge, och se Raivis tider i alla mobilvyer (Idag / Tidrapport / Dagdetalj). Helt read-only, ingen data kopieras, inga writes, ingen risk för dubbelräkning i lön/projekt.

## Design

Klassisk **view-as / impersonering** på frontend, gated av admin-roll både i klient och edge function.

```text
[MobileAuthContext]
  staff = { id, name, ... }                ← din inloggning (oförändrad)
  viewAsStaffId  (localStorage)            ← Raivis id när läget är på
  effectiveStaffId = viewAsStaffId ?? staff.id
  isViewingAs = !!viewAsStaffId

Alla hooks (useMobileStaffDayReport,
useStaffDayStatusViaMobileReport, etc.)
läser `effectiveStaffId` istället för
`staff.id`.
```

Inget skrivs — endast `effectiveStaffId` skickas till `get-mobile-staff-day-report` och övriga read-endpoints.

## Steg

**1. MobileAuthContext utökas (read-only override)**
- Nya fält: `viewAsStaff: { id, name } | null`, `effectiveStaffId`, `isViewingAs`, `setViewAs(staff | null)`.
- `viewAsStaffId` persisteras i `localStorage` under nyckel `mobile.viewAsStaffId.v1`.
- `setViewAs` kastar fel om current user inte har admin-roll (kollas via `user_roles` likt övriga admin-checks i appen). Hämtas en gång vid login.
- En tydlig visuell flagga: röd/orange topbar "Visar som Raivis Vītols (read-only)" så du aldrig glömmer att läget är på.

**2. Hooks använder `effectiveStaffId`**
- `useMobileStaffDayReport` → byt `staff?.id` → `effectiveStaffId`.
- Övriga mobilhooks som läser per-staff-data (ankomst, dagstatus, månadsstatus, my-flags, profile-header etc.) får samma byte. Lista verifieras genom att grepa `staff?.id` / `useMobileAuth()` i `src/hooks/` och `src/components/mobile-app/`.
- **Skrivvägar (timer-start, time_reports CRUD, end-day, scanner, etc.) ska FORTSATT använda `staff.id`** (din riktiga id) — aldrig `effectiveStaffId`. Skrivs från en separat selector `useRealStaffId()` så det är omöjligt att råka skriva på Raivis vägnar.

**3. UI: "Visa som"-väljare**
- Ny rad i mobilappens settings-vy `/m/settings`: "Visningsläge (admin)".
  - Sökfält över `staff_members` i din org.
  - Knapp "Återställ till mig själv".
- Endast synlig om current user har admin-roll.
- När aktivt: persistent badge i `MobileHeader` ("👁 Visar Raivis · Avsluta").

**4. Edge function-tillgång**
Ingen ändring behövs:
- Du loggar in med Supabase JWT (admin/web-session) → `authorizeStaffAccess` släpper igenom alla `staffId` i din org redan idag.
- Om du istället är inloggad via mobile-token i mobilappen: backend blockar (`Staff may only read self`). Då måste vi lägga till en explicit override — se Tekniska detaljer nedan. Detta sker bara vid behov.

**5. Säkerhetsspärrar**
- `setViewAs` blockas om mål-staff tillhör annan organisation (klient-sida + backend RLS täcker detta).
- Override rensas automatiskt vid logout.
- Override rensas om current user förlorar admin-rollen.
- En tydlig konsol- och toast-varning loggas varje gång override sätts/avslutas.

## Vad som INTE händer

- Inga writes till `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`, `staff_day_report_cache`.
- Inga rader kopieras.
- Lön och projektkostnad påverkas inte (datan ligger fortsatt på Raivis staff_id).
- Skanner / timer-start / EOD påverkas inte — de använder `useRealStaffId()`.

## Acceptance criteria

1. Du loggar in i mobilappen som dig själv → ingen synlig skillnad.
2. Du går till `/m/settings` → ser "Visningsläge (admin)" → väljer Raivis.
3. Topbar visar "👁 Visar Raivis (read-only)".
4. `/m/today`, `/m/report`, `/m/day/:date` visar Raivis data.
5. Försök starta timer / rapportera tid → använder fortfarande ditt eget staff_id (verifieras i `time_reports.staff_id` om någon test-skrivning sker).
6. "Avsluta visningsläge" återställer omedelbart.
7. Logout rensar override.
8. Ingen icke-admin ser ens menyalternativet.

## Tekniska detaljer

**Filer som rörs**
- `src/contexts/MobileAuthContext.tsx` — utökas med viewAs-state + admin-roll-fetch + `effectiveStaffId`/`useRealStaffId`.
- `src/hooks/useMobileStaffDayReport.ts` — `staff?.id` → `effectiveStaffId`.
- `src/hooks/useStaffDayStatusViaMobileReport.ts` — samma.
- Övriga read-hooks i `src/hooks/` och `src/components/mobile-app/` enligt grep — bytet är mekaniskt.
- `src/components/mobile-app/HeaderShell` (eller motsv. `MobileHeader`) — view-as-badge.
- `src/pages/mobile/MobileSettings.tsx` (eller motsv.) — väljare-UI.
- Ny liten komponent `src/components/mobile-app/ViewAsPicker.tsx`.

**Edge function (endast om JWT-läge inte räcker)**
- `supabase/functions/_shared/staff-auth.ts` — i mobile-token-grenen lägga till acceptans av `actingAsStaffId` när underliggande staff har admin-rollen i samma org. Annars 403. Default av: ingen ändring förrän vi vet att JWT-läget inte räcker för dig.

**Persistens**
- `localStorage["mobile.viewAsStaffId.v1"]` = `{ id, name, setAt }`.
- Inget i databasen.

**Test**
- Manuell verifiering enligt acceptance criteria 1–8.
- Snabb regress: kör `bash scripts/test-time-reporting.sh` för att säkra att skrivvägarna inte tagit fel staff_id.

## Tidsåtgång

Ca 30–45 min implementationstid. Helt reversibelt — ta bort `viewAs`-state och hooks faller tillbaka till `staff.id`.
