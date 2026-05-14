
## Problem (det du ser i bilden)

Kristaps har:
- header **"0h arbete"** (= ingen `time_report`, ingen `location_time_entry`, ingen workday som körs)
- men ett **block 00:01–01:58 "FA Warehouse"** med badge **"Planerat: Team…"**

Vi har bekräftat i DB:
- `time_reports` 2026-05-13 för Kristaps: **inga rader**
- `location_time_entries` 2026-05-13 för Kristaps: **inga rader**
- `staff_location_history` 2026-05-13: **851 pings**, senaste **00:10:58 UTC** (≈ 02:10 lokal)

Alltså: ingenting "fortsätter" i backend. Det är inte en aktiv timer. Det som händer är att **Time Engine bygger ett candidate-block av nattens GPS-pings vid FA Warehouse** och Gantt-vyn ritar det som ett vanligt arbetsblock — fast policyn redan säger att natt 00:00–05:00 inte får trigga arbete utan starkare bevis.

Det finns alltså ett glapp:
- `nightPolicy` (timePolicy.ts) blockerar bara **auto-start av timer**.
- `clampBlocksToDayEndDecision` / `buildReportDisplayBlocks` filtrerar **inte** nattliga GPS-only-block ur display-lagret.
- `resolveActualLocationTargetForBlock` hanterar bara label-prioritet, inte om blocket alls ska visas.

Resultat: blocket växer (eller återskapas) i takt med att nya nattpings kommer in, ända tills 05:00. Det är det du upplever som "fortsätter".

## Mål

Spegla `Night Auto-Start Guard` i UI-lagret för `/staff-management/time-reports`:

- Mellan **00:00–05:00 lokal tid** får ett candidate-block **inte** ritas som "Arbete" om det inte är uppbackat av:
  - aktiv/avslutad `location_time_entry` som täcker tiden, ELLER
  - `time_report` (även `pending`/`approved`), ELLER
  - manuell user_timer-källa, ELLER
  - workday som faktiskt startades av användaren (inte auto).

Sådana block ska antingen:
- döljas helt från huvudvyn och flyttas till "Råvy / GPS-detalj" (samma princip som `timelineVisibility.ts` redan har för `private_background`/`raw_detail`), ELLER
- renderas som en dämpad "GPS-spår (natt) – ej rapporterat" rad utan minutsumma, så det inte ser ut som att tid ackumuleras.

Header **"Xh arbete"** ska aldrig räkna in dessa nattliga GPS-only-block (verifierat att den redan visar 0h här, så summeringen är OK — det är bara renderingen av blocket som ljuger).

## Ändringar (frontend / derive only — ingen DB, ingen edge function)

### 1. Ny pure helper: `src/lib/staff/nightGpsOnlyGuard.ts`
Input: ett `ReportCandidateBlockUI` + presence-signaler för dagen.
Logik:
- `isNightWindow(startAt, endAt)` = någon del av blocket ligger i 00:00–05:00 Europe/Stockholm.
- `hasHardEvidenceForBlock(block, presence)` = blocket överlappar tidsmässigt med:
  - `actualStaffDayModel` time_report-rad, ELLER
  - `location_time_entries`-rad, ELLER
  - workday som startats av `user_timer` (ej `geofence`/`auto`), ELLER
  - manuell scan/ankomst-kvittens.
- `classifyNightGpsOnly(block, presence)` → `'main' | 'raw_only_night_gps'`.

Ren, unit-testbar. Inga DB-kall.

### 2. `StaffGanttView.tsx` (`blocksFromStaff`)
- Innan `processBlock` kör vi `classifyNightGpsOnly`.
- `'raw_only_night_gps'`-block:
  - **render i huvud-Gantt**: dämpad rad ("GPS – natt, ej rapporterat"), ingen `durationMinutes` i summering, klickbar för att öppna detalj/raw-vy.
  - räknas inte in i `work`/`live`-totals.
  - filter "Planerade utan rapport" påverkas inte.
- Lägg till en diagnostik-rad i `labelDiagnostics`: `nightGpsOnlySuppressedCount`.

### 3. `dayMetrics.ts` / `workPresence.ts`
- Säkerställ att `0h arbete`-summan exkluderar `raw_only_night_gps` (verifiera, kan redan vara fallet — annars samma guard).

### 4. `timelineVisibility.ts`
- Lägg till `reason_hidden: 'night_gps_only_no_report'` så Råvy:n kan visa varför blocket finns kvar där.

### 5. Tester
- `src/lib/staff/__tests__/nightGpsOnlyGuard.test.ts`:
  - 00:01–01:58 GPS-only på warehouse, ingen LTE/TR → suppressed.
  - 00:01–01:58 men har LTE startad av user_timer → visas normalt.
  - 04:30–06:30 (spänner natt+dag), ingen LTE → split: nattdelen suppressed, morgon kvar.
  - 12:00–13:00 (helt utanför natt) → orört.
- Snapshot-test för Kristaps-scenariot 2026-05-13.

## Det vi medvetet INTE rör

- Ingen DB-migration.
- Ingen ändring i edge functions, GPS-pipeline, `buildGpsDayTimeline`, `resolveWorkTargets`, `nightPolicy` eller cache.
- Inga `time_reports`/`location_time_entries` skapas eller raderas.
- `resolveActualLocationTargetForBlock` (steg 3.8) lämnas orörd — natt-guarden körs FÖRE den så att engine-target/planning-prioriteten är opåverkad för dag-block.
- Planeringsbadgen ("Planerat: Team 1") försvinner inte i sig — den göms bara tillsammans med blocket när hela blocket flyttas till Råvy:n.

## Rapport efter implementation

A. Filer som ändrats + ny helper
B. Före/efter för Kristaps 2026-05-13: blocket 00:01–01:58 ska försvinna från huvudvyn, finnas kvar i Råvy:n
C. Verifiering att header "0h arbete" är oförändrad (ingen tid räknades ändå)
D. Tester gröna (`bunx vitest run nightGpsOnlyGuard`)
E. Lista övriga staff/dagar i samma org där natt-block försvann
