

## Problem

The `packing_projects` table has `start_date` and `end_date` columns, but there is no UI anywhere to edit them. The dates shown on the Warehouse Dashboard and PackingDetail come from the linked booking (`rigdaydate`, `eventdate`), and are read-only.

## Plan

### 1. Add date editing to PackingDetail page

Add a date section in the booking info area (lines ~315-348 of `PackingDetail.tsx`) that shows the packing's own `start_date` and `end_date` with inline date pickers (Popover + Calendar). When changed, update `packing_projects` directly via Supabase.

- Show two date pickers: "Startdatum" and "Slutdatum"
- Use the existing `Calendar` component with `pointer-events-auto` class
- On select, update `packing_projects.start_date` / `end_date` via Supabase
- Invalidate the packing query on success

### 2. Ensure `usePackingDetail` exposes start_date/end_date

The `fetchPacking` service function likely already fetches all columns. Verify the packing object includes `start_date` and `end_date` from the query. If not, add them to the select.

### 3. Update TypeScript types

Ensure the `Packing` type in `src/types/packing.ts` already has `start_date` and `end_date` — it does (lines 10-11).

### Files to modify

- `src/pages/PackingDetail.tsx` — Add inline date pickers for start/end date with Supabase update
- `src/services/packingService.ts` — Verify `fetchPacking` includes start_date/end_date (may already work)
- Possibly `src/hooks/usePackingDetail.tsx` — Add a date update mutation if needed

### Technical notes

- Calendar component must use `className="p-3 pointer-events-auto"` inside Popover
- Dates stored as `date` type (YYYY-MM-DD) — use `format(date, 'yyyy-MM-dd')` for updates
- No migration needed — columns already exist

