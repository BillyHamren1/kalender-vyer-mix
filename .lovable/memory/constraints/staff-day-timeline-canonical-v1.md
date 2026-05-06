---
name: StaffDayTimeline canonical UI model
description: Central byggare src/lib/time/StaffDayTimelineBuilder.ts producerar kanonisk StaffDayTimeline för all admin-tidrapportering; rådata=evidence
type: constraint
---

# StaffDayTimeline — kanonisk UI-modell + central byggare

**Beslut (2026-05-06):** Huvudvyn för admin-tidrapportering visar EN sak: `StaffDayTimeline`. Råa tabeller (`workday`, `time_reports`, `travel_time_logs`, `location_time_entries`, `assistant_events`, GPS, repair/watchdog) sparas som **input/evidence** — men aldrig som huvudobjekt i UI.

**Ingen UI-komponent får själv tolka råa tabeller.** Allt går via den centrala byggaren.

## Filer

- `src/lib/time/StaffDayTimelineBuilder.ts` — **CENTRAL byggare**. `buildStaffDayTimelineFromRaw(input)` tar råa tabellrader och returnerar en `StaffDayTimeline`. Detta är vägen som ALLA admin-vyer ska gå.
- `src/lib/staff/staffDayTimeline.ts` — Typer + `buildStaffDayTimeline(model, blocks)` (tunn fasad ovanpå `ActualStaffDayModel` + `DayBlockTimeline` för existerande integration).
- Kontraktstester:
  - `src/lib/time/__tests__/StaffDayTimelineBuilder.contract.test.ts` (12 tester)
  - `src/lib/staff/__tests__/staffDayTimeline.contract.test.ts` (11 tester)

## Modell

```ts
StaffDayTimeline {
  staff_id, staff_name, date,
  workday_start, workday_end, workday_suggested,
  status: 'no_workday' | 'open' | 'closed' | 'review_required',
  payable_minutes,
  segments: StaffDaySegment[],
  review_required, review_count,
  evidence: { workdayRowIds, timeReportIds, travelLogIds, locationEntryIds, assistantEventIds, notes },
}

StaffDaySegment.kind ∈ project | travel | warehouse | break | other | unknown
```

## Builder-regler

1. `workday.start/end` är HUVUDRAM för dagen.
2. Saknas workday MEN det finns starka signaler (timer/TR ≥10 min) ⇒ föreslå start/slut från första/sista signal, sätt `workday_suggested=true` + `review_required=true`.
3. Segments täcker dagen så gott det går — gap mellan presence blir `unknown`-segment, INTE fel.
4. Råa rader sparas i `evidence`. UI får aldrig bygga segments av dem.
5. Dedup: TR vinner över överlappande LTE. LTE med `reportedAsDistribution=true` skippas.
6. Subdivisions filtreras bort.
7. Travel utan destination eller utan approval ⇒ `reviewRequired=true`, ej payable.
8. Pure / UI-agnostic. Ingen DB. Ingen React.

## payable-mappning

- project + warehouse + travel (approved) = payable
- break + other + unknown + presence-only LTE = ej payable
- `payable_minutes` = summan över payable segments

## UI-konsumenter

Ny admin-UI (StaffTimeReportsList, StaffTimeReportDetail, AdminTimeReviewDashboard) ska konsumera `StaffDayTimeline` via `buildStaffDayTimelineFromRaw`. "Bevisning/Audit"-vyer som vill visa råa rader öppnas separat och slår upp via `evidence.*Ids`.
