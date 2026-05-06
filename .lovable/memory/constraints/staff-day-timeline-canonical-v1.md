---
name: StaffDayTimeline canonical UI model
description: Tunn fasad src/lib/staff/staffDayTimeline.ts (buildStaffDayTimeline) är kanonisk UI-modell för admin-tidrapportering; rådata=audit/bevisning
type: constraint
---

# StaffDayTimeline — kanonisk UI-modell

**Beslut (2026-05-06):** Huvudvyn för admin-tidrapportering visar EN sak: `StaffDayTimeline`. Råa tabeller (`location_time_entries`, `time_reports`, `travel_time_logs`, `assistant_events`, GPS, repair/watchdog) får finnas kvar som **input/bevisning** — men aldrig som huvudobjekt i UI.

## Kanonisk modell

`src/lib/staff/staffDayTimeline.ts` exporterar `buildStaffDayTimeline()`:

```ts
StaffDayTimeline {
  staff_id, staff_name, date,
  workday_start, workday_end,
  status: 'no_workday' | 'open' | 'closed' | 'review_required',
  payable_minutes,
  segments: StaffDaySegment[],
  review_required, review_count,
}

StaffDaySegment.kind ∈ project | travel | warehouse | break | other | unknown
```

## Arkitektur

- **Tunn fasad** ovanpå `buildActualStaffDayModel` + `buildDayBlockTimeline`.
- Pure / UI-agnostic. Bygger ALDRIG nya fakta — bara projicerar.
- Mappning:
  - PresenceBlock(project) → `project` (payable)
  - PresenceBlock(location) → `warehouse` (payable)
  - PresenceBlock(unknown) → `unknown` (review, ej payable)
  - JourneyBlock → `travel` (payable, label="Resa")
  - GapBlock → `unknown` (review, ej payable)
- `payable_minutes` = summan av project + warehouse + travel.
- `review_count` = unresolved workday_flags + proposedReport.anomalies + segment.reviewRequired.

## Regler

- Ny admin-UI för tidrapportering (StaffTimeReportsList, StaffTimeReportDetail) ska konsumera `StaffDayTimeline`, inte rå-tabeller.
- "Bevisning/Audit"-vyer som vill visa rå-events öppnas separat och läser `ActualStaffDayModel` direkt.
- Kontraktet låst av `src/lib/staff/__tests__/staffDayTimeline.contract.test.ts`. Ändra inte fältset utan att uppdatera konsumenter.
- Etapp 1 (modell + tester) klar 2026-05-06. UI-migration (StaffTimeReportsList + Detail) görs i separat etapp.
