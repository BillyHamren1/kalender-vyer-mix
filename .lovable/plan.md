## Problem

Time-appens IDAG-vy visar "Arbetsdag avslutad 17:18 → 01:26 · 56h 8m" och ett gult "Annan plats · BEHÖVER GRANSKNING"-block. Datat kommer inte från Time Engine-cachen — det kommer från legacy-snapshoten `get-staff-day-status` som fortfarande summerar gamla, ostängda `workdays` / `time_reports` / `location_time_entries` per personal.

I föregående steg ("Time App 1") byggde vi:
- `useMobileStaffDayReport` (frontend-hook)
- `get-mobile-staff-day-report` (edge function, läser `staff_day_report_cache`)
- `submit-staff-day-v3` (skriver `staff_day_submissions`)

…men **kopplade aldrig in dem** i appen. `TodayTab.tsx`, `TimeReportTab.tsx` och `StaffDayDetailSheet.tsx` läser fortfarande `useStaffDayStatus`. Därför slår ingen av Time Engine-reglerna igenom (night-guard, dedup, cache-trunkering osv.) — och spökdata visas.

## Mål

Time-appens dagvy ska bygga 1:1 på samma `staff_day_report_cache`-snapshot som adminwebbens dagvy. Inga lokala summeringar, ingen legacy-fallback i UI.

## Scope (denna iteration)

Endast frontend-omkoppling i Time-appens tre läsande komponenter. Ingen ändring av:
- Time Engine-regler
- staff_day_report_cache-strukturen
- Edge functions (get-mobile-staff-day-report / submit-staff-day-v3 oförändrade)
- Skrivvägar (mobile-app-api för time_reports lever kvar)
- UI-design / texter

Inget raderas. Legacy `useStaffDayStatus` lever kvar tills även `EndDayButton` och övriga skrivflöden är portade i kommande steg.

## Ändringar

### 1. `src/components/mobile-app/time/TodayTab.tsx`
Byt datakälla:
- Ut: `useStaffDayStatus()` → snapshot/segments/totals/workday/active/actionsNeeded
- In: `useMobileStaffDayReport()` → samma fält men från cachen (mappade i `mapReportBlocksToSegments`)

Adapter-lager i toppen av filen som översätter `MobileDayReport` → samma form som `StaffDaySnapshot` (workday, totals, segments, active, actionsNeeded). Inga ändringar i renderingskoden under adaptern. EndDayButton behåller sin nuvarande prop-form.

### 2. `src/components/mobile-app/time/TimeReportTab.tsx`
Samma byte: `useStaffDayStatus(date)` → `useMobileStaffDayReport(date)`. Period-aggregering (`get-staff-time-report-period`) behålls oförändrad i denna iteration — bara dagvyn flyttas.

### 3. `src/components/mobile-app/time/StaffDayDetailSheet.tsx`
Samma byte: `useStaffDayStatus(date)` → `useMobileStaffDayReport(date)`.

### 4. Sanity-guard mot spöksegment
I `mapReportBlocksToSegments` (server) och i adaptern (klient): släpp inte igenom segment vars varaktighet > 18 h eller där `endedAt < startedAt + 18h` saknas — logga som diagnostic men rendera dem inte som "Annan plats". Detta hindrar att en eventuell framtida ostängd cache-rad skapar samma spökeffekt.

### 5. Verifiering
1. Öppna /m/report som personalen i screenshoten → bekräfta att 56h-blocket är borta.
2. Curla `get-mobile-staff-day-report` för samma datum → bekräfta vad cachen faktiskt innehåller.
3. Jämför sida vid sida med adminwebbens dagvy för samma personal/datum.
4. Inga konsolfel; inga nätverksanrop till `get-staff-day-status` från `/m/report`-routen.

## Tekniska detaljer

```text
Före:
  TodayTab ──► useStaffDayStatus ──► get-staff-day-status ──► live-summera time_reports/workdays/LTE
                                                              (visar 56h "Annan plats")

Efter:
  TodayTab ──► useMobileStaffDayReport ──► get-mobile-staff-day-report ──► staff_day_report_cache (Time Engine)
                                                                          → mapReportBlocksToSegments
                                                                          → samma data som adminwebben
```

Adapterns ansvar i TodayTab:
- `snapshot.workday` ← cache.workday (isOpen, startedAt, endedAt, statusLabel)
- `snapshot.totals` ← cache.totals (grossWorkdayMinutes, breakMinutes, payableMinutes per kind)
- `snapshot.segments` ← cache.blocks via mapReportBlocksToSegments
- `snapshot.active` ← cache.activeTimer
- `snapshot.actionsNeeded` ← cache.actionsNeeded

## Out of scope

- AI / unclear segment-flöden
- Skapa/skriva time_reports / LTE / travel
- Period-vyn (Tidrapport-tabben på vecka/månad)
- UI-redesign
- Borttagning av `useStaffDayStatus` (sker när alla läsare är portade)
