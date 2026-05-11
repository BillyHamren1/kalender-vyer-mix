## Time App single source — plan

### 1. Kartläggning (resultat)

**Renderingskedja `/m/report`:**
- `src/pages/mobile/MobileTimeReport.tsx` (65 r) → wrappar `MobileTimeTabs`
- `MobileTimeTabs.tsx` → tabbar: `TodayTab`, `TimeReportTab`, `TimeCalendarTab`
- Detaljerad dagsvy: `StaffDayDetailSheet.tsx` (499 r)
- Inskick/attest: `StaffDayAttestSection.tsx` (395 r)

**Hooks idag:**
- `useStaffDayStatus` → kallar `get-staff-day-status`
- `useStaffDaySnapshot` (309 r) → bygger segments lokalt från legacy-tabeller
- `useStaffTimeReportPeriod` (270 r) → kallar `get-staff-time-report-period`

**Edge functions idag:**
- `get-staff-day-status` (313 r) — läser `workdays`, `time_reports`, `travel_time_logs`, `location_time_entries`, `day_attestations`, `assistant_events`, `staff_location_history`
- `get-staff-time-report-period` (110 r) — summerar samma legacy
- `attest-staff-day` (177 r) — skriver `day_attestations`

**Var segment/totaler skapas idag:** allt klientside i `useStaffDaySnapshot` + edge functionen ovan. Det är detta som ska bytas mot cache-mappning.

### 2. Ny endpoint: `get-mobile-staff-day-report`

Ny edge function som läser:
- `staff_day_report_cache` (rad för `staff_id` + `date`, senaste `engine_version`)
- `staff_day_submissions` (om finns)
- `workdays` (endast för `workdayStatus`/live-flagga, inte för rapport)

Returnerar:
```ts
{
  date, staffId, engineVersion, cacheStatus: 'ready'|'missing'|'stale'|'error',
  workdayStatus: 'inactive'|'active'|'ended',
  summary: { workMinutes, travelMinutes, breakMinutes, reviewMinutes, payableMinutes },
  segments: MobileSegment[],   // mappat från report_candidate_blocks_json/display_blocks_json
  actionsNeeded: ActionItem[], // härlett från diagnostics_json + summary
  submission: { status, requestedStartAt, requestedEndAt, breakMinutes, comment, submittedAt } | null,
  trackingPolicy: { ... } | null,
  lastUpdatedAt
}
```

`MobileSegment` precis enligt spec (id, kind, label, startedAt, endedAt, durationMinutes, isActive, confidence, statusLabel, warningLabel, projectId, bookingId, largeProjectId, locationId, sourceBlockId).

Mappare ligger i `supabase/functions/_shared/mobile/mapReportBlocksToSegments.ts` så samma logik kan testas.

### 3. Ny tabell: `staff_day_submissions` (migration)

```sql
create table public.staff_day_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id text not null,
  date date not null,
  status text not null default 'submitted', -- submitted|approved|rejected|correction_requested
  requested_start_at timestamptz,
  requested_end_at timestamptz,
  break_minutes int default 0,
  comment text,
  engine_version text,
  source_summary_json jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, date)
);
-- RLS: org-isolerat, läs egen rad, ingen direkt insert (via edge function service-role)
```

### 4. Ny edge function: `submit-staff-day-v3`

Input: `{ staffId, date, requestedStartAt, requestedEndAt, breakMinutes, comment }`.
Skriver upsert i `staff_day_submissions`. Skriver INTE `day_attestations`/`time_reports`/`workdays`/`location_time_entries`/`travel_time_logs`.

### 5. Ny hook: `src/hooks/useMobileStaffDayReport.ts`

- React Query, key `['mobile-staff-day-report', staffId, date]`
- Anropar `get-mobile-staff-day-report` via `callStaffSnapshotFunction` (dual auth)
- Polling 30 s när tab är synlig
- Lyssnar på Supabase realtime: `staff_day_report_cache` + `staff_day_submissions` filtrerat på staff/date
- Vid `cacheStatus === 'missing'` exponerar `refresh()`-knapp som kallar samma endpoint med `force=true`

### 6. Omkoppling av komponenter

| Komponent | Idag | Efter |
|---|---|---|
| `TodayTab.tsx` | `useStaffDayStatus` + `useStaffDaySnapshot` (segments lokalt) | `useMobileStaffDayReport` (segments från cache). Behåller start/stopp dag via befintlig active-timer/workday-väg |
| `StaffDayDetailSheet.tsx` | `useStaffDaySnapshot` | `useMobileStaffDayReport(date)` — samma segments/totaler/actions |
| `TimeReportTab.tsx` | `useStaffTimeReportPeriod` (legacy summering) | Bygg om `get-staff-time-report-period` så den summerar `staff_day_report_cache` + `staff_day_submissions` per dag i intervallet. Hooken behåller signaturen |
| `StaffDayAttestSection.tsx` | `attest-staff-day` → `day_attestations` | `submit-staff-day-v3` → `staff_day_submissions` |

`useStaffDaySnapshot` blir oanvänd i tidrapportvyn men raderas inte (kan finnas debug-konsumenter). Markeras `@deprecated`.

Live-arbetsdagsknappar (Starta/Avsluta dag) fortsätter använda befintlig workday/timer-väg — endast presentation/summering bytes.

### 7. UI-omfång

Ingen visuell polish. Befintliga kort/listor återanvänds, bara datakällan byts. Tomt-läge `cacheStatus='missing'` visar "Rapporten bearbetas" + "Uppdatera".

### 8. Tester

- Deno-test för `mapReportBlocksToSegments` (cache → MobileSegment)
- Vitest-stub för `useMobileStaffDayReport` (cache_missing → refresh-knapp)
- Manuell verifiering: jämför `summary` i mobil mot adminwebbens `/staff-management/time-reports` för samma staff+datum

### 9. Slutrapport (efter implementation)

"Time App single source – rapport" enligt spec, inkl. mapping cache→mobile och bekräftelse att appen inte längre summerar legacy eller skriver `day_attestations`.

### Tekniska detaljer

- Authstrategin: ny endpoint accepterar både mobile token och Supabase JWT via `_shared/staff-auth.ts` (samma som övriga snapshot-endpoints — se memory `staff-snapshot-dual-auth-v1`).
- Multi-tenancy: cache-rad och submission filtreras alltid på `organization_id` (RESTRICTIVE RLS + edge-function-guard).
- File size: ny edge function bryts i `index.ts` (handler) + `_shared/mobile/mapReportBlocksToSegments.ts` (mappning) + `_shared/mobile/buildMobileSnapshot.ts` (assemble) för att hålla filer små.
- Inga ändringar i Time Engine-regler, builders eller cache-skrivare.

### Ordning för implementation

1. Migration: `staff_day_submissions` + RLS
2. Shared mapper + buildMobileSnapshot
3. `get-mobile-staff-day-report` edge function
4. `submit-staff-day-v3` edge function
5. `useMobileStaffDayReport` hook
6. Koppla `TodayTab`, `StaffDayDetailSheet`
7. Skriv om `get-staff-time-report-period` att summera cache+submissions; behåll hook
8. Koppla `StaffDayAttestSection` till nya submit
9. Tester + slutrapport
