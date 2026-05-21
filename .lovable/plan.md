
# Mobil tidrapport = 1:1-spegel av GPS-karta-vyn

Mål: det användaren ser på `/staff-management/gps-satellite-map` (vecka, dag-för-dag, projekt med exakt geofence-tid) ska visas identiskt i mobilappens TIME-sida. Plus: minikarta per dag, mobilattest, redigering med bekräftelse, obligatorisk rast, och adminnotis när dag är inskickad.

Allt följer `time-page-snapshot-only-v1` — UI summerar inte själv, det läser från snapshot-edge functions.

---

## 1. Mobil veckovy (ersätter dagens månads-default)

**Fil:** `src/components/mobile-app/time/TimeReportTab.tsx`

- Sätt veckovy som default (`kind = 'week'`).
- `PeriodView` (vecka) byter ut `UserDayList` mot ny `MobileWeekDayList`-komponent som matchar `StaffGpsDayRow`:
  - Per dag: veckodag + datum, `firstIso–lastIso`, total `durationMin`.
  - Per projekt under dagen: punkt + namn + duration (t.ex. `Swedish game fair 6h 49m`).
  - "—" på dagar utan data, "Endast hemma" om bara hemzon.

**Datakälla:** `get-staff-time-report-period` returnerar redan `days[]` med totals. Bygg ut shapet i den edge functionen (`supabase/functions/get-staff-time-report-period/index.ts` + `_shared`) så `days[].places[]` finns med samma fält som GPS-vyn (`name`, `minutes`, `firstIso`, `lastIso`). All summering sker server-side.

---

## 2. Minikarta per dag

**Ny:** `src/components/mobile-app/time/DayMiniMapDialog.tsx`

- Liten kartikon (📍 Map-pin) längst till höger i varje dagrad.
- Klick → bottom-sheet/dialog som renderar `RawGpsSatelliteMap` för (`staffId`, `date`) — samma komponent som adminvyn redan använder.
- Återanvänd `useStaffGpsPingsForDay`, `useDayKnownSites`, `useAllActiveProjectGeofences`, `buildExactGeofenceVisits` (inga nya hooks). Mobilen blir read-only (ingen geofence-redigering).

---

## 3. Inskicknings-knapp + obligatorisk rast

**Filer:** `src/components/mobile-app/time/StaffDayDetailSheet.tsx`, `StaffDaySubmitSection.tsx`

- I dagdetalj-sheet: en tydlig primärknapp **"Skicka in dagen"** längst ned (finns i grunden — vässa CTA, ikon, sticky).
- **Rast-gate:** innan submit POSTas, kontrollera `snapshot.totals.breakMinutes`. Om 0 och `grossWorkdayMinutes > 5h` → öppna `BreakRequiredDialog` (ny) med input "Hur lång rast tog du?" (15/30/45/60/anpassad). Submit-knappen är disabled tills rast finns eller användaren explicit valt "Ingen rast" (kräver fritextkommentar).
- Rast sparas via befintliga edit-vägen (`validate-staff-day-edits` → `applyUserEditsToDisplayTimeline`) som ett `break`-segment.

---

## 4. Redigera tider med bekräftelse

**Fil:** `src/components/mobile-app/time/BlockEditDialog.tsx`

- Idag finns dialogen — lägg till ett extra `ConfirmStep` innan PATCH skickas:
  > "Är du säker på att du vill ändra registrerad tid? Originaltiderna sparas i historiken."
- Visa diff (gammal start/slut → ny start/slut). Bekräfta = `validate-staff-day-edits` med `confirmedByUser: true`.

---

## 5. Admin-notis när dag är inskickad

**Filer:**
- `src/components/staff/StaffDayReportsList.tsx` / `StaffDayReportRow.tsx` (admin-listan)
- `src/components/staff/StaffDaySubmissionStatusBadge.tsx` (finns)

- I admin-veckovyn (samma struktur som GPS-veckopanelen): visa en pulserande prick/ikon (Bell) bredvid datumet när `staff_day_submissions.status = 'submitted'` och inte ännu attestad.
- Klick → öppnar dagdetalj med "Godkänn"-knapp (befintlig `StaffDayAttestSection` → `attest-staff-day`).

---

## 6. Sparlogik vid attest

Inga schemaändringar — `attest-staff-day` skriver redan:
- Lås `staff_day_submissions.status = 'approved'`.
- `time_reports` per projekt-block (lönerapport & projektkostnad — drivs av `buildProjectLaborBasis`/`buildProjectTimeSummary`).
- Visas direkt på projektets ekonomi/tidssida + personens egen tidrapport.

Verifiera (test) att approval gör att samma timmar dyker upp i:
- `get-project-time-summary` för respektive projekt.
- `get-staff-time-report-period` (status `approved`).

---

## Filöversikt

**Ändra:**
- `src/components/mobile-app/time/TimeReportTab.tsx` — default week + ny dagrad-komponent
- `src/components/mobile-app/time/StaffDayDetailSheet.tsx` — gate för rast, tydlig submit
- `src/components/mobile-app/time/BlockEditDialog.tsx` — confirm-step
- `src/components/mobile-app/time/StaffDaySubmitSection.tsx` — rast-validering
- `src/components/staff/StaffDayReportRow.tsx` (eller motsv. veckovy) — bell-ikon för submitted
- `supabase/functions/get-staff-time-report-period/index.ts` + shared — lägg till `days[].places[]`

**Nya:**
- `src/components/mobile-app/time/MobileWeekDayList.tsx` (visuell spegel av `StaffGpsDayRow`)
- `src/components/mobile-app/time/DayMiniMapDialog.tsx`
- `src/components/mobile-app/time/BreakRequiredDialog.tsx`

**Tester:**
- `src/components/mobile-app/time/__tests__/MobileWeekDayList.test.tsx` — renderar samma siffror som GPS-veckopanelen för samma snapshot.
- `supabase/functions/get-staff-time-report-period/*_test.ts` — verifierar `days[].places[]`.
- `src/components/mobile-app/time/__tests__/submitGuards.test.tsx` — rast krävs > 5h.
- Befintlig kvalitetssvit: `bash scripts/test-time-reporting.sh`.

---

## Vad som INTE ändras

- Datakontrakt: Time-appen läser bara snapshots (`time-page-snapshot-only-v1`).
- Inga lokala summeringar i UI.
- Workday-systemet rörs inte (`no-workday-logic`).
- `Geofence Inside Time Authority` består — projekt-tid = tid inom geofence, "Boende" räknas inte.
