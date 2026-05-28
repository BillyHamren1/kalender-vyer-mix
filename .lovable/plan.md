
# Ett tidrapportsflöde — WeekFlow i både Tid & Lön och appen

Mål: GPS-förslag → WeekFlow → admin & app visar SAMMA → personal submitar → `staff_day_submissions` (submitted) → admin attesterar → båda visar "Attesterad". Inga skrivningar till `time_reports/workdays/location_time_entries/travel_time_logs/day_attestations`.

## 1. App: gör WeekFlow till huvudvy på `/m/report`

**`src/features/mobile-time-v2/MobileTimeV2Page.tsx`**
- Rendera `WeekFlowMobilePanel` istället för `MobileTimeReportQueue`.
- Behåll auth-guarden.

`MobileTimeReportQueue`, `MobileDayReportPreview`, `ManualWorkSegmentsEditor`, `submit-mobile-gps-day-v2`, `get-mobile-gps-day-view` får ligga kvar (sheet-granskningen återanvänds nedan), men inte längre vara huvudvy.

## 2. `WeekFlowMobilePanel` öppnar dag i sheet (ingen `/m/day-review`-navigering)

**`src/components/mobile-app/time/WeekFlowMobilePanel.tsx`**
- Ta bort `navigate('/m/day-review?date=…')`.
- Lägg in ett internt `Sheet` som öppnas på `onSubmit(date)`. Sheet återanvänder `getMobileGpsDayView` + `MobileDayReportPreview` + `ManualWorkSegmentsEditor` + `submitMobileGpsDayV2` (precis som `MobileTimeReportQueue` gör idag — extrahera en liten `<DayReviewSheet date staffId onClose onSubmitted />` om enklare).
- `onOpenGps` får ligga kvar som "Öppna GPS"-länk till `/m/gps?date=…` om sådan finns, annars dölj knappen i mobilvyn.
- Efter lyckad submit: invalidera `staff-time-flow-submissions`-querykey så kortet flippar till "Väntar godkännande" direkt.

`/m/day-review`-redirecten i `App.tsx` + `TimeAppShell.tsx` lämnas orörd (används inte längre av WeekFlow, bara av legacy stale-reminder).

## 3. Admin: rätt länk till GPS-satellitkarta

**`src/components/staff-time/StaffTimeWeeklyGpsReportContent.tsx`** rad 60:
```
navigate(`/staff-management/gps-satellite-map?staffId=${staffId}&date=${date}`)
```

## 4. Stockholm-tid på rapportrader

**`src/components/staff-time/week-flow/WeekFlowDayCard.tsx`** rad 149:
- Importera `formatStockholmHm` från `@/lib/staff/formatStockholmTime`.
- Byt `r.startIso.slice(11,16)` → `formatStockholmHm(r.startIso)`, motsvarande för end.

## 5. Veckolabel mån–sön

**`src/components/staff-time/week-flow/WeekFlowHeader.tsx`** rad 43:
- `const weekEnd = addDays(weekStart, 6)` → `…${format(weekEnd, "d MMM")}`.

## 6. Begär komplettering — kommentar synlig i app

`WeekFlowDayCard` visar redan `day.reviewComment` när `status === "correction_requested"`. Säkerställ att:
- `update-staff-day-submission-status` skriver `review_comment` (verifiera i edge function).
- `useStaffTimeWeekFlow` selectar redan `review_comment` ✓.
- App-sheet (punkt 2) visar `day.reviewComment` överst när status = correction_requested, så personalen ser orsaken innan re-submit.

## 7. Approval-renhet (ingen skrivning till legacy)

Verifiera i `supabase/functions/update-staff-day-submission-status/index.ts` att den ENDAST uppdaterar `staff_day_submissions` (status, reviewed_at, reviewed_by, review_comment). Inga inserts i `time_reports/workdays/location_time_entries/travel_time_logs/day_attestations`. Om sådan kod finns: ta bort.

## 8. Contract-tester (`src/lib/staffTimeFlow/__tests__/` + `src/components/staff-time/__tests__/`)

Nya/uppdaterade tester:

1. **`mobileTimeV2.routing.test.tsx`** — `MobileTimeV2Page` renderar `WeekFlowMobilePanel`, inte `MobileTimeReportQueue`, som default.
2. **`weekFlowMobilePanel.test.tsx`** — innehåller inte strängen `/m/day-review`; öppnar sheet istället; använder `useStaffTimeWeekFlow`.
3. **`adminGpsLink.test.tsx`** — `StaffTimeWeeklyGpsReportContent` länkar till `/staff-management/gps-satellite-map`.
4. **`weekFlowDayCard.format.test.tsx`** — radtider renderas via `formatStockholmHm` (DST-säkert; testa en sommar- och en vinter-ISO).
5. **`weekFlow.status.test.ts`** — `mapDbStatusToFlow`: submitted/edited/needs_control/ai_flagged/needs_user_attention → submitted_waiting_approval; approved/payroll_approved → approved; correction_requested → correction_requested.
6. **`weekFlowHeader.label.test.tsx`** — visar mån–sön (7 dagars span), inte mån–mån (8 dagar).
7. **`approvalWritePath.contract.test.ts`** — statisk grep: `update-staff-day-submission-status/index.ts` innehåller inga `from('time_reports'|'workdays'|'location_time_entries'|'travel_time_logs'|'day_attestations')`.
8. **`weekFlowSharedHook.test.ts`** — både admin-vy och `WeekFlowMobilePanel` importerar `useStaffTimeWeekFlow` (statisk grep).

## 9. Slutrapport (efter implementation)

- `/m/report` → `MobileTimeV2Page` → `WeekFlowMobilePanel` (samma `useStaffTimeWeekFlow` + `WeekFlowDayCard` som admin).
- Submit i appens sheet → `submitMobileGpsDayV2` → `staff_day_submissions` (submitted/edited).
- Admin attest → `update-staff-day-submission-status` → samma rad (approved). Inga legacy-skrivningar.
- "Öppna GPS" i admin → `/staff-management/gps-satellite-map`.
- Radtider via `formatStockholmHm`.

## Det här rörs INTE

- DB-schema, RLS, edge-funktionernas API-kontrakt.
- `time_reports / workdays / location_time_entries / travel_time_logs`.
- `MobileTimeReportQueue` och dess hjälpfiler — finns kvar som legacy, men inte default.
- GPS-pipelinen / `useStaffGpsWeekSummary`.
