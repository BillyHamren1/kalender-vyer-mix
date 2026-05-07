---
name: Time Page Snapshot-Only
description: Time-sidans tre tabbar (Idag/Kalender/Tidrapport) får ENDAST läsa färdiga backend-snapshots — appen får aldrig summera tid lokalt från råtabeller
type: constraint
---

# Time Page — Snapshot-Only Authority

Backend/dagmotorn äger sanningen om tid. Time-appen är en ren visningsklient.

## Tillåtna källor per tabb

| Tabb        | Hook / Edge Function                                  |
|-------------|--------------------------------------------------------|
| Idag        | `useStaffDayStatus()` → `get-staff-day-status`        |
| Dagdetalj   | `useStaffDaySnapshot(date)` → `get-staff-day-status`  |
| Kalender    | `useStaffMonthStatus(month)` → `get-staff-month-status` |
| Tidrapport  | `useStaffTimeReportPeriod(period)` → `get-staff-time-report-period` |

## Förbjudet i Time-appen (komponenter, hooks, sidor under src/pages/mobile + src/components/mobile-app/time)

Får INTE läsa eller summera direkt från:
- `workdays`
- `time_reports`
- `travel_time_logs`
- `location_time_entries`
- `assistant_events`
- `workday_flags`
- GPS-rådata (location pings, geofence events)

## Tillåtna åtgärder i appen

1. Hämta snapshot via godkänd hook
2. Rendera snapshot-fält direkt
3. Trigga refetch (focus, realtime postgres_changes som ren signal, manuell pull)
4. Skicka användaråtgärder till backend (bekräfta okänd vistelse, avsluta arbetspass, klassificera flagga, godkänna dag) — backend skriver, snapshot återhämtas

## Om snapshot saknar fält

Bygg ut respektive Edge Function (`get-staff-day-status` / `get-staff-month-status` / `get-staff-time-report-period`) och dess shared module under `supabase/functions/_shared/`. Lägg ALDRIG kompenserande summering i UI-lagret.

## Why
Sanningen om arbetstid måste vara identisk i mobil, admin, lön och rapporter. Lokal summering ger drift mot dagmotorns regler (workdayPolicy, planning-vs-actual, gap-derived travel etc.) och blir omöjlig att hålla i synk.
