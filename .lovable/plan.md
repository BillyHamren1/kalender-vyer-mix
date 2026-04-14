

## Problem

The daily overview (map, routes, geolocations, timeline) exists as `DailyOverviewDialog` and is triggered by a tiny Eye icon on each individual report row. This makes it nearly invisible. The user expects a prominent, easy-to-find daily overview when looking at a staff member's time reports.

## Plan

### 1. Group rows by date with a clickable date header

Instead of showing a flat list of rows with tiny eye icons, group the table rows by date. Each date becomes a clickable header row that opens the DailyOverviewDialog for that day.

- Add a date-grouping step in `StaffTimeReportDetail` that groups `reports` by `report_date`
- Render a bold, clickable date header row (spanning full width) for each group, with a Map/Eye icon and anomaly warning
- Individual report rows sit underneath their date header
- Clicking the date header opens the `DailyOverviewDialog` for that date

### 2. Add a prominent "Dagöversikt" button in the summary area

Add a visible button/card above the table that says "Välj ett datum för dagöversikt" or, if there's data for today, a quick-access button for today's overview.

### 3. Keep existing DailyOverviewDialog as-is

The dialog component itself is solid — map with routes, timeline, geolocations, summary cards. No changes needed there.

### Files to modify

- `src/components/staff/StaffTimeReportDetail.tsx` — Restructure table to group by date with clickable date headers, remove per-row Eye icon (redundant), add prominent date-click interaction

