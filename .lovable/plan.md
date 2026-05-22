## Nästa steg — Rast-gate, bekräftelse vid redigering, admin-godkännande, tester

Bygger vidare på det som redan ligger (vecko-vy i mobilen med per-projekt-rader, mini-karta per dag, notifikations-prick i admin). Nu låser vi inskick + redigering och kopplar admin-godkännande till sparning mot tidrapport.

### 1. Obligatorisk rast vid inskick (mobil)
- Ny komponent `src/components/mobile-app/time/BreakRequiredDialog.tsx`
  - Öppnas från `StaffDaySubmitSection` när användaren trycker "Skicka in" och `snapshot.totals.breakMinutes === 0` och dagens brutto > 5h (återanvänd `BREAK_PROMPT_THRESHOLD_HOURS` från `src/utils/breakPolicy.ts`).
  - Snabbval 15 / 30 / 45 / 60 min + "Annat" (custom number) + "Ingen rast" (kräver fritextkommentar ≥ 10 tecken).
  - Submit disabled tills giltigt val finns.
- `StaffDaySubmitSection.tsx`: gate runt befintlig submit-mutation. Skickar `breakMinutes` + ev. `breakComment` med i `submit-staff-day` payload.
- Edge function `submit-staff-day`: ta emot och persistera `break_minutes` + `break_comment` på `staff_day_submissions` (migration nedan).

### 2. Bekräftelse-steg vid blockredigering (mobil)
- `BlockEditDialog.tsx`: lägg till ett `ConfirmStep` (samma sheet, andra vyn) som visar diff:
  - Före → Efter (start / slut / projekt-koppling / kommentar)
  - "Är du säker? Detta skickas till admin för godkännande."
- Spärr: om start/slut ändras > 60 min från originalet krävs kommentar (≥ 10 tecken) innan "Bekräfta" aktiveras.
- Original-värden bevaras redan i `UserEditPayload.previousValue` — ingen extra historik behövs.

### 3. Admin-godkännande sparar till tidrapport + projekt
- `StaffDayReportsList` / `StaffDayReportRow` har redan pulserande klocka. Lägg "Godkänn"-knapp direkt på raden (utöver detaljvyn) som kallar `useUpdateStaffDaySubmissionStatus({ status: 'approved' })`.
- Edge function `update-staff-day-submission-status`: när status blir `approved`
  - skriv/uppdatera `time_reports` per projekt utifrån snapshotens `places[]` (allokerade minuter per project/location/warehouse).
  - markera `staff_day_submissions.approved_at` + `approved_by`.
  - följer `Time Data Authority` (time_report = sanning) och `Single Timer Policy` (admin fördelar).
- Idempotent: re-approve uppdaterar samma rader (dedupe-key: staff_id + work_date + target).

### 4. Migration
```sql
ALTER TABLE staff_day_submissions
  ADD COLUMN IF NOT EXISTS break_minutes integer,
  ADD COLUMN IF NOT EXISTS break_comment text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;
```

### 5. Tester
- `src/components/mobile-app/time/__tests__/BreakRequiredDialog.test.tsx` — submit disabled utan val, "Ingen rast" kräver kommentar.
- `src/components/mobile-app/time/__tests__/BlockEditDialog.confirm.test.tsx` — > 60 min ändring kräver kommentar; diff visas korrekt.
- `supabase/functions/update-staff-day-submission-status/index.test.ts` — approval skriver time_reports per place, idempotent vid re-run.
- Kör automatiskt efter implementation: `bunx vitest run` + `supabase--test_edge_functions`.

### Filer som ändras / skapas
**Nya:** `BreakRequiredDialog.tsx`, två vitest-filer, en Deno-test.
**Ändras:** `BlockEditDialog.tsx`, `StaffDaySubmitSection.tsx`, `StaffDayReportRow.tsx`, `submit-staff-day/index.ts`, `update-staff-day-submission-status/index.ts`.
**Migration:** kolumner på `staff_day_submissions`.

### Vad som INTE ändras
- Time Engine / GPS-pipelinen.
- `Single Timer Policy`, `Time Data Authority`, `Geofence Inside Time Authority` — alla respekteras.
- Ingen ny workday-logik.